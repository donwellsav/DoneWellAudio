'use client'

import { memo } from 'react'
import { HelpSection } from './HelpShared'

export const CompanionTab = memo(function CompanionTab() {
  return (
    <>
      <HelpSection title="What is Companion Integration?">
        <p>
          DoneWell Audio can send its EQ recommendations to <strong>Bitfocus Companion</strong>, which routes them to your hardware mixer or DSP processor.
          DoneWell detects feedback and calculates the cut — Companion talks to the mixer and applies it.
          Works with any mixer that Companion supports: Behringer X32, Yamaha CL/QL/TF, Allen &amp; Heath, dbx, Midas, and hundreds more.
        </p>
      </HelpSection>

      {/* Group: Download & Setup */}
      <div>
        <div className="py-1.5 px-2 section-label panel-groove bg-card/60">Download &amp; Setup</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-3">
          <HelpSection title="Get the Module">
            <p className="mb-2">The Companion module is a standalone package you install on whatever machine runs Companion — it does not need to be this machine.</p>
            <a
              href="/downloads/companion-module-donewell-audio.zip"
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-mono font-bold tracking-wider uppercase hover:bg-primary/90 transition-colors"
            >
              Download Companion Module (.zip)
            </a>
            <div className="mt-3 space-y-2">
              <p className="font-medium text-foreground text-sm">Install steps:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Click the download button above (pre-built, ready to use)</li>
                <li>Unzip the downloaded file</li>
                <li>Run <code className="font-mono text-xs bg-muted px-1 rounded">npm install</code> inside the unzipped folder (installs the Companion base library)</li>
                <li>In Companion, go to <strong>Connections</strong> &rarr; <strong>Add connection</strong></li>
                <li>Click <strong>Developer modules path</strong> at the bottom and point it to the unzipped folder</li>
                <li>Restart Companion — search for <strong>&ldquo;DoneWell Audio&rdquo;</strong> in Add Connection</li>
              </ol>
            </div>
            <p className="mt-2 text-xs text-muted-foreground/70">
              Source code is in the <code className="font-mono text-xs bg-muted px-1 rounded">companion-module/</code> folder of this project&apos;s repository.
            </p>
          </HelpSection>

          <HelpSection title="Quick Start">
            <ol className="list-decimal list-inside space-y-2">
              <li>Install <strong>Bitfocus Companion</strong> on any computer on your network</li>
              <li>Download and install the module (see left)</li>
              <li>Add the module in Companion and note the instance name (default: <code className="font-mono text-xs bg-muted px-1 rounded">donewell-audio</code>)</li>
              <li>Add your mixer module in Companion (e.g., Behringer X32)</li>
              <li>In this app, go to <strong>Advanced &rarr; Companion</strong> and enable the bridge</li>
              <li>Set the <strong>Companion URL</strong> to the machine running Companion (e.g., <code className="font-mono text-xs bg-muted px-1 rounded">http://&lt;companion-ip&gt;:8000</code>)</li>
              <li>Click <strong>Test</strong> to verify the connection (green dot = connected)</li>
            </ol>
          </HelpSection>
        </div>
      </div>

      {/* Group: App Settings */}
      <div>
        <div className="py-1.5 px-2 section-label panel-groove bg-card/60">App Settings</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-3">
          <HelpSection title="Companion Bridge Settings (Advanced Tab)">
            <ul className="space-y-2">
              <li><strong>Enable Companion Bridge:</strong> Master on/off toggle. When off, no data is sent and the SEND button is hidden.</li>
              <li><strong>Companion URL:</strong> Where Companion is running. Default: <code className="font-mono text-xs bg-muted px-1 rounded">http://localhost:8000</code></li>
              <li><strong>Module Instance Name:</strong> Must match the instance name in Companion. Default: <code className="font-mono text-xs bg-muted px-1 rounded">donewell-audio</code></li>
              <li><strong>Min Confidence:</strong> Only send advisories above this confidence threshold (default 70%).</li>
              <li><strong>Auto-Send:</strong> Automatically send every advisory. When off, use the SEND button on each card.</li>
              <li><strong>Ring-Out Auto-Send:</strong> Auto-send each ring-out step to the mixer as you notch frequencies.</li>
            </ul>
          </HelpSection>
        </div>
      </div>

      {/* Group: How It Works */}
      <div>
        <div className="py-1.5 px-2 section-label panel-groove bg-card/60">How It Works</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-3">
          <HelpSection title="Data Flow">
            <ol className="list-decimal list-inside space-y-2">
              <li>DoneWell detects feedback at a specific frequency</li>
              <li>It calculates the EQ cut: frequency, Q, gain, filter type</li>
              <li>The advisory is sent to the Companion module via HTTP</li>
              <li>Companion exposes the values as <strong>variables</strong> (e.g., <code className="font-mono text-xs bg-muted px-1 rounded">$(donewell:peq_frequency)</code>)</li>
              <li>Your Companion trigger fires and applies the EQ to your mixer module</li>
            </ol>
            <p className="mt-2 text-xs text-muted-foreground/70">
              DoneWell never talks directly to your mixer — Companion is the bridge.
              DoneWell remains analysis-only and never modifies audio.
            </p>
          </HelpSection>

          <HelpSection title="Sending EQ Recommendations">
            <ul className="space-y-2">
              <li><strong>SEND button:</strong> Appears on each issue card when Companion is enabled. Tap to send that specific advisory.</li>
              <li><strong>Auto-Send mode:</strong> Every new advisory is sent automatically when it meets the confidence threshold.</li>
              <li><strong>Ring-Out Wizard:</strong> Each step can auto-send its PEQ recommendation as you notch frequencies. &ldquo;Send All&rdquo; button in the summary sends all notched frequencies at once.</li>
            </ul>
          </HelpSection>
        </div>
      </div>

      {/* Group: Companion Variables */}
      <div>
        <div className="py-1.5 px-2 section-label panel-groove bg-card/60">Companion Variables</div>
        <div className="grid grid-cols-1 gap-1.5 pt-3">
          <HelpSection title="Variables Exposed to Companion">
            <p className="mb-2">These variables update every time DoneWell sends an advisory. Use them in triggers, button text, and expressions across all Companion modules.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
              <div><code className="font-mono text-xs bg-muted px-1 rounded">$(donewell:peq_frequency)</code> — PEQ center frequency (Hz)</div>
              <div><code className="font-mono text-xs bg-muted px-1 rounded">$(donewell:peq_q)</code> — PEQ quality factor</div>
              <div><code className="font-mono text-xs bg-muted px-1 rounded">$(donewell:peq_gain)</code> — PEQ gain in dB (negative = cut)</div>
              <div><code className="font-mono text-xs bg-muted px-1 rounded">$(donewell:peq_type)</code> — Filter type (bell, notch, HPF, LPF)</div>
              <div><code className="font-mono text-xs bg-muted px-1 rounded">$(donewell:geq_band)</code> — Nearest GEQ band center (Hz)</div>
              <div><code className="font-mono text-xs bg-muted px-1 rounded">$(donewell:geq_band_index)</code> — GEQ fader index (0-30)</div>
              <div><code className="font-mono text-xs bg-muted px-1 rounded">$(donewell:geq_gain)</code> — Suggested GEQ fader position (dB)</div>
              <div><code className="font-mono text-xs bg-muted px-1 rounded">$(donewell:note)</code> — Musical pitch (e.g., D#5 +12c)</div>
              <div><code className="font-mono text-xs bg-muted px-1 rounded">$(donewell:severity)</code> — RUNAWAY, GROWING, RESONANCE, etc.</div>
              <div><code className="font-mono text-xs bg-muted px-1 rounded">$(donewell:confidence)</code> — Detection confidence (0-1)</div>
              <div><code className="font-mono text-xs bg-muted px-1 rounded">$(donewell:pending_count)</code> — Unacknowledged advisory count</div>
              <div><code className="font-mono text-xs bg-muted px-1 rounded">$(donewell:last_updated)</code> — Timestamp of last advisory</div>
            </div>
          </HelpSection>
        </div>
      </div>

      {/* Group: Wiring in Companion */}
      <div>
        <div className="py-1.5 px-2 section-label panel-groove bg-card/60">Wiring in Companion</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-3">
          <HelpSection title="Example: Behringer X32">
            <ol className="list-decimal list-inside space-y-2">
              <li>Add the <strong>DoneWell Audio</strong> module in Companion</li>
              <li>Add the <strong>Behringer X32</strong> module and connect to your mixer</li>
              <li>Create a Companion <strong>trigger</strong>: When a new advisory arrives from DoneWell...</li>
              <li>Set the trigger action to: <strong>Set X32 Channel EQ</strong> using DoneWell variables:
                <ul className="list-disc list-inside ml-4 mt-1">
                  <li>Frequency: <code className="font-mono text-xs bg-muted px-1 rounded">$(donewell:peq_frequency)</code></li>
                  <li>Q: <code className="font-mono text-xs bg-muted px-1 rounded">$(donewell:peq_q)</code></li>
                  <li>Gain: <code className="font-mono text-xs bg-muted px-1 rounded">$(donewell:peq_gain)</code></li>
                </ul>
              </li>
            </ol>
          </HelpSection>

          <HelpSection title="Stream Deck Buttons">
            <ul className="space-y-2">
              <li><strong>Latest Advisory:</strong> Shows frequency, gain, and Q of the latest detection. Press to acknowledge. Turns yellow when pending, red for RUNAWAY severity.</li>
              <li><strong>Clear All:</strong> Clears all pending advisories from the queue.</li>
              <li><strong>Status:</strong> Shows pending count and current severity. Green when connected, changes color with detections.</li>
            </ul>
          </HelpSection>
        </div>
      </div>

      {/* Group: Module Configuration */}
      <div>
        <div className="py-1.5 px-2 section-label panel-groove bg-card/60">Module Configuration</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-3">
          <HelpSection title="Companion Module Settings">
            <ul className="space-y-2">
              <li><strong>Min Confidence (0-1):</strong> Ignore advisories below this threshold. Default: 0.5.</li>
              <li><strong>Min Severity:</strong> Filter by severity level. Options: Runaway only, Growing and above, Resonance and above, All detections.</li>
              <li><strong>Max Cut Depth (dB):</strong> Safety clamp — cuts are limited to this maximum. Default: -12 dB. Range: -24 to -3 dB.</li>
              <li><strong>Auto-Acknowledge (seconds):</strong> Automatically clear advisories after this time. 0 = manual only.</li>
            </ul>
          </HelpSection>

          <HelpSection title="Safety">
            <ul className="space-y-2">
              <li><strong>Manual mode by default:</strong> You must click SEND on each advisory unless auto-send is explicitly enabled.</li>
              <li><strong>Dual confidence gates:</strong> Both DoneWell (PWA side) and the Companion module filter by confidence independently.</li>
              <li><strong>Max cut depth:</strong> The module clamps all PEQ and GEQ cut recommendations to prevent excessive notching.</li>
              <li><strong>No audio modification:</strong> DoneWell Audio never touches the audio signal. It only sends text-based EQ recommendations over HTTP.</li>
              <li><strong>Connection indicator:</strong> Green/red dot in Advanced settings shows whether Companion is reachable. Use the Test button to check.</li>
            </ul>
          </HelpSection>
        </div>
      </div>

      {/* Group: Troubleshooting */}
      <div>
        <div className="py-1.5 px-2 section-label panel-groove bg-card/60">Troubleshooting</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-3">
          <HelpSection title="Common Issues">
            <div className="space-y-3">
              <div>
                <p className="font-medium text-foreground text-sm mb-1">Connection shows red / disconnected</p>
                <p className="text-sm">Verify Companion is running. Check the URL matches (default: localhost:8000). Ensure the DoneWell Audio module is added in Companion with the correct instance name.</p>
              </div>
              <div>
                <p className="font-medium text-foreground text-sm mb-1">SEND button not visible</p>
                <p className="text-sm">Enable the Companion bridge in Advanced &rarr; Companion settings. The button only appears when the bridge is enabled.</p>
              </div>
              <div>
                <p className="font-medium text-foreground text-sm mb-1">Advisory sent but nothing happens on mixer</p>
                <p className="text-sm">Check your Companion trigger is wired correctly. Verify the mixer module is connected. Check Companion&apos;s log for the incoming advisory. Ensure the advisory meets the module&apos;s confidence and severity thresholds.</p>
              </div>
              <div>
                <p className="font-medium text-foreground text-sm mb-1">CORS error in browser console</p>
                <p className="text-sm">The Companion module includes CORS headers by default. If you see CORS errors, ensure you&apos;re using the DoneWell Audio module (not a generic HTTP module) and that Companion is at least version 3.x.</p>
              </div>
            </div>
          </HelpSection>

          <HelpSection title="Tips">
            <ul className="space-y-2">
              <li><strong>Ring-out workflow:</strong> Enable Ring-Out Auto-Send, then use the Ring Out wizard. Each time you click Next, the PEQ recommendation is sent to your mixer automatically.</li>
              <li><strong>Live show:</strong> Keep auto-send off. Use the SEND button manually so you confirm each cut before it hits the PA.</li>
              <li><strong>Stream Deck:</strong> Use the preset buttons for quick visual monitoring. The Latest Advisory button shows what DoneWell is hearing in real time.</li>
              <li><strong>Multiple mixers:</strong> Add multiple DoneWell Audio module instances in Companion with different instance names. Point each to a different mixer module.</li>
            </ul>
          </HelpSection>
        </div>
      </div>
    </>
  )
})
