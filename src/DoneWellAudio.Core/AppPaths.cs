namespace DoneWellAudio.Core;

public static class AppPaths
{
    public static string FindConfigDirectory()
    {
        // Search upwards from the executable directory for a "config" folder.
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        for (int i = 0; i < 6 && dir is not null; i++)
        {
            var candidate = Path.Combine(dir.FullName, "config");
            if (Directory.Exists(candidate))
                return candidate;

            dir = dir.Parent;
        }

        // Fallback: current working directory
        var cwdCandidate = Path.Combine(Directory.GetCurrentDirectory(), "config");
        if (Directory.Exists(cwdCandidate))
            return cwdCandidate;

        throw new DirectoryNotFoundException("Could not locate the 'config' directory. Expected it near the app or working directory.");
    }
}
