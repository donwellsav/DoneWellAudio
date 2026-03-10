'use client'

import { memo } from 'react'
import dynamic from 'next/dynamic'
import { ErrorBoundary } from '@/components/kill-the-ring/ErrorBoundary'

const KillTheRing = dynamic(
  () => import('@/components/kill-the-ring/KillTheRing').then((m) => m.KillTheRing),
  { ssr: false }
)

export const KillTheRingClient = memo(function KillTheRingClient() {
  return (
    <ErrorBoundary>
      <KillTheRing />
    </ErrorBoundary>
  )
})
