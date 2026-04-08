'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ImperativePanelHandle } from '@/components/ui/resizable'

export interface AnalyzerShellState {
  activeSidebarTab: 'issues' | 'controls'
  setActiveSidebarTab: (tab: 'issues' | 'controls') => void
  issuesPanelOpen: boolean
  setIssuesPanelOpen: (open: boolean) => void
  issuesPanelRef: React.RefObject<ImperativePanelHandle | null>
  openIssuesPanel: () => void
  closeIssuesPanel: () => void
  closeIssuesPanelToIssues: () => void
  isErrorDismissed: boolean
  setIsErrorDismissed: (dismissed: boolean) => void
  handleRetry: () => void
}

export function useAnalyzerShellState(
  error: string | null,
  start: () => Promise<void>,
): AnalyzerShellState {
  const [activeSidebarTab, setActiveSidebarTab] = useState<'issues' | 'controls'>('controls')
  const [issuesPanelOpen, setIssuesPanelOpen] = useState(true)
  const issuesPanelRef = useRef<ImperativePanelHandle | null>(null)

  const [isErrorDismissed, setIsErrorDismissed] = useState(false)
  useEffect(() => {
    setIsErrorDismissed(false)
  }, [error])

  const handleRetry = useCallback(() => {
    setIsErrorDismissed(false)
    void start()
  }, [start])

  const openIssuesPanel = useCallback(() => {
    setIssuesPanelOpen(true)
    setActiveSidebarTab(prev => (prev === 'issues' ? 'controls' : prev))
    requestAnimationFrame(() => issuesPanelRef.current?.resize(25))
  }, [issuesPanelRef])

  const closeIssuesPanel = useCallback(() => {
    issuesPanelRef.current?.collapse()
  }, [issuesPanelRef])

  const closeIssuesPanelToIssues = useCallback(() => {
    setActiveSidebarTab('issues')
    issuesPanelRef.current?.collapse()
  }, [issuesPanelRef])

  return {
    activeSidebarTab,
    setActiveSidebarTab,
    issuesPanelOpen,
    setIssuesPanelOpen,
    issuesPanelRef,
    openIssuesPanel,
    closeIssuesPanel,
    closeIssuesPanelToIssues,
    isErrorDismissed,
    setIsErrorDismissed,
    handleRetry,
  }
}
