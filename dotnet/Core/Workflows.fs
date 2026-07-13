namespace Fediverse.Core

open System
open System.Text.Json
open System.Threading.Tasks
open Temporalio.Workflows
open Interop

[<Workflow>]
type FediverseWorkflow() =
    [<WorkflowRun>]
    member this.Run(id: string) : Task<Profile> = task {
        let opts = ActivityOptions(StartToCloseTimeout = TimeSpan.FromMinutes(1.0))

        let! jrd = Workflow.ExecuteActivityAsync<JsonElement>("DoWebfinger", [| id |], opts)

        let links = jrd.GetProperty("links").EnumerateArray()
        let selfLink =
            links
            |> Seq.find (fun l -> l.GetProperty("rel").GetString() = "self")
        let href = selfLink.GetProperty("href").GetString()

        return! Workflow.ExecuteActivityAsync<Profile>("GetProfile", [| href |], opts)
    }
