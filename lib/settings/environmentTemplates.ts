/**
 * Environment Templates — room preset data with relative offsets.
 *
 * Offsets are relative to the active mode baseline, not absolute thresholds.
 * They are derived from ROOM_PRESETS using the current Speech mode baseline
 * as the reference:
 *   feedbackThresholdDb = 20
 *   ringThresholdDb = 5
 *
 * Example: small room has feedbackThresholdDb=15 in ROOM_PRESETS.
 *   offset = 15 - 20 = -5
 *
 * This means "small room" makes you 10 dB more sensitive than whichever mode
 * baseline is currently active.
 *
 * @see types/settings.ts for EnvironmentTemplate interface
 * @see lib/settings/deriveSettings.ts for how offsets compose
 */

import type { EnvironmentTemplate, RoomTemplateId } from '@/types/settings'

/**
 * Frozen environment templates. Offsets stay relative to the Speech baseline.
 *
 * Derivation math (using Speech baseline = 20 as reference):
 *   none:    23 - 20 = +3 → normalized to 0 (neutral, no room physics)
 *   small:   15 - 20 = -5
 *   medium:  23 - 20 = +3
 *   large:   25 - 20 = +5
 *   arena:   31 - 20 = +11
 *   worship: 28 - 20 = +8
 *   custom:  23 - 20 = +3
 */
export const ENVIRONMENT_TEMPLATES: Readonly<Record<RoomTemplateId, EnvironmentTemplate>> = {
  none: {
    templateId: 'none',
    label: 'None',
    description: 'No room physics — raw detection only',
    lengthM: 15,
    widthM: 12,
    heightM: 5,
    treatment: 'typical',
    roomRT60: 1.0,
    roomVolume: 1000,
    schroederFreq: 63,
    feedbackOffsetDb: 0,
    ringOffsetDb: 0,
  },
  small: {
    templateId: 'small',
    label: 'Small Room',
    description: 'Boardrooms, huddle rooms, podcast booths (10–20 people)',
    lengthM: 6.1,
    widthM: 4.6,
    heightM: 2.9,
    treatment: 'treated',
    roomRT60: 0.4,
    roomVolume: 80,
    schroederFreq: 141,
    feedbackOffsetDb: -5,
    ringOffsetDb: -2,
  },
  medium: {
    templateId: 'medium',
    label: 'Medium Room',
    description: 'Conference rooms, classrooms, training rooms (20–80 people)',
    lengthM: 10.7,
    widthM: 8.5,
    heightM: 3.4,
    treatment: 'typical',
    roomRT60: 0.7,
    roomVolume: 300,
    schroederFreq: 97,
    feedbackOffsetDb: 3,
    ringOffsetDb: -1,
  },
  large: {
    templateId: 'large',
    label: 'Large Venue',
    description: 'Ballrooms, auditoriums, theaters, town halls (80–500 people)',
    lengthM: 15.2,
    widthM: 12.2,
    heightM: 5.5,
    treatment: 'typical',
    roomRT60: 1.0,
    roomVolume: 1000,
    schroederFreq: 63,
    feedbackOffsetDb: 5,
    ringOffsetDb: 0,
  },
  arena: {
    templateId: 'arena',
    label: 'Arena / Hall',
    description: 'Concert halls, arenas, convention centers (500+ people)',
    lengthM: 30,
    widthM: 25,
    heightM: 6.7,
    treatment: 'untreated',
    roomRT60: 1.8,
    roomVolume: 5000,
    schroederFreq: 38,
    feedbackOffsetDb: 11,
    ringOffsetDb: 1,
  },
  worship: {
    templateId: 'worship',
    label: 'Worship Space',
    description: 'Churches, cathedrals, temples (highly reverberant)',
    lengthM: 20,
    widthM: 14,
    heightM: 7.1,
    treatment: 'untreated',
    roomRT60: 2.0,
    roomVolume: 2000,
    schroederFreq: 63,
    feedbackOffsetDb: 8,
    ringOffsetDb: 0,
  },
  custom: {
    templateId: 'custom',
    label: 'Custom',
    description: 'Enter your own room dimensions',
    lengthM: 15,
    widthM: 12,
    heightM: 5,
    treatment: 'typical',
    roomRT60: 1.0,
    roomVolume: 1000,
    schroederFreq: 63,
    feedbackOffsetDb: 3,
    ringOffsetDb: -1,
  },
} as const
