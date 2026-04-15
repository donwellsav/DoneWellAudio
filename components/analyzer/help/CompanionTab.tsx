'use client'

import { memo } from 'react'
import { HelpGroup, HelpSection } from './HelpShared'

export const CompanionTab = memo(function CompanionTab() {
  return (
    <>
      <HelpGroup title="Overview">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <HelpSection title="What Companion Integration Does" color="green">
            <div className="grid gap-2">
              <p>
                DoneWell Audio can forward advisory data to Bitfocus Companion so that an operator can route EQ recommendations
                into external mixer or DSP workflows. The analyzer decides what to recommend. Companion handles the control side.
              </p>
              <p>
                No raw audio is transmitted. The bridge carries advisory and control metadata such as frequency, gain, Q,
                severity, and lifecycle acknowledgements.
              </p>
            </div>
          </HelpSection>

          <HelpSection title="Source And Builds" color="green">
            <div className="grid gap-2">
              <p>The canonical module source lives in this repository.</p>
              <div className="grid gap-2">
                <a
                  href="https://github.com/donwellsav/donewellaudio/tree/main/companion-module"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded bg-primary px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Open Module Source
                </a>
                <a
                  href="https://github.com/donwellsav/donewellaudio/releases"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded border border-border px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider text-foreground transition-colors hover:bg-muted/40"
                >
                  Open Releases Page
                </a>
              </div>
              <p className="text-xs text-muted-foreground/70">Use the repository source as the authority when docs and packaged artifacts disagree.</p>
            </div>
          </HelpSection>
        </div>
      </HelpGroup>

      <HelpGroup title="Setup">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <HelpSection title="Quick Start" color="green">
            <ol className="grid gap-2 list-decimal list-inside">
              <li>Install Bitfocus Companion.</li>
              <li>Install the DoneWell Audio Companion module from source or a published build.</li>
              <li>In DoneWell Audio, open <strong>Advanced</strong> and enable the Companion bridge.</li>
              <li>Copy the pairing code and enter the current site URL in the Companion module settings.</li>
              <li>Select the mixer model, target output, and output mode in the module.</li>
              <li>Use manual send or module auto-apply according to your show workflow.</li>
            </ol>
          </HelpSection>

          <HelpSection title="App-Side Settings" color="green">
            <ul className="grid gap-2">
              <li><strong>Enable Companion Bridge:</strong> master on/off switch for relay traffic and SEND actions.</li>
              <li><strong>Pairing Code:</strong> short code used to pair the app and the module through the relay.</li>
              <li><strong>Min Confidence:</strong> minimum confidence required before the app offers the advisory to the bridge.</li>
              <li><strong>Auto-Send:</strong> app-side automatic send of eligible advisories.</li>
              <li><strong>Ring-Out Auto-Send:</strong> allows the ring-out workflow to push its notches automatically.</li>
            </ul>
          </HelpSection>
        </div>
      </HelpGroup>

      <HelpGroup title="Current Architecture">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <HelpSection title="Data Flow" color="blue">
            <div className="grid gap-2">
              <p className="font-mono text-xs text-muted-foreground/80">DoneWell Audio -&gt; relay -&gt; Companion module -&gt; mixer profile output</p>
              <ul className="grid gap-2">
                <li>The relay lives at <code className="rounded bg-muted px-1 font-mono text-xs">/api/companion/relay/[code]</code>.</li>
                <li>It uses two queues: app-to-module and module-to-app.</li>
                <li>It supports GET, POST, HEAD, and DELETE handlers.</li>
                <li>Queue size is capped at 20 messages per direction and relays expire after 30 minutes of inactivity.</li>
                <li>Rate limiting is per pairing code, not per IP.</li>
              </ul>
            </div>
          </HelpSection>

          <HelpSection title="Module Feedback Loop" color="amber">
            <ul className="grid gap-2">
              <li>The module can send acknowledgements, apply results, clear results, and commands back to the app queue.</li>
              <li>That round-trip is what lets the app distinguish accepted actions from failed or partial control-side work.</li>
              <li>Keep the analysis path and the control path mentally separate. A relay or mixer failure is not the same thing as a detector failure.</li>
            </ul>
          </HelpSection>
        </div>
      </HelpGroup>

      <HelpGroup title="Supported Mixers And Variables">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <HelpSection title="Supported Mixer Profiles" color="green">
            <ul className="grid gap-2">
              <li>Behringer X32 / X-Air</li>
              <li>Midas M32 / Pro Series</li>
              <li>Yamaha TF Series</li>
              <li>Yamaha CL / QL Series</li>
              <li>Allen &amp; Heath dLive</li>
              <li>Allen &amp; Heath SQ</li>
              <li>dbx DriveRack PA2</li>
              <li>dbx DriveRack VENU360</li>
              <li>Generic OSC</li>
            </ul>
          </HelpSection>

          <HelpSection title="Module Variables" color="blue">
            <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 text-sm">
              <div><code className="rounded bg-muted px-1 font-mono text-xs">peq_frequency</code></div>
              <div><code className="rounded bg-muted px-1 font-mono text-xs">peq_q</code></div>
              <div><code className="rounded bg-muted px-1 font-mono text-xs">peq_gain</code></div>
              <div><code className="rounded bg-muted px-1 font-mono text-xs">peq_type</code></div>
              <div><code className="rounded bg-muted px-1 font-mono text-xs">geq_band</code></div>
              <div><code className="rounded bg-muted px-1 font-mono text-xs">geq_band_index</code></div>
              <div><code className="rounded bg-muted px-1 font-mono text-xs">geq_gain</code></div>
              <div><code className="rounded bg-muted px-1 font-mono text-xs">note</code></div>
              <div><code className="rounded bg-muted px-1 font-mono text-xs">severity</code></div>
              <div><code className="rounded bg-muted px-1 font-mono text-xs">confidence</code></div>
              <div><code className="rounded bg-muted px-1 font-mono text-xs">current_mode</code></div>
              <div><code className="rounded bg-muted px-1 font-mono text-xs">pending_count</code></div>
              <div><code className="rounded bg-muted px-1 font-mono text-xs">last_updated</code></div>
              <div><code className="rounded bg-muted px-1 font-mono text-xs">slots_used</code></div>
              <div><code className="rounded bg-muted px-1 font-mono text-xs">slots_total</code></div>
              <div><code className="rounded bg-muted px-1 font-mono text-xs">mixer_model</code></div>
            </div>
          </HelpSection>
        </div>
      </HelpGroup>

      <HelpGroup title="Operational Notes">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <HelpSection title="Safety" color="amber">
            <ul className="grid gap-2">
              <li>DoneWell Audio remains analysis-only even when Companion is enabled.</li>
              <li>Auto-apply is a control-side decision. Do not confuse it with the browser analyzer becoming an auto-EQ engine.</li>
              <li>Use manual send during live work unless you are deliberately running a more automated control path.</li>
              <li>Regenerating the pairing code is the fastest way to disconnect an older module session.</li>
            </ul>
          </HelpSection>

          <HelpSection title="Troubleshooting" color="amber">
            <ul className="grid gap-2">
              <li>If the relay is paired but nothing changes on the mixer, verify the module's mixer model, output mode, and target prefix before blaming the detector.</li>
              <li>If SEND is missing, check that the bridge is enabled and that the advisory is relay-eligible.</li>
              <li>If variables stay blank, confirm that the module has actually received an advisory and that the pairing code matches.</li>
              <li>If the app shows partial apply or clear states, treat that as control-path evidence, not UI noise.</li>
            </ul>
          </HelpSection>
        </div>
      </HelpGroup>
    </>
  )
})
