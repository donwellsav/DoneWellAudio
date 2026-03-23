'use client'

import React from 'react'
import * as Sentry from '@sentry/nextjs'

interface ErrorBoundaryProps {
  children: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // eslint-disable-next-line no-console -- error boundaries must log to console for debugging
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
    Sentry.captureException(error, {
      contexts: { react: { componentStack: errorInfo.componentStack ?? undefined } },
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] p-6 rounded border border-destructive/30 bg-destructive/5 text-center">
          <h2 className="text-lg font-mono font-bold tracking-wide text-destructive mb-2">Something went wrong</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 text-sm font-mono font-medium rounded bg-destructive/15 text-destructive border border-destructive/40 hover:bg-destructive/25 transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-destructive/50"
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
