'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { getFeedbackHistory } from '@/lib/dsp/feedbackHistory'
import type { Advisory } from '@/types/advisory'

export const MIN_ISSUE_DISPLAY_MS = 3000

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

export function buildIssueListEntries(
  advisories: Advisory[],
  dismissedIds: ReadonlySet<string> | undefined,
  maxIssues: number,
  history: IssueHistory,
): IssueListEntry[] {
  return advisories
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
    .slice(0, maxIssues)
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
