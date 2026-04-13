'use client'

import { memo } from 'react'
import { HelpSection, HelpGroup } from './HelpShared'

export const CompanionTab = memo(function CompanionTab() {
  return (
    <>
      {/* Group: Download & Setup */}
      <HelpGroup title="Download & Setup">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          <HelpSection title="What is Companion Integration?" color="green">
            <p>
              DoneWell Audio can send its EQ recommendations to <strong>Bitfocus Companion</strong>, which routes them to your hardware mixer or DSP processor.
              DoneWell detects feedback and calculates the cut — Companion talks to the mixer and applies it.
              Works with any mixer that Companion supports: Behringer X32, Yamaha CL/QL/TF, Allen &amp; Heath, dbx, Midas, and hundreds more.
            </p>
          </HelpSection>
          <HelpSection title="Get the Module" color="green">
            <p className="mb-2">Pre-built, ready to use. Unzip into Companion&apos;s dev modules folder — no build step needed.</p>
            <div className="space-y-2">
              <a
                href="https://github.com/donwellsav/donewellaudio/releases/download/companion-modules-v0.3.0/companion-module-donewell-audio.zip"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-mono font-bold tracking-wider uppercase hover:bg-primary/90 transition-colors"
              >
                Download DoneWell Audio Module (.zip)
              </a>
              <p className="text-[10px] text-muted-foreground/60">Supports X32, Midas M32, Yamaha TF/CL/QL, A&amp;H dLive/SQ, dbx DriveRack PA2, dbx DriveRack VENU360, and Generic OSC via the Mixer Model dropdown.</p>
            </div>
            <div className="mt-3 space-y-2">
              <p className="font-medium text-foreground text-sm">Install steps:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Click the download button above</li>
                <li>Unzip into Companion&apos;s dev modules folder</li>
                <li>Restart Companion</li>
                <li>Search for <strong>&ldquo;DoneWell Audio&rdquo;</strong> in Add Connection</li>
              </ol>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground/50">
              v0.3.20260328 &mdash; pre-packaged with node_modules.
            </p>
          </HelpSection>

          <HelpSection title="Quick Start" color="green">
            <ol className="list-decimal list-inside space-y-2">
              <li>Install <strong>Bitfocus Companion</strong> on any computer on your network</li>
              <li>Download and install the module (see left)</li>
              <li>Add your mixer module in Companion (e.g., Behringer X32)</li>
              <li>In this app, go to <strong>Advanced &rarr; Companion</strong> and enable the bridge</li>
              <li>Copy the <strong>Pairing Code</strong> (e.g., <code className="font-mono text-xs bg-muted px-1 rounded">DWA-A1B2</code>)</li>
              <li>In the Companion module settings, paste the pairing code and enter this site&apos;s URL</li>
              <li>The module starts polling — &ldquo;Relay active&rdquo; confirms the connection</li>
            </ol>
          </HelpSection>
        </div>
      </HelpGroup>

      {/* Group: App Settings */}
      <HelpGroup title="App Settings">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          <HelpSection title="Companion Bridge Settings (Advanced Tab)" color="green">
            <ul className="space-y-2">
              <li><strong>Enable Companion Bridge:</strong> Master on/off toggle. When off, no data is sent and the SEND button is hidden.</li>
              <li><strong>Pairing Code:</strong> A unique code (e.g., DWA-A1B2) that links this app to your Companion module. Enter it in the module settings. Click &ldquo;New Code&rdquo; to regenerate.</li>
              <li><strong>Min Confidence:</strong> Only send advisories above this confidence threshold (default 70%).</li>
              <li><strong>Auto-Send:</strong> Automatically send every advisory. When off, use the SEND button on each card.</li>
              <li><strong>Ring-Out Auto-Send:</strong> Auto-send each ring-out step to the mixer as you notch frequencies.</li>
            </ul>
          </HelpSection>
        </div>
      </HelpGroup>

      {/* Group: How It Works */}
      <HelpGroup title="How It Works">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          <HelpSection title="Architecture (3 Parts)" color="blue">
            <p className="mb-2">The system has three parts that work together:</p>
            <ol className="list-decimal list-inside space-y-2">
              <li><strong>This app</strong> detects feedback and calculates EQ cuts. Posts advisories to a cloud relay (same-origin API, no network config needed).</li>
              <li><strong>Cloud relay</strong> (<code className="font-mono text-xs bg-muted px-1 rounded">/api/companion/relay/[code]</code>) holds advisories until the Companion module polls for them. Paired via a short code.</li>
              <li><strong>Companion module</strong> polls the relay every 500ms, receives advisories, and exposes the EQ data as Companion <strong>variables</strong>.</li>
            </ol>
            <p className="mt-2">You then create a <strong>trigger</strong> in Companion that wires those variables to your mixer module. This is the step that actually applies EQ to hardware.</p>
          </HelpSection>

          <HelpSection title="Sending EQ Recommendations" color="amber">
            <ul className="space-y-2">
              <li><strong>SEND button:</strong> Appears on each issue card when Companion is enabled. Tap to send that specific advisory.</li>
              <li><strong>Auto-Send mode:</strong> Every new advisory is sent automatically when it meets the confidence threshold.</li>
              <li><strong>Ring-Out Wizard:</strong> Each step can auto-send its PEQ recommendation as you notch frequencies. &ldquo;Send All&rdquo; button in the summary sends all notched frequencies at once.</li>
            </ul>
            <p className="mt-3 text-xs text-muted-foreground/70">
              No raw audio is ever transmitted — only text-based EQ parameters (frequency, Q, gain, filter type, pitch).
            </p>
          </HelpSection>
        </div>
      </HelpGroup>

      {/* Group: Companion Variables */}
      <HelpGroup title="Companion Variables">
        <div className="grid grid-cols-1 gap-1.5">
          <HelpSection title="Variables Exposed to Companion" color="blue">
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
              <div><code className="font-mono text-xs bg-muted px-1 rounded">$(donewell:slots_used)</code> — PEQ slots currently in use</div>
              <div><code className="font-mono text-xs bg-muted px-1 rounded">$(donewell:slots_total)</code> — Total PEQ slots available</div>
              <div><code className="font-mono text-xs bg-muted px-1 rounded">$(donewell:mixer_model)</code> — Selected mixer model</div>
            </div>
          </HelpSection>
        </div>
      </HelpGroup>

      {/* Group: Connecting to Your Mixer */}
      <HelpGroup title="Connecting to Your Mixer">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          <HelpSection title="Built-in Mixer Output (Recommended)" color="green">
            <p className="mb-2">The module can send EQ commands directly to your mixer — no separate mixer module or triggers needed.</p>
            <ol className="list-decimal list-inside space-y-2">
              <li>In the module settings, choose your <strong>Mixer Model</strong> (X32, Midas M32, Yamaha TF/CL/QL, A&amp;H dLive/SQ, dbx PA2, dbx VENU360, or Generic OSC)</li>
              <li>Enter your mixer&apos;s <strong>IP address</strong> — port auto-fills per model</li>
              <li>Set the <strong>Channel/EQ Prefix</strong> (e.g., <code className="font-mono text-xs bg-muted px-1 rounded">/ch/01/eq</code> for X32 channel 1)</li>
              <li>Set <strong>PEQ Bands Available</strong> (how many bands the module can use for notch filters)</li>
              <li>Choose <strong>EQ Output Mode</strong>: PEQ (surgical notches), GEQ (graphic EQ bands), or Both</li>
              <li>Enable <strong>Auto-Apply</strong> — each advisory now goes straight to your mixer</li>
            </ol>
            <p className="mt-2 text-xs text-muted-foreground/70">
              The module manages multiple PEQ slots automatically — up to 8 simultaneous notch filters. When slots are full, the lowest-severity notch is replaced.
            </p>
          </HelpSection>

          <HelpSection title="Supported Mixers" color="green">
            <ul className="space-y-2">
              <li><strong>Behringer X32 / X-Air:</strong> OSC, port 10023. Normalized freq/gain/Q values.</li>
              <li><strong>Midas M32 / Pro Series:</strong> Same OSC protocol as X32.</li>
              <li><strong>Yamaha TF Series:</strong> OSC, port 49280. Direct Hz/dB/Q values.</li>
              <li><strong>Yamaha CL / QL Series:</strong> OSC, port 49280. Direct Hz/dB/Q values.</li>
              <li><strong>Allen &amp; Heath dLive:</strong> TCP, port 51325.</li>
              <li><strong>Allen &amp; Heath SQ:</strong> TCP, port 51326.</li>
              <li><strong>dbx DriveRack PA2:</strong> TCP, port 19272. Precision PEQ with Q 4-16.</li>
              <li><strong>dbx DriveRack VENU360:</strong> OSC via VENU360 Companion module, port 9000. PEQ (8 bands) + GEQ (31-band). Requires separate GEQ Prefix for chain routing.</li>
              <li><strong>Generic OSC:</strong> User-configured. Uses X32-style normalization.</li>
            </ul>
          </HelpSection>

          <HelpSection title="OSC Channel Prefixes" color="blue">
            <p className="mb-2">Common OSC paths for popular mixers:</p>
            <ul className="space-y-1">
              <li><code className="font-mono text-xs bg-muted px-1 rounded">/ch/01/eq</code> — X32/M32 channel 1</li>
              <li><code className="font-mono text-xs bg-muted px-1 rounded">/bus/01/eq</code> — X32/M32 bus 1</li>
              <li><code className="font-mono text-xs bg-muted px-1 rounded">/main/st/eq</code> — X32/M32 main stereo</li>
              <li><code className="font-mono text-xs bg-muted px-1 rounded">/mtx/01/eq</code> — X32/M32 matrix 1</li>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground/70">
              Check your mixer&apos;s OSC documentation for the exact prefix. The module appends <code className="font-mono text-xs bg-muted px-1 rounded">/&lt;band&gt;/f</code>, <code className="font-mono text-xs bg-muted px-1 rounded">/g</code>, <code className="font-mono text-xs bg-muted px-1 rounded">/q</code> automatically.
            </p>
          </HelpSection>

          <HelpSection title="Stream Deck Buttons" color="blue">
            <ul className="space-y-2">
              <li><strong>Apply Latest EQ:</strong> Press to send the current advisory to your mixer on demand (when Auto-Apply is off).</li>
              <li><strong>Latest Advisory:</strong> Shows frequency, gain, and Q. Turns yellow when pending, red for RUNAWAY.</li>
              <li><strong>Clear All:</strong> Clears all pending advisories.</li>
              <li><strong>Status:</strong> Shows pending count and severity at a glance.</li>
              <li><strong>Custom buttons:</strong> Use variables like <code className="font-mono text-xs bg-muted px-1 rounded">$(donewell:note)</code> in any button text.</li>
            </ul>
          </HelpSection>
        </div>
      </HelpGroup>

      {/* Group: Module Configuration */}
      <HelpGroup title="Module Configuration">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          <HelpSection title="Companion Module Settings" color="green">
            <ul className="space-y-2">
              <li><strong>Pairing Code:</strong> Must match the code shown in this app.</li>
              <li><strong>Site URL:</strong> The address of this app (copy from your browser bar).</li>
              <li><strong>Poll Interval (ms):</strong> How often to check for advisories. Default: 500ms.</li>
              <li><strong>Mixer Model:</strong> Select your mixer — auto-configures protocol, port, and parameter format.</li>
              <li><strong>Mixer IP / Port:</strong> Your mixer&apos;s network address. Port auto-fills per model.</li>
              <li><strong>Channel/EQ Prefix:</strong> Which channel/bus EQ to target (e.g., /ch/01/eq).</li>
              <li><strong>PEQ Bands Available:</strong> How many PEQ bands the module can use for notch filters (1-8). Manages slots automatically.</li>
              <li><strong>First PEQ Band:</strong> Starting band number (default 1). Shift to avoid conflicting with bands you set manually.</li>
              <li><strong>EQ Output Mode:</strong> PEQ (surgical notches), GEQ (graphic EQ bands), or Both.</li>
              <li><strong>Auto-Apply:</strong> Send EQ to mixer automatically on every advisory.</li>
              <li><strong>Max Cut Depth (dB):</strong> Safety clamp. Default: -12 dB.</li>
            </ul>
          </HelpSection>

          <HelpSection title="Safety" color="amber">
            <ul className="space-y-2">
              <li><strong>Manual mode by default:</strong> You must click SEND on each advisory unless auto-send is explicitly enabled.</li>
              <li><strong>Max cut depth:</strong> The module clamps all PEQ and GEQ cut recommendations to prevent excessive notching.</li>
              <li><strong>This app never modifies audio.</strong> It only sends text-based EQ parameters. Your mixer module and Companion trigger do the actual EQ changes.</li>
              <li><strong>Relay is ephemeral:</strong> Advisory data is consumed when polled and the relay expires after inactivity. Nothing is stored permanently.</li>
              <li><strong>Regenerate pairing code</strong> to instantly disconnect any previous session.</li>
            </ul>
          </HelpSection>
        </div>
      </HelpGroup>

      {/* Group: Troubleshooting */}
      <HelpGroup title="Troubleshooting">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          <HelpSection title="Common Issues" color="amber">
            <div className="space-y-3">
              <div>
                <p className="font-medium text-foreground text-sm mb-1">Relay active but nothing happens on mixer</p>
                <p className="text-sm">The module only provides data — you need a <strong>trigger</strong> in Companion to wire it to your mixer module. See &ldquo;Wiring to Your Mixer&rdquo; above. This is the most common missed step.</p>
              </div>
              <div>
                <p className="font-medium text-foreground text-sm mb-1">Companion module status is red</p>
                <p className="text-sm">Check the Site URL in the module settings — must be the full address of this app (from your browser bar). Verify the pairing code matches. Check that the app is accessible from the machine running Companion.</p>
              </div>
              <div>
                <p className="font-medium text-foreground text-sm mb-1">SEND button not visible on cards</p>
                <p className="text-sm">Enable the Companion bridge in Advanced &rarr; Companion. The SEND button only appears when the bridge is on.</p>
              </div>
              <div>
                <p className="font-medium text-foreground text-sm mb-1">Variables show &ldquo;--&rdquo; in Companion</p>
                <p className="text-sm">No advisory has been sent yet. Start analysis, detect some feedback, and click SEND (or enable auto-send). Variables populate on the first advisory.</p>
              </div>
            </div>
          </HelpSection>

          <HelpSection title="Best Practices" color="amber">
            <ul className="space-y-2">
              <li><strong>Ring-out:</strong> Enable Ring-Out Auto-Send. Each time you click Next in the wizard, the PEQ cut goes to your mixer automatically.</li>
              <li><strong>Live show:</strong> Keep auto-send <strong>off</strong>. Use the SEND button manually — confirm each cut before it hits the PA.</li>
              <li><strong>Max cut depth:</strong> Set to -6 or -9 dB for live shows. Deeper cuts can be destructive.</li>
              <li><strong>Trust your ears first.</strong> This is a tool, not a replacement for the engineer.</li>
              <li><strong>Multiple mixers:</strong> One pairing code can feed as many Companion triggers as you need — FOH, monitors, broadcast, etc.</li>
            </ul>
          </HelpSection>
        </div>
      </HelpGroup>
    </>
  )
})
