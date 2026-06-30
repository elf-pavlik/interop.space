using Fediverse.Core;
using Temporalio.Client;
using Temporalio.Worker;

var address = Environment.GetEnvironmentVariable("TEMPORAL_ADDRESS") ?? "temporal:7233";
var client = await TemporalClient.ConnectAsync(new() { TargetHost = address, Namespace = "default" });

using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, eventArgs) =>
{
    cts.Cancel();
    eventArgs.Cancel = true;
};

using var worker = new TemporalWorker(
    client,
    new TemporalWorkerOptions(taskQueue: "fediverse").
        AddAllActivities(new FediverseActivities()).
        AddWorkflow<FediverseWorkflow>());

try
{
    await worker.ExecuteAsync(cts.Token);
}
catch (OperationCanceledException)
{
    Console.WriteLine("Worker stopped");
}
