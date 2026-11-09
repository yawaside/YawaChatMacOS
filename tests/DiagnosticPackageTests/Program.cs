using System.IO.Compression;
using YawaChat;

var dir = Path.Combine(Path.GetTempPath(), "yawa-diag-test-" + Guid.NewGuid().ToString("N"));
try
{
    Directory.CreateDirectory(dir);
    var logs = Path.Combine(dir, "logs");
    Directory.CreateDirectory(logs);
    var secret = "my-raw-secret-123";
    File.WriteAllText(Path.Combine(logs, "app.log"),
        $"2026-01-01T12:00:00.000Z [ERROR] [{secret}] failed token={secret}\n");
    var zip = Path.Combine(dir, "report.zip");
    DiagnosticPackage.Create(zip, logs, "2.2.7", new[] { ("twitch", "error"), (secret, secret) });
    using var archive = ZipFile.OpenRead(zip);
    if (archive.Entries.Count != 2) throw new Exception("Unexpected archive entries");
    foreach (var entry in archive.Entries)
    {
        using var reader = new StreamReader(entry.Open());
        var text = reader.ReadToEnd();
        if (text.Contains(secret) || text.Contains("failed token=")) throw new Exception("Secret leaked");
        if (entry.Name == "events.tsv" && !text.Contains("2026-01-01T12:00:00.000Z\tERROR\tapp.log"))
            throw new Exception("Event missing");
        if (entry.Name == "summary.json" && !text.Contains("twitch")) throw new Exception("Status missing");
    }
    Console.WriteLine("Diagnostic package: OK");
}
finally { if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true); }
