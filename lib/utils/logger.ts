/* eslint-disable no-console */
/**
 * Centralized logging helpers.
 *
 * Keep direct console usage in one place so application code stays lint-clean
 * without dropping diagnostics outright.
 */

export function logDebug(...args: readonly unknown[]): void {
  console.debug(...args)
}

export function logInfo(...args: readonly unknown[]): void {
  console.log(...args)
}

export function logWarn(...args: readonly unknown[]): void {
  console.warn(...args)
}

export function logError(...args: readonly unknown[]): void {
  console.error(...args)
}
