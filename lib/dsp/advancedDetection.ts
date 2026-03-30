/**
 * Advanced Feedback Detection Algorithms — Barrel Re-export
 *
 * All implementations live in focused sub-modules:
 *   - msdAnalysis.ts       — MSD algorithm (DAFx-16)
 *   - phaseCoherence.ts    — Phase coherence (KU Leuven 2025)
 *   - compressionDetection.ts — Spectral flatness, compression detection
 *   - algorithmFusion.ts   — Fusion engine, comb pattern, IHR, PTMR, MINDS
 *
 * This barrel preserves all existing import paths.
 */

export * from './msdAnalysis'
export { MSDPool, type MSDRawResult } from './msdPool'
export * from './phaseCoherence'
export * from './compressionDetection'
export * from './combPattern'
export * from './spectralAlgorithms'
export * from './fusionEngine'
