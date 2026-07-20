import { dag, object, func, Service, Directory, File } from "@dagger.io/dagger"

const POSTGRESQL_VERSION = "16"
const TEMPORAL_VERSION = "1.31.0"
const TEMPORAL_ADMINTOOLS_VERSION = "1.31.0"
const TEMPORAL_UI_VERSION = "2.49.1"
const SPARQL_ENDPOINT = "http://sparql/sparql"

@object()
export class DcentQuest {
  @func()
  async temporal(source: Directory, runId: string): Promise<Service> {
    const scripts = source.directory("temporal/scripts")
    const dynamicConfig = source.directory("temporal/dynamicconfig")

    // Unique volume per run: every `dagger call` starts a fresh Temporal
    // Postgres, so no workflows/state linger across runs. Both exportDump and
    // temporalWithUi re-run the client themselves, so per-run isolation is
    // all we need (dump and up don't share stores).
    const pgData = dag.cacheVolume(`temporal-pg-data-${runId}`)

    const pg = dag
      .container()
      .from(`postgres:${POSTGRESQL_VERSION}`)
      .withEnvVariable("POSTGRES_PASSWORD", "temporal")
      .withEnvVariable("POSTGRES_USER", "temporal")
      .withMountedCache("/var/lib/postgresql/data", pgData)
      .withExposedPort(5432)
      .withEntrypoint([
        "/bin/sh",
        "-c",
        // pg_resetwal recovers from hard-shutdown corruption without data loss
        "pg_resetwal -f /var/lib/postgresql/data 2>/dev/null; " +
          "exec docker-entrypoint.sh postgres",
      ])
      .asService({ useEntrypoint: true })

    await dag
      .container()
      .from(`postgres:${POSTGRESQL_VERSION}`)
      .withServiceBinding("postgresql", pg)
      .withEntrypoint([])
      .withExec([
        "/bin/sh",
        "-c",
        "for i in $(seq 60); do pg_isready -U temporal -h postgresql && exit 0; done; exit 1",
      ])
      .sync()

    await dag
      .container()
      .from(`temporalio/admin-tools:${TEMPORAL_ADMINTOOLS_VERSION}`)
      .withServiceBinding("postgresql", pg)
      .withEnvVariable("POSTGRES_SEEDS", "postgresql")
      .withEnvVariable("POSTGRES_USER", "temporal")
      .withEnvVariable("SQL_PASSWORD", "temporal")
      .withEnvVariable("DB_PORT", "5432")
      .withDirectory("/scripts", scripts)
      .withExec(["/bin/sh", "/scripts/setup-postgres.sh"])
      .sync()

    const temporal = dag
      .container()
      .from(`temporalio/server:${TEMPORAL_VERSION}`)
      .withServiceBinding("postgresql", pg)
      .withEnvVariable("DB", "postgres12")
      .withEnvVariable("DB_PORT", "5432")
      .withEnvVariable("POSTGRES_USER", "temporal")
      .withEnvVariable("POSTGRES_PWD", "temporal")
      .withEnvVariable("POSTGRES_SEEDS", "postgresql")
      .withEnvVariable("BIND_ON_IP", "0.0.0.0")
      .withEnvVariable(
        "DYNAMIC_CONFIG_FILE_PATH",
        "config/dynamicconfig/development-sql.yaml",
      )
      .withDirectory("/etc/temporal/config/dynamicconfig", dynamicConfig)
      .withExposedPort(7233)
      .withEntrypoint([
        "/bin/sh",
        "-c",
        "while ! nc -z postgresql 5432 2>/dev/null; do sleep 1; done && " +
          // pg_isready is not available in this image, so we sleep briefly
          // to let Postgres finish crash recovery before Temporal connects
          "sleep 2 && " +
          "unset OTEL_EXPORTER_OTLP_TRACES_PROTOCOL && " +
          "exec /etc/temporal/entrypoint.sh start",
      ])
      .asService({ useEntrypoint: true })

    await dag
      .container()
      .from(`temporalio/admin-tools:${TEMPORAL_ADMINTOOLS_VERSION}`)
      .withServiceBinding("temporal", temporal)
      .withEnvVariable("TEMPORAL_ADDRESS", "temporal:7233")
      .withEnvVariable("DEFAULT_NAMESPACE", "default")
      .withDirectory("/scripts", scripts)
      .withExec(["/bin/sh", "/scripts/create-namespace.sh"])
      .sync()

    return temporal
  }

  @func()
  sparqlService(source: Directory): Service {
    const oxigraph = dag
      .container()
      .from("oxigraph/oxigraph:latest")
      .withExposedPort(7878)
      .asService({
        args: [
          "oxigraph",
          "serve",
          "--location",
          "/data",
          "--bind",
          "0.0.0.0:7878",
        ],
      })

    return dag
      .container()
      .from("nginx:alpine")
      .withMountedFile(
        "/etc/nginx/nginx.conf",
        source.file(".dagger/oxigraph.nginx.conf"),
      )
      .withServiceBinding("oxigraph", oxigraph)
      .withExposedPort(80)
      .asService()
  }

  async worker(
    source: Directory,
    temporal: Service,
    sparql: Service,
  ): Promise<Service> {
    return dag
      .container()
      .from("oven/bun:1.3")
      .withServiceBinding("temporal", temporal)
      .withServiceBinding("sparql", sparql)
      .withEnvVariable("TEMPORAL_ADDRESS", "temporal:7233")
      .withEnvVariable("SPARQL_ENDPOINT", SPARQL_ENDPOINT)
      .withEnvVariable("DATASET_PATH", "/app/data/dataset.nq")
      .withDirectory("/app", source.directory("typescript"))
      .withFile("/app/data/dataset.nq", source.file("test/dataset.nq"))
      .withWorkdir("/app")
      .withExec(["bun", "install"])
      .withEntrypoint(["bun", "run", "src/worker.ts"])
      .asService({ useEntrypoint: true })
  }

  @func()
  async dotnetWorker(source: Directory, temporal: Service, sparql: Service): Promise<Service> {
    return dag
      .container()
      .from("mcr.microsoft.com/dotnet/sdk:8.0")
      .withServiceBinding("temporal", temporal)
      .withServiceBinding("sparql", sparql)
      .withEnvVariable("TEMPORAL_ADDRESS", "temporal:7233")
      .withEnvVariable("SPARQL_ENDPOINT", SPARQL_ENDPOINT)
      .withDirectory("/src", source.directory("dotnet"))
      .withWorkdir("/src/Worker")
      .withExec(["dotnet", "restore"])
      .withExec([
        "dotnet",
        "publish",
        "-c",
        "Release",
        "-o",
        "/app",
        "--no-restore",
      ])
      .withEntrypoint(["dotnet", "/app/Worker.dll"])
      .asService({ useEntrypoint: true })
  }

  @func({ cache: "never" })
  async exportDump(source: Directory): Promise<File> {
    const runId = `run-${Date.now().toString(36)}`
    const temporal = await this.temporal(source, runId)
    const sparql = this.sparqlService(source)
    const tsWorker = await this.worker(source, temporal, sparql)
    const dotnetWorker = await this.dotnetWorker(source, temporal, sparql)
    await sparql.id()

    // Run the client. It uses workflow.execute, so it blocks until both
    // workflows complete — the workers must be bound here (not only to the
    // dump container) so they pick up the tasks while the client waits.
    await dag
      .container()
      .from("oven/bun:1.3")
      .withServiceBinding("temporal", temporal)
      .withServiceBinding("ts-worker", tsWorker)
      .withServiceBinding("dotnet-worker", dotnetWorker)
      .withEnvVariable("TEMPORAL_ADDRESS", "temporal:7233")
      .withDirectory("/app", source.directory("typescript"))
      .withWorkdir("/app")
      .withExec(["bun", "install"])
      .withExec(["bun", "run", "src/client.ts"])
      .sync()

    // The client uses workflow.execute, so it only returns after both
    // workflows (and their Oxigraph writes) have completed. A single fetch
    // of the SPARQL endpoint is therefore enough.
    // The RUN_ID env var makes this container's exec graph run-unique:
    // without it, the contention-curl exec is identical across sessions and
    // the engine replays the previous run's /dump.nq from cache.
    return dag
      .container()
      .from("alpine:latest")
      .withEnvVariable("RUN_ID", runId)
      .withServiceBinding("sparql", sparql)
      .withExec(["apk", "add", "--no-cache", "curl"])
      .withExec([
        "sh", "-c",
        "curl -sS -f -H 'Accept: application/n-quads' " +
          "http://sparql/sparql -o /dump.nq",
      ])
      .file("/dump.nq")
  }

  @func({ cache: "never" })
  async temporalWithUi(source: Directory): Promise<Service> {
    const runId = `run-${Date.now().toString(36)}`
    const temporal = await this.temporal(source, runId)
    const sparql = this.sparqlService(source)
    const tsWorker = await this.worker(source, temporal, sparql)
    const dotnetWorker = await this.dotnetWorker(source, temporal, sparql)
    await sparql.id()

    // Run the client. It uses workflow.execute, so it blocks until both
    // workflows complete — the workers must be bound here (not only to the
    // UI container) so they pick up the tasks while the client waits.
    await dag
      .container()
      .from("oven/bun:1.3")
      .withServiceBinding("temporal", temporal)
      .withServiceBinding("ts-worker", tsWorker)
      .withServiceBinding("dotnet-worker", dotnetWorker)
      .withEnvVariable("TEMPORAL_ADDRESS", "temporal:7233")
      .withDirectory("/app", source.directory("typescript"))
      .withWorkdir("/app")
      .withExec(["bun", "install"])
      .withExec(["bun", "run", "src/client.ts"])
      .sync()

    const ui = dag
      .container()
      .from(`temporalio/ui:${TEMPORAL_UI_VERSION}`)
      .withServiceBinding("temporal", temporal)
      .withServiceBinding("ts-worker", tsWorker)
      .withServiceBinding("dotnet-worker", dotnetWorker)
      .withServiceBinding("sparql", sparql)
      .withEnvVariable("TEMPORAL_ADDRESS", "temporal:7233")
      .withEnvVariable("TEMPORAL_CORS_ORIGINS", "http://localhost:3000")
      .withExposedPort(8080)
      .asService({ useEntrypoint: true })

    return ui
  }
}
