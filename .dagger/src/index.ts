import { dag, object, func, Service, Directory } from "@dagger.io/dagger";

const POSTGRESQL_VERSION = "16"
const TEMPORAL_VERSION = "1.31.0"
const TEMPORAL_ADMINTOOLS_VERSION = "1.31.0"
const TEMPORAL_UI_VERSION = "2.49.1"

@object()
export class DcentQuest {
  @func()
  async temporal(source: Directory): Promise<Service> {
    const scripts = source.directory("temporal/scripts")
    const dynamicConfig = source.directory("temporal/dynamicconfig")

    const pgData = dag.cacheVolume("temporal-pg-data")

    const pg = dag.container()
      .from(`postgres:${POSTGRESQL_VERSION}`)
      .withEnvVariable("POSTGRES_PASSWORD", "temporal")
      .withEnvVariable("POSTGRES_USER", "temporal")
      .withMountedCache("/var/lib/postgresql/data", pgData)
      .withExposedPort(5432)
      .withEntrypoint(["/bin/sh", "-c",
        // pg_resetwal recovers from hard-shutdown corruption without data loss
        "pg_resetwal -f /var/lib/postgresql/data 2>/dev/null; " +
        "exec docker-entrypoint.sh postgres"
      ])
      .asService({ useEntrypoint: true })

    await dag.container()
      .from(`postgres:${POSTGRESQL_VERSION}`)
      .withServiceBinding("postgresql", pg)
      .withEntrypoint([])
      .withExec(["/bin/sh", "-c",
        "for i in $(seq 60); do pg_isready -U temporal -h postgresql && exit 0; done; exit 1"])
      .sync()

    await dag.container()
      .from(`temporalio/admin-tools:${TEMPORAL_ADMINTOOLS_VERSION}`)
      .withServiceBinding("postgresql", pg)
      .withEnvVariable("POSTGRES_SEEDS", "postgresql")
      .withEnvVariable("POSTGRES_USER", "temporal")
      .withEnvVariable("SQL_PASSWORD", "temporal")
      .withEnvVariable("DB_PORT", "5432")
      .withDirectory("/scripts", scripts)
      .withExec(["/bin/sh", "/scripts/setup-postgres.sh"])
      .sync()

    const temporal = dag.container()
      .from(`temporalio/server:${TEMPORAL_VERSION}`)
      .withServiceBinding("postgresql", pg)
      .withEnvVariable("DB", "postgres12")
      .withEnvVariable("DB_PORT", "5432")
      .withEnvVariable("POSTGRES_USER", "temporal")
      .withEnvVariable("POSTGRES_PWD", "temporal")
      .withEnvVariable("POSTGRES_SEEDS", "postgresql")
      .withEnvVariable("BIND_ON_IP", "0.0.0.0")
      .withEnvVariable("DYNAMIC_CONFIG_FILE_PATH", "config/dynamicconfig/development-sql.yaml")
      .withDirectory("/etc/temporal/config/dynamicconfig", dynamicConfig)
      .withExposedPort(7233)
      .withEntrypoint(["/bin/sh", "-c",
        "while ! nc -z postgresql 5432 2>/dev/null; do sleep 1; done && " +
        // pg_isready is not available in this image, so we sleep briefly
        // to let Postgres finish crash recovery before Temporal connects
        "sleep 2 && " +
        "unset OTEL_EXPORTER_OTLP_TRACES_PROTOCOL && " +
        "exec /etc/temporal/entrypoint.sh start"
      ])
      .asService({ useEntrypoint: true })

    await dag.container()
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
  async temporalWithUi(source: Directory): Promise<Service> {
    const temporal = await this.temporal(source)
    const worker = await this._worker(source, temporal)

    await dag.container()
      .from("oven/bun:1.3")
      .withServiceBinding("temporal", temporal)
      .withServiceBinding("worker", worker)
      .withEnvVariable("TEMPORAL_ADDRESS", "temporal:7233")
      .withDirectory("/app", source, {
        exclude: [".dagger", ".devbox", ".git", "node_modules"],
      })
      .withWorkdir("/app")
      .withExec(["bun", "install"])
      .withExec(["bun", "run", "src/client.ts"])
      .sync()

    const ui = dag.container()
      .from(`temporalio/ui:${TEMPORAL_UI_VERSION}`)
      .withServiceBinding("temporal", temporal)
      .withServiceBinding("worker", worker)
      .withEnvVariable("TEMPORAL_ADDRESS", "temporal:7233")
      .withEnvVariable("TEMPORAL_CORS_ORIGINS", "http://localhost:3000")
      .withExposedPort(8080)
      .asService({ useEntrypoint: true })

    return ui
  }

  async _worker(source: Directory, temporal: Service): Promise<Service> {
    return dag.container()
      .from("oven/bun:1.3")
      .withServiceBinding("temporal", temporal)
      .withEnvVariable("TEMPORAL_ADDRESS", "temporal:7233")
      .withDirectory("/app", source, {
        exclude: [".dagger", ".devbox", ".git", "node_modules"],
      })
      .withWorkdir("/app")
      .withExec(["bun", "install"])
      .withEntrypoint(["bun", "run", "src/worker.ts"])
      .asService({ useEntrypoint: true })
  }
}
