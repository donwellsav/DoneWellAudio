'use client'

import { memo } from 'react'
import { HelpGroup, HelpSection } from './HelpShared'

export const AlgorithmsTab = memo(function AlgorithmsTab() {
  return (
    <>
      <HelpGroup title="Overview">
        <HelpSection title="Seven Signals, One Decision" color="amber">
          <div className="grid gap-2">
            <p>
              DoneWell Audio does not trust a single detector. The worker scores each candidate peak with seven
              different feedback signals, changes weight profiles based on the content it sees, and then applies
              reporting rules that try to preserve recall without turning every stable tone into a false alarm.
            </p>
            <p>
              The main practical rule is simple: a single strong signal can help, but the system is designed so that
              real feedback usually needs corroboration from more than one angle before it becomes an advisory.
            </p>
          </div>
        </HelpSection>
      </HelpGroup>

      <HelpGroup title="Detection Signals">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
          <HelpSection title="MSD" color="amber">
            <div className="grid gap-2">
              <p>Magnitude Slope Deviation measures how stable the peak's magnitude history is over time.</p>
              <ul className="grid gap-1">
                <li>Strong when feedback is growing or holding in a stable way.</li>
                <li>Weaker on compressed program material where everything looks artificially steady.</li>
              </ul>
            </div>
          </HelpSection>

          <HelpSection title="Phase Coherence" color="amber">
            <div className="grid gap-2">
              <p>Phase coherence checks whether the peak keeps a consistent frame-to-frame phase relationship.</p>
              <ul className="grid gap-1">
                <li>Very useful when dynamics processing makes amplitude-based cues less trustworthy.</li>
                <li>Not enough on its own when pitched musical content is extremely stable.</li>
              </ul>
            </div>
          </HelpSection>

          <HelpSection title="Spectral Flatness" color="amber">
            <div className="grid gap-2">
              <p>Spectral flatness and related shape cues separate narrow tone-like peaks from broader content.</p>
              <ul className="grid gap-1">
                <li>Helps distinguish a single ringing frequency from wider music or noise energy.</li>
                <li>Works best alongside prominence and coherence cues.</li>
              </ul>
            </div>
          </HelpSection>

          <HelpSection title="Comb Pattern" color="amber">
            <div className="grid gap-2">
              <p>Comb pattern analysis looks for repeated spacing that suggests a real acoustic loop path.</p>
              <ul className="grid gap-1">
                <li>Useful for early-warning and ring-out style prediction.</li>
                <li>Suppressed when the spacing itself is unstable.</li>
              </ul>
            </div>
          </HelpSection>

          <HelpSection title="IHR And PTMR" color="amber">
            <div className="grid gap-2">
              <p>IHR checks inter-harmonic energy. PTMR measures how sharply a peak rises above its local floor.</p>
              <ul className="grid gap-1">
                <li>IHR helps reject instrument-like harmonic structure.</li>
                <li>PTMR helps reject broad peaks that do not behave like isolated feedback.</li>
              </ul>
            </div>
          </HelpSection>

          <HelpSection title="ML Signal" color="amber">
            <div className="grid gap-2">
              <p>The compact ONNX model is one more vote in the stack, not a replacement for the rest of the detector.</p>
              <ul className="grid gap-1">
                <li>It can improve borderline decisions.</li>
                <li>It should never be treated as an excuse to ignore the rest of the evidence.</li>
              </ul>
            </div>
          </HelpSection>
        </div>
      </HelpGroup>

      <HelpGroup title="Fusion And Reporting">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <HelpSection title="Content-Aware Fusion" color="amber">
            <ul className="grid gap-2">
              <li>The worker uses different weight profiles for speech, music, compressed, and default content.</li>
              <li>Compressed material leans harder on phase and corroborating shape cues because MSD alone becomes less trustworthy.</li>
              <li>Agreement matters. Sharp disagreement between active algorithms suppresses confidence instead of being ignored.</li>
            </ul>
          </HelpSection>

          <HelpSection title="Post-Fusion Gates" color="blue">
            <ul className="grid gap-2">
              <li>IHR gate for harmonic instrument content.</li>
              <li>PTMR gate for broad peaks.</li>
              <li>Formant gate for voiced speech and singing.</li>
              <li>Chromatic gate for strongly pitched musical material.</li>
              <li>Comb stability gate for unstable spacing.</li>
              <li>Mains hum gate for 50/60 Hz families.</li>
            </ul>
          </HelpSection>

          <HelpSection title="Why Advisories Sometimes Feel Late" color="amber">
            <p>
              A missed advisory is not always a missed peak. Sometimes the peak was found, but the worker still decided
              that the evidence was too conflicting or too voice-like to surface yet. That is why replay fixtures and
              labels matter: they tell you whether the regression is in raw detection, fusion, classification, or reporting.
            </p>
          </HelpSection>

          <HelpSection title="Evaluation Lanes" color="green">
            <ul className="grid gap-2">
              <li><strong>Synthetic lane:</strong> controlled fusion scenarios in utoresearch/evaluate.ts.</li>
              <li><strong>Snapshot replay lane:</strong> labeled SnapshotBatch fixtures in utoresearch/evaluateSnapshots.ts.</li>
              <li><strong>Operator labels:</strong> FALSE+, CONFIRM, and Missed Feedback provide evidence for tuning without changing the audio path.</li>
            </ul>
          </HelpSection>
        </div>
      </HelpGroup>
    </>
  )
})
