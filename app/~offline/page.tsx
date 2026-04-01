'use client'

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="text-center space-y-5 px-6 max-w-sm">
        <div className="flex flex-col items-center gap-2">
          <div className="text-5xl" aria-hidden>🎤</div>
          <h1 className="text-2xl font-bold tracking-tight font-mono">DoneWell Audio</h1>
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground/60">Offline</p>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">
          The app couldn&apos;t load from cache. Once loaded over a network connection,
          DoneWell Audio works fully offline — all audio analysis runs locally in
          your browser.
        </p>
        <div className="space-y-2">
          <button
            onClick={() => window.location.reload()}
            className="w-full px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-mono font-medium hover:bg-primary/90 transition-colors cursor-pointer"
          >
            Try Again
          </button>
          <p className="text-xs text-muted-foreground/50">
            If this persists, clear site data and reload over Wi-Fi to re-cache the app.
          </p>
        </div>
      </div>
    </div>
  )
}
