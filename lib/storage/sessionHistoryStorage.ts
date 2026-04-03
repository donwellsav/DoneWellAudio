/**
 * Session History Storage — persists archived session summaries across page loads.
 *
 * Stores up to MAX_ARCHIVED_SESSIONS session snapshots in localStorage.
 * Each snapshot is a pruned ArchivedSession (no raw event arrays) at ~2-3KB.
 * Total budget: 15 sessions × 3KB = ~45KB, well within localStorage limits.
 */

import { typedStorage } from '@/lib/storage/dwaStorage'
import { MAX_ARCHIVED_SESSIONS, type ArchivedSession } from '@/types/export'

const storage = typedStorage<ArchivedSession[]>('dwa-session-history', [])

/** Prepend a session to the archive, trimming oldest if over limit. Synchronous. */
export function archiveSession(session: ArchivedSession): void {
  // Defensive copy — storage.load() may return the fallback array by reference,
  // so mutating it in-place could leave in-memory state looking updated even
  // when the subsequent save fails or storage is unavailable.
  const sessions = [...storage.load()]
  sessions.unshift(session)
  if (sessions.length > MAX_ARCHIVED_SESSIONS) {
    sessions.length = MAX_ARCHIVED_SESSIONS
  }
  storage.save(sessions)
}

/** Load all archived sessions (newest first). */
export function getArchivedSessions(): ArchivedSession[] {
  return storage.load()
}

/** Clear all archived sessions. */
export function clearSessionHistory(): void {
  storage.save([])
}
