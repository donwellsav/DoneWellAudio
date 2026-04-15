'use client'

import { memo } from 'react'
import { HelpGroup, HelpSection } from './HelpShared'

export const GuideTab = memo(function GuideTab() {
  return (
    <>
      <HelpGroup title="Overview">
        <HelpSection title="What DoneWell Audio Does" color="amber">
          <div className="grid gap-2">
            <p>
              DoneWell Audio is a real-time acoustic feedback detector for live sound work. It combines
              main-thread peak detection with worker-side fusion, classification, and EQ advisory logic
              so operators can react before ringing turns into a runaway loop.
            </p>
            <p>
              The product is analysis-only. It listens, classifies, and recommends. It does not process
              or output the live audio path.
            </p>
          </div>
        </HelpSection>
      </HelpGroup>

      <HelpGroup title="Getting Started">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <HelpSection title="Quick Start" color="amber">
            <ol className="grid gap-2 list-decimal list-inside">
              <li>Use <strong>Start Analysis</strong> or the header <strong>ENGAGE</strong> transport to begin live detection.</li>
              <li>Use <strong>Ring Out Room</strong> when you want guided calibration instead of passive monitoring.</li>
              <li>Watch the <strong>Active Issues</strong> panel for current advisories and the <strong>lower info bar</strong> for algorithm mode, content type, MSD frames, FPS, and drop percentage.</li>
              <li>Copy or send EQ recommendations from issue cards only after checking that the mode and sensitivity make sense for the room.</li>
              <li>Review <strong>Feedback History</strong> when you need repeat offenders, exports, or session evidence.</li>
            </ol>
          </HelpSection>

          <HelpSection title="Reading The UI" color="blue">
            <ul className="grid gap-2">
              <li><strong>Desktop layout:</strong> issues, controls, and graph panes can stay visible together in resizable panels.</li>
              <li><strong>Mobile portrait:</strong> issues and settings stay in the main flow, with an inline graph view you can resize and toggle.</li>
              <li><strong>Mobile landscape:</strong> the graph stays dedicated while the side panel toggles between issues and settings.</li>
              <li><strong>Lower info bar:</strong> this is the fastest way to see whether the worker thinks the content is speech, music, compressed program, or unknown.</li>
            </ul>
          </HelpSection>
        </div>
      </HelpGroup>

      <HelpGroup title="Controls And Panels">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <HelpSection title="Header Controls" color="blue">
            <ul className="grid gap-2">
              <li><strong>ENGAGE / STOP:</strong> start or stop live analysis.</li>
              <li><strong>PAUSE / RESUME:</strong> freeze the spectrum view without ending analysis.</li>
              <li><strong>CLEAR:</strong> clear advisories, GEQ bars, and RTA markers that are safe to clear.</li>
              <li><strong>Theme, history, help, settings, and layout:</strong> available from the right side of the header and mobile menu.</li>
              <li><strong>Input gain controls:</strong> keep the source readable without pretending that software gain fixes a bad operating mode or a bad mic position.</li>
            </ul>
          </HelpSection>

          <HelpSection title="Issue Card Actions" color="amber">
            <ul className="grid gap-2">
              <li><strong>Copy:</strong> copy frequency and EQ details to the clipboard.</li>
              <li><strong>FALSE+:</strong> mark a surfaced advisory as a false positive.</li>
              <li><strong>CONFIRM:</strong> mark a surfaced advisory as real feedback.</li>
              <li><strong>Missed Feedback:</strong> record a false negative during calibration and tuning.</li>
              <li><strong>SEND:</strong> available only when the Companion bridge is enabled and the advisory is eligible for relay.</li>
            </ul>
          </HelpSection>

          <HelpSection title="Settings Tabs" color="amber">
            <ul className="grid gap-2">
              <li><strong>Live:</strong> day-of-show sensitivity and focus-range controls.</li>
              <li><strong>Setup:</strong> mode selection, EQ style, auto-gain target, room setup, calibration, and saved rig presets.</li>
              <li><strong>Display:</strong> graph options, tooltips, gesture behavior, frequency overlays, and other UI preferences.</li>
              <li><strong>Advanced:</strong> expert diagnostics, timing, FFT, track management, data collection, and Companion settings.</li>
            </ul>
          </HelpSection>

          <HelpSection title="Workflow Guidance" color="green">
            <ul className="grid gap-2">
              <li>Start with the operating mode that matches the source, then adjust sensitivity. Do not use sensitivity to compensate for the wrong mode.</li>
              <li>Use the lower info bar before making a tuning decision. A compressed-content classification changes which evidence is most trustworthy.</li>
              <li>When recall feels weak, verify whether the detector is missing the event or whether the reporting gate is suppressing it too late.</li>
              <li>Use FALSE+, CONFIRM, and Missed Feedback as evidence collection, not as guesses.</li>
            </ul>
          </HelpSection>
        </div>
      </HelpGroup>

      <HelpGroup title="Troubleshooting">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <HelpSection title="Too Many False Positives" color="amber">
            <p>
              Raise confidence, lower sensitivity, and make sure the operating mode matches the source material.
              Speech and worship are tuned to suppress voiced and formant-heavy content more aggressively than live music.
            </p>
          </HelpSection>

          <HelpSection title="Missing Feedback" color="amber">
            <p>
              Raise sensitivity, verify input gain, and use the mode that matches the job. Ring Out and Monitors surface
              earlier warnings than Speech. If the detector still feels late, measure it with replay fixtures or labels instead of relying on memory.
            </p>
          </HelpSection>

          <HelpSection title="Compressed Program Material" color="blue">
            <p>
              When the footer shows <strong>COMPRESSED</strong>, trust corroborating phase and spectral-shape evidence more than MSD alone.
              Heavily limited program material can look stable enough to fool a single algorithm.
            </p>
          </HelpSection>

          <HelpSection title="Slow Display" color="blue">
            <p>
              Watch the FPS and drop percentage in the footer. If performance is falling, reduce FFT size,
              close competing browser tabs, and avoid treating display symptoms as detector bugs.
            </p>
          </HelpSection>
        </div>
      </HelpGroup>
    </>
  )
})
