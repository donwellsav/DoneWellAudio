'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { getFeedbackHistory } from '@/lib/dsp/feedbackHistory'
import { getSeverityUrgency } from '@/lib/dsp/severityUtils'
import { hzToCents } from '@/lib/utils/pitchUtils'
import type { Advisory, SeverityLevel } from '@/types/advisory'

export const MIN_ISSUE_DISPLAY_MS = 3000

/**
 * Cents tolerance for display-level merge. Advisories within this range
 * collapse to the higher-urgency one. Safety net for cases where DSP-level
 * peakMergeCents didn't catch them (timing, different frames, rate limiter).
 */
const DISPLAY_MERGE_CENTS = 200

export interface IssueListEntry {
  advisory: Advisory
  occurrenceCount: number
}

interface IssueHistory {
  getOccurrenceCount: (frequencyHz: number) => number
}

function getEntriesIdentity(entries: IssueListEntry[]): string {
  return entries.map((entry) => entry.advisory.id).join(',')
}

/**
 * Display-level merge: collapse entries within DISPLAY_MERGE_CENTS of each other.
 * Keeps the higher-urgency advisory, sums occurrence counts.
 * Input must be sorted by frequency (ascending) within each priority band.
 * O(n) — single pass over the sorted list.
 */
function mergeNearbyEntries(entries: IssueListEntry[]): IssueListEntry[] {
  if (entries.length <= 1) return entries

  const merged: IssueListEntry[] = [entries[0]]

  for (let i = 1; i < entries.length; i++) {
    const prev = merged[merged.length - 1]
    const curr = entries[i]
    const cents = Math.abs(hzToCents(prev.advisory.trueFrequencyHz, curr.advisory.trueFrequencyHz))

    if (cents <= DISPLAY_MERGE_CENTS && prev.advisory.resolved === curr.advisory.resolved) {
      // Merge: keep the higher-urgency one, sum occurrences
      const prevUrgency = getSeverityUrgency(prev.advisory.severity as SeverityLevel)
      const currUrgency = getSeverityUrgency(curr.advisory.severity as SeverityLevel)

      if (currUrgency > prevUrgency) {
        // Current is more urgent — replace, carry occurrence count
        merged[merged.length - 1] = {
          advisory: curr.advisory,
          occurrenceCount: prev.occurrenceCount + curr.occurrenceCount,
        }
      } else {
        // Previous is more urgent (or equal) — absorb current's count
        merged[merged.length - 1] = {
          ...prev,
          occurrenceCount: prev.occurrenceCount + curr.occurrenceCount,
        }
      }
    } else {
      merged.push(curr)
    }
  }

  return merged
}

export function buildIssueListEntries(
  advisories: Advisory[],
  dismissedIds: ReadonlySet<string> | undefined,
  maxIssues: number,
  history: IssueHistory,
): IssueListEntry[] {
  const sorted = advisories
    .filter((advisory) => !dismissedIds?.has(advisory.id))
    .map((advisory) => ({
      advisory,
      occurrenceCount: history.getOccurrenceCount(advisory.trueFrequencyHz),
    }))
    .sort((a, b) => {
      if (a.advisory.resolved !== b.advisory.resolved) {
        return a.advisory.resolved ? 1 : -1
      }

      const aRepeat = a.occurrenceCount >= 3
      const bRepeat = b.occurrenceCount >= 3
      if (aRepeat !== bRepeat) return aRepeat ? -1 : 1
      if (aRepeat && bRepeat) return b.occurrenceCount - a.occurrenceCount

      return a.advisory.trueFrequencyHz - b.advisory.trueFrequencyHz
    })

  // Display-level merge: collapse nearby frequencies to avoid duplicate cards
  return mergeNearbyEntries(sorted).slice(0, maxIssues)
}

export function useIssuesListEntries(
  advisories: Advisory[],
  dismissedIds: ReadonlySet<string> | undefined,
  maxIssues: number,
): IssueListEntry[] {
  return useMemo(() => (
    buildIssueListEntries(advisories, dismissedIds, maxIssues, getFeedbackHistory())
  ), [advisories, dismissedIds, maxIssues])
}

export function useStableIssueEntries(latestEntries: IssueListEntry[]): IssueListEntry[] {
  const stableRef = useRef(latestEntries)
  const lastUpdateRef = useRef(Date.now())
  const [stableEntries, setStableEntries] = useState(latestEntries)

  useEffect(() => {
    const previousIdentity = getEntriesIdentity(stableRef.current)
    const nextIdentity = getEntriesIdentity(latestEntries)

    if (previousIdentity === nextIdentity) {
      stableRef.current = latestEntries
      setStableEntries(latestEntries)
      return
    }

    const elapsedMs = Date.now() - lastUpdateRef.current
    if (elapsedMs >= MIN_ISSUE_DISPLAY_MS) {
      stableRef.current = latestEntries
      lastUpdateRef.current = Date.now()
      setStableEntries(latestEntries)
      return
    }

    const remainingMs = MIN_ISSUE_DISPLAY_MS - elapsedMs
    const timerId = setTimeout(() => {
      stableRef.current = latestEntries
      lastUpdateRef.current = Date.now()
      setStableEntries(latestEntries)
    }, remainingMs)

    return () => clearTimeout(timerId)
  }, [latestEntries])

  return stableEntries
}
