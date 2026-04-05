'use client'

import { useEffect, useRef, useState } from 'react'
import { getSeverityText } from '@/lib/dsp/classifier'
import { formatFrequency } from '@/lib/utils/pitchUtils'
import type { Advisory } from '@/types/advisory'
import type { IssueListEntry } from '@/hooks/useIssuesListEntries'

const ISSUE_ANNOUNCEMENT_THROTTLE_MS = 3000
const ISSUE_ANNOUNCEMENT_PRUNE_LIMIT = 200
const ISSUE_ANNOUNCEMENT_RETAIN_COUNT = 100

export function formatIssueAnnouncement(advisory: Advisory): string {
  const frequency = formatFrequency(advisory.trueFrequencyHz)
  const severity = getSeverityText(advisory.severity)
  const peq = advisory.advisory?.peq
  const cutDetail = peq
    ? `, cut ${Math.abs(peq.gainDb).toFixed(0)} dB at Q ${peq.q.toFixed(0)}`
    : ''

  return `Feedback detected at ${frequency}, severity ${severity}${cutDetail}`
}

export function useIssueAnnouncement(entries: IssueListEntry[]): string {
  const [liveAnnouncement, setLiveAnnouncement] = useState('')
  const announcedIdsRef = useRef(new Set<string>())
  const lastAnnounceTimeRef = useRef(0)

  useEffect(() => {
    const now = Date.now()
    if (now - lastAnnounceTimeRef.current < ISSUE_ANNOUNCEMENT_THROTTLE_MS) return

    if (announcedIdsRef.current.size > ISSUE_ANNOUNCEMENT_PRUNE_LIMIT) {
      const retainedIds = [...announcedIdsRef.current].slice(-ISSUE_ANNOUNCEMENT_RETAIN_COUNT)
      announcedIdsRef.current = new Set(retainedIds)
    }

    for (const entry of entries) {
      const { advisory } = entry
      if (announcedIdsRef.current.has(advisory.id) || advisory.resolved) continue

      announcedIdsRef.current.add(advisory.id)
      lastAnnounceTimeRef.current = now
      setLiveAnnouncement(formatIssueAnnouncement(advisory))
      break
    }
  }, [entries])

  return liveAnnouncement
}
