/**
 * Everything weather can put in the air: one generic GPU particle system
 * (renderer/weather/PrecipitationRenderer.ts) draws every kind, each drop
 * picking its kind from the live mix. A kind is plain data - colours, size,
 * how it falls, flutters, glows and what it looks like.
 *
 * Order matters (the shader indexes these): add new kinds at the end.
 */

export type ParticleKindId =
  | 'rain' | 'drizzle' | 'hail' | 'snow' | 'glitter' | 'sand' | 'ash' | 'ember' | 'fluff' | 'pollen'
  | 'spore' | 'wisp' | 'sulphur' | 'petal' | 'bone' | 'shard' | 'soulsnow' | 'firefall' | 'blacksnow' | 'devil'
  | 'debris' | 'gust' | 'driving'

/** How a particle is drawn. */
export const enum ParticleShape {
  /** A thin streak along its motion (rain). */
  Streak = 0,
  /** A soft round flake or mote. */
  Flake = 1,
  /** A tiny glint that twinkles (diamond dust). */
  Sparkle = 2,
  /** A tumbling flat chip (ash, petals). */
  Chip = 3,
}

export interface ParticleKindSpec {
  readonly id: ParticleKindId
  /** Two colours (sRGB 0-1); each particle takes a random mix. */
  readonly colorA: readonly [number, number, number]
  readonly colorB: readonly [number, number, number]
  /** 0 lit by the sky like everything else .. 1 self-lit (embers, wisps). */
  readonly glow: number
  /** Width (flakes: diameter) in blocks. */
  readonly size: number
  /** Streak length in blocks (streaks), 0 otherwise. */
  readonly length: number
  /** Fall speed (blocks/s); 0 floats. */
  readonly fall: number
  /** How much the wind carries it (0 falls straight .. 1 rides the wind at gale speed). */
  readonly windFollow: number
  /** Flutter/wander amplitude (blocks). */
  readonly flutter: number
  readonly alpha: number
  readonly shape: ParticleShape
  /** Splashes where it lands (rain on the ground and water). */
  readonly splash?: boolean
}

export const PARTICLE_KINDS: readonly ParticleKindSpec[] = [
  { id: 'rain', colorA: [0.62, 0.68, 0.78], colorB: [0.8, 0.84, 0.9], glow: 0, size: 0.03, length: 1.3, fall: 17, windFollow: 0.35, flutter: 0, alpha: 0.5, shape: ParticleShape.Streak, splash: true },
  { id: 'drizzle', colorA: [0.66, 0.72, 0.8], colorB: [0.82, 0.86, 0.9], glow: 0, size: 0.022, length: 0.45, fall: 9, windFollow: 0.45, flutter: 0.05, alpha: 0.4, shape: ParticleShape.Streak, splash: true },
  { id: 'hail', colorA: [0.9, 0.93, 0.97], colorB: [0.78, 0.84, 0.92], glow: 0, size: 0.085, length: 0.12, fall: 15, windFollow: 0.2, flutter: 0, alpha: 0.9, shape: ParticleShape.Flake, splash: true },
  { id: 'snow', colorA: [0.97, 0.98, 1.0], colorB: [0.86, 0.9, 0.97], glow: 0.1, size: 0.1, length: 0, fall: 1.7, windFollow: 0.55, flutter: 0.45, alpha: 0.92, shape: ParticleShape.Flake },
  { id: 'glitter', colorA: [1.0, 1.0, 1.0], colorB: [0.75, 0.88, 1.0], glow: 1, size: 0.13, length: 0, fall: 0.25, windFollow: 0.25, flutter: 0.35, alpha: 1, shape: ParticleShape.Sparkle },
  { id: 'sand', colorA: [0.86, 0.72, 0.5], colorB: [0.76, 0.6, 0.4], glow: 0, size: 0.03, length: 0.55, fall: 0.6, windFollow: 1, flutter: 0.3, alpha: 0.42, shape: ParticleShape.Streak },
  { id: 'ash', colorA: [0.36, 0.34, 0.33], colorB: [0.6, 0.58, 0.56], glow: 0, size: 0.065, length: 0, fall: 1.1, windFollow: 0.4, flutter: 0.6, alpha: 0.9, shape: ParticleShape.Chip },
  { id: 'ember', colorA: [1.0, 0.55, 0.12], colorB: [1.0, 0.8, 0.3], glow: 1, size: 0.05, length: 0, fall: 1.4, windFollow: 0.45, flutter: 0.5, alpha: 1, shape: ParticleShape.Flake },
  { id: 'fluff', colorA: [1.0, 1.0, 0.97], colorB: [0.93, 0.93, 0.88], glow: 0.1, size: 0.09, length: 0, fall: 0.22, windFollow: 0.7, flutter: 0.6, alpha: 0.85, shape: ParticleShape.Flake },
  { id: 'pollen', colorA: [1.0, 0.86, 0.35], colorB: [0.98, 0.95, 0.6], glow: 0.45, size: 0.035, length: 0, fall: 0.05, windFollow: 0.3, flutter: 0.8, alpha: 0.9, shape: ParticleShape.Flake },
  { id: 'spore', colorA: [0.35, 0.95, 0.85], colorB: [1.0, 0.35, 0.45], glow: 0.8, size: 0.045, length: 0, fall: 0.15, windFollow: 0.2, flutter: 0.9, alpha: 0.95, shape: ParticleShape.Flake },
  { id: 'wisp', colorA: [0.55, 1.0, 0.6], colorB: [0.4, 0.95, 0.9], glow: 1, size: 0.32, length: 0, fall: 0, windFollow: 0.1, flutter: 2.2, alpha: 0.85, shape: ParticleShape.Flake },
  { id: 'sulphur', colorA: [0.82, 0.86, 0.38], colorB: [0.9, 0.92, 0.55], glow: 0.05, size: 0.03, length: 1.1, fall: 14, windFollow: 0.35, flutter: 0, alpha: 0.5, shape: ParticleShape.Streak, splash: true },
  { id: 'petal', colorA: [1.0, 0.78, 0.86], colorB: [0.5, 0.72, 0.32], glow: 0, size: 0.08, length: 0, fall: 0.8, windFollow: 1, flutter: 0.7, alpha: 1, shape: ParticleShape.Chip },
  { id: 'bone', colorA: [0.9, 0.88, 0.8], colorB: [0.72, 0.8, 0.7], glow: 0.1, size: 0.035, length: 0.45, fall: 0.5, windFollow: 1, flutter: 0.4, alpha: 0.45, shape: ParticleShape.Streak },
  { id: 'shard', colorA: [0.85, 0.55, 1.0], colorB: [1.0, 0.6, 0.85], glow: 0.9, size: 0.1, length: 0, fall: 9, windFollow: 0.1, flutter: 0.05, alpha: 1, shape: ParticleShape.Sparkle },
  { id: 'soulsnow', colorA: [0.62, 0.9, 1.0], colorB: [0.85, 0.97, 1.0], glow: 0.75, size: 0.07, length: 0, fall: 0.9, windFollow: 0.3, flutter: 0.6, alpha: 0.9, shape: ParticleShape.Flake },
  { id: 'firefall', colorA: [1.0, 0.6, 0.15], colorB: [1.0, 0.85, 0.4], glow: 1, size: 0.05, length: 0.7, fall: 12, windFollow: 0.05, flutter: 0, alpha: 1, shape: ParticleShape.Streak, splash: true },
  { id: 'blacksnow', colorA: [0.12, 0.13, 0.16], colorB: [0.26, 0.28, 0.33], glow: 0, size: 0.075, length: 0, fall: 2.6, windFollow: 0.85, flutter: 0.5, alpha: 0.92, shape: ParticleShape.Flake },
  { id: 'devil', colorA: [0.84, 0.7, 0.48], colorB: [0.72, 0.58, 0.38], glow: 0, size: 0.06, length: 0, fall: 0, windFollow: 0, flutter: 0, alpha: 0.75, shape: ParticleShape.Chip },
  // Torn leaves and twigs tumbling past on a gale: what makes the wind's push readable
  { id: 'debris', colorA: [0.36, 0.5, 0.2], colorB: [0.55, 0.4, 0.22], glow: 0, size: 0.1, length: 0, fall: 1.1, windFollow: 1, flutter: 0.55, alpha: 1, shape: ParticleShape.Chip },
  // Faint long streaks along the wind (gusts made visible)
  { id: 'gust', colorA: [0.93, 0.95, 0.98], colorB: [0.84, 0.88, 0.93], glow: 0, size: 0.03, length: 3.6, fall: 0.25, windFollow: 1.15, flutter: 0.15, alpha: 0.12, shape: ParticleShape.Streak },
  // Rain driven sideways by the wind (squalls)
  { id: 'driving', colorA: [0.62, 0.68, 0.78], colorB: [0.8, 0.84, 0.9], glow: 0, size: 0.032, length: 1.6, fall: 13, windFollow: 0.9, flutter: 0, alpha: 0.5, shape: ParticleShape.Streak, splash: true },
]

export const PARTICLE_KIND_COUNT = PARTICLE_KINDS.length

export const PARTICLE_KIND_INDEX: Readonly<Record<ParticleKindId, number>> = Object.fromEntries(
  PARTICLE_KINDS.map((k, i) => [k.id, i])
) as Record<ParticleKindId, number>
