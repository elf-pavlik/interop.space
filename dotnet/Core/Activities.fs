namespace Fediverse.Core

open System
open System.Net.Http
open System.Text
open System.Text.Json
open System.Threading.Tasks
open Temporalio.Activities
open Interop

type FediverseActivities() =
    [<Activity>]
    member _.DoWebfinger(id: string) : Task<JsonElement> = task {
        let parts = id.Split('@')
        let handle = parts[0]
        let domain = parts[1]
        let url =
            $"https://{domain}/.well-known/webfinger?resource=acct:{handle}@{domain}"
        use client = new HttpClient()
        let! response = client.GetStringAsync(url)
        return JsonSerializer.Deserialize<JsonElement>(response)
    }

    [<Activity>]
    member _.GetProfile(id: string) : Task<Profile> = task {
        use client = new HttpClient()
        client.DefaultRequestHeaders.Accept.Add(
            Headers.MediaTypeWithQualityHeaderValue("application/activity+json"))
        let! response = client.GetStringAsync(id)
        let root = JsonSerializer.Deserialize<JsonElement>(response)

        let tryGetString (el: JsonElement) (prop: string) =
            let mutable v = JsonElement()
            if el.TryGetProperty(prop, &v) then v.GetString()
            else null

        let id = tryGetString root "id"
        let name =
            match tryGetString root "name" with
            | null -> tryGetString root "preferredUsername"
            | n -> n

        let mutable iconEl = JsonElement()
        let avatar =
            if root.TryGetProperty("icon", &iconEl) then
                tryGetString iconEl "url"
            else null

        return Profile(
            Id = id,
            Name = name,
            Avatar = avatar
        )
    }

    [<Activity>]
    member _.StoreProfile(profile: Profile) : Task<Profile> = task {
        let endpoint = Environment.GetEnvironmentVariable("SPARQL_ENDPOINT")
        if String.IsNullOrEmpty(endpoint) then
            return profile
        else
            let asN = "https://www.w3.org/ns/activitystreams#"
            let sb = StringBuilder()
            // Idempotent upsert: delete any previously stored quads for this
            // profile id first, then insert fresh ones, so re-runs don't
            // accumulate duplicate name/icon quads or orphaned blank nodes.
            sb.AppendLine("DELETE {") |> ignore
            sb.AppendLine($"  ?s <{asN}name> ?n .") |> ignore
            sb.AppendLine($"  ?s <{asN}icon> ?icon .") |> ignore
            sb.AppendLine($"  ?icon <{asN}url> ?url .") |> ignore
            sb.AppendLine("}") |> ignore
            sb.AppendLine("WHERE {") |> ignore
            sb.AppendLine($"  VALUES ?s {{ <{profile.Id}> }}") |> ignore
            sb.AppendLine($"  OPTIONAL {{ ?s <{asN}name> ?n }}") |> ignore
            sb.AppendLine($"  OPTIONAL {{ ?s <{asN}icon> ?icon . ?icon <{asN}url> ?url }}") |> ignore
            sb.AppendLine("}") |> ignore
            // A separate INSERT DATA at the end of the update sequence:
            // a ground INSERT inside DELETE..INSERT..WHERE would be re-run
            // once per matched solution (duplicating icon nodes), whereas
            // INSERT DATA executes exactly once, unconditionally.
            sb.AppendLine(";") |> ignore
            sb.AppendLine("INSERT DATA {") |> ignore

            if not (String.IsNullOrEmpty(profile.Name)) then
                sb.AppendLine($"  <{profile.Id}> <{asN}name> \"{profile.Name}\" .")
                |> ignore

            if not (String.IsNullOrEmpty(profile.Avatar)) then
                sb.AppendLine($"  <{profile.Id}> <{asN}icon> [")
                |> ignore
                sb.AppendLine($"    <{asN}url> <{profile.Avatar}>")
                |> ignore
                sb.AppendLine("  ] .")
                |> ignore

            sb.AppendLine("}") |> ignore

            use client = new HttpClient()
            let content = new StringContent(sb.ToString(), null, "application/sparql-update")
            let! response = client.PostAsync(endpoint, content)
            response.EnsureSuccessStatusCode() |> ignore

            return profile
    }
