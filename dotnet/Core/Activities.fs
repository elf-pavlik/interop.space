namespace Fediverse.Core

open System
open System.Net.Http
open System.Text.Json
open System.Threading.Tasks
open Temporalio.Activities

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
        let options = JsonSerializerOptions(PropertyNameCaseInsensitive = true)
        return JsonSerializer.Deserialize<Profile>(response, options)
    }
