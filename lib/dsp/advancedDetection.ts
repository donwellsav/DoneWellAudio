/**
 * DSP Algorithm Barrel — Re-exports from focused sub-modules
 *
 * This file is a barrel (re-export aggregator), not an implementation.
 * All algorithm logic lives in the sub-modules listed below:
 *   - msdPool.ts             — MSD algorithm (DAFx-16), sparse pooled allocation
 *   - phaseCoherence.ts      — Phase coherence (KU Leuven 2025)
 *   - compressionDetection.ts — Spectral flatness, compression detection
 *   - combPattern.ts         — Comb filter detection (DBX)
 *   - spectralAlgorithms.ts  — IHR, PTMR, content type detection
 *   - fusionEngine.ts        — Algorithm fusion, MINDS, calibration
 *
 * 13 consumers import from this barrel. Preserved for backward compatibility.
 */

export { MSDPool, type MSDRawResult } from './msdPool'
export * from './phaseCoherence'
export * from './compressionDetection'
export * from './combPattern'
export * from './spectralAlgorithms'
export * from './fusionEngine'
