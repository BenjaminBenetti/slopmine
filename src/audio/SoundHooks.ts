/**
 * The hook game code calls to make a sound. The audio system registers itself
 * as the sink at startup (setupAudio); until then - and in workers or tests -
 * every call is a no-op. Gameplay facts that other systems care about still go
 * through gameEvents; this module is for feedback that only audio needs
 * (a mining strike, a door creak, a UI tick, a projectile whoosh).
 */

import type { BlockSoundAction } from './synth/blockSounds.ts'
import type { VoiceKind } from './synth/creatureVoices.ts'
import type { SoundId } from './SoundLibrary.ts'

export interface SoundPosition {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface PlaySoundOptions {
  /** Linear level multiplier (1 = the library level). */
  volume?: number
  /** Playback-rate multiplier (pitch), on top of the sound's own jitter. */
  pitch?: number
}

export interface SoundHandle {
  stop(fadeSeconds?: number): void
}

export interface SoundSink {
  play(id: SoundId, position: SoundPosition | null, options?: PlaySoundOptions): SoundHandle | null
  playBlock(blockId: number, action: BlockSoundAction, position: SoundPosition | null, options?: PlaySoundOptions): void
  playEntity(entityType: string, kind: VoiceKind, position: SoundPosition | null, options?: PlaySoundOptions): void
  /** Block UI / station opened or closed (chest creak, forge whoosh, ...). */
  blockUi(blockId: number, opened: boolean, position: SoundPosition | null): void
}

let sink: SoundSink | null = null

export function setSoundSink(next: SoundSink | null): void {
  sink = next
}

/** Play a sound; `position` null = non-positional (the player's own sounds, UI). */
export function playSound(id: SoundId, position: SoundPosition | null = null, options?: PlaySoundOptions): SoundHandle | null {
  return sink?.play(id, position, options) ?? null
}

/** A block's material sound (mining strike, break, place, footstep). */
export function playBlockSound(blockId: number, action: BlockSoundAction, position: SoundPosition | null, options?: PlaySoundOptions): void {
  sink?.playBlock(blockId, action, position, options)
}

/** A creature's voice by entity type. */
export function playEntitySound(entityType: string, kind: VoiceKind, position: SoundPosition | null, options?: PlaySoundOptions): void {
  sink?.playEntity(entityType, kind, position, options)
}

export function playBlockUiSound(blockId: number, opened: boolean, position: SoundPosition | null): void {
  sink?.blockUi(blockId, opened, position)
}
