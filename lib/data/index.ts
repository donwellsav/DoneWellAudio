// Barrel export for data collection module (free tier only)
//
// This module is DYNAMICALLY IMPORTED — it must never appear in
// static imports from premium-tier code paths.

export { SnapshotCollector, quantizeSpectrum } from './snapshotCollector'
export { SnapshotUploader } from './uploader'
export {
  loadConsent,
  markPrompted,
  acceptConsent,
  declineConsent,
  revokeConsent,
  isConsentGiven,
  isConsentPending,
  getConsentStatus,
} from './consent'
