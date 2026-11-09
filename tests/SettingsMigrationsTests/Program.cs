using System.Text.Json.Nodes;
using YawaChat;

static void Check(bool ok, string message)
{
    if (!ok) throw new Exception(message);
}

var old = JsonNode.Parse("""{"subscriptions":[{"platform":"vkplay","username":"channel"}],"botToken:vkplay":"secret","botAuth":{"vkplay":{"token":"secret"},"twitch":{"user":"a"}},"other":"preserved"}""")!.AsObject();
Check(SettingsMigrations.Apply(old), "old profile must migrate");
Check(old["schemaVersion"]!.GetValue<int>() == 1, "version set");
Check(old["botToken:vkplay"] == null && old["botAuth"]!["vkplay"] == null, "legacy secrets removed");
Check(old["botAuth"]!["twitch"] != null && old["subscriptions"]!.AsArray().Count == 1, "other data preserved");
var snapshot = old.ToJsonString();
Check(!SettingsMigrations.Apply(old) && old.ToJsonString() == snapshot, "migration is idempotent");
var future = JsonNode.Parse("""{"schemaVersion":99,"botToken:vkplay":"keep","newFeature":true}""")!.AsObject();
Check(!SettingsMigrations.Apply(future) && future["botToken:vkplay"]!.GetValue<string>() == "keep", "future profile not modified");
Console.WriteLine("Settings migrations: OK");
