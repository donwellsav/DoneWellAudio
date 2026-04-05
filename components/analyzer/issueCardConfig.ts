import {
  ArrowUpRight,
  CircleDot,
  Music,
  Radio,
  Waves,
  Zap,
} from 'lucide-react'

export const RUNAWAY_VELOCITY_THRESHOLD = 15
export const WARNING_VELOCITY_THRESHOLD = 10

export const SEVERITY_ENTER_CLASS: Record<string, string> = {
  RUNAWAY: '',
  GROWING: 'animate-issue-enter-slow',
  RESONANCE: 'animate-issue-enter-slow',
  POSSIBLE_RING: 'animate-issue-enter-slow',
  WHISTLE: 'animate-issue-enter-slow',
  INSTRUMENT: 'animate-issue-enter-slow',
}

export const SEVERITY_ICON: Record<string, typeof Zap> = {
  RUNAWAY: Zap,
  GROWING: ArrowUpRight,
  RESONANCE: Radio,
  POSSIBLE_RING: CircleDot,
  WHISTLE: Waves,
  INSTRUMENT: Music,
}

export const SEVERITY_STRIP_CLASS: Record<string, string> = {
  RUNAWAY: '',
  GROWING: 'animate-strip-flash-slow',
  RESONANCE: 'animate-strip-flash-slow',
  POSSIBLE_RING: 'animate-strip-flash-slow',
  WHISTLE: 'animate-strip-flash-slow',
  INSTRUMENT: 'animate-strip-flash-slow',
}
