import type { GameEvent, GameEventOf, GameEventType } from '../events/GameEvents.ts'

/**
 * Declarative journal data: chapters of milestones, each completed by a
 * trigger. The ProgressionManager evaluates triggers; the data says nothing
 * about how (see milestones.ts for the content).
 */

/** Completes when the player has had any (or all) of these items. */
export interface ObtainTrigger {
  readonly kind: 'obtain'
  /** Item ids (another stream's ids are fine - they simply never match until they exist) */
  readonly items?: readonly string[]
  /** Item tags (e.g. 'log'): any item carrying one of them counts */
  readonly tags?: readonly string[]
  /** true: every listed item must have been obtained (ever, not at once) */
  readonly all?: boolean
}

/** Completes when a gameplay event matches the predicate. */
export interface EventTrigger {
  readonly kind: 'event'
  readonly event: GameEventType
  readonly test: (event: GameEvent) => boolean
}

/** Completes when the player's feet go below this Y (polled). */
export interface DepthTrigger {
  readonly kind: 'depth'
  readonly belowY: number
}

export type MilestoneTrigger = ObtainTrigger | EventTrigger | DepthTrigger

export interface MilestoneDef {
  /** Stable id (persisted - never rename) */
  readonly id: string
  readonly title: string
  /** One line of flavour, shown once done and in the completion toast */
  readonly flavour: string
  /** Actionable hint: what to do, where, with which tool */
  readonly hint: string
  /** Item id whose icon represents the milestone (missing items show no icon) */
  readonly icon?: string
  /**
   * Prerequisite milestone ids. A milestone is locked (shown greyed) until
   * they are done; completing it also completes them (you cannot have an
   * iron bar without having found iron), so keep this list to true
   * implications.
   */
  readonly requires?: readonly string[]
  /** Side goal: never the "next goal" and not needed to finish its chapter */
  readonly optional?: boolean
  /**
   * Tier tracks ('pickaxe', 'sword', 'armor', 'metal'): reaching a rung
   * silently completes the lower-stage rungs of the same track, so a skipped
   * tier (no wood sword, no copper) never pins the "next goal".
   */
  readonly tracks?: readonly string[]
  /**
   * Position on the progression arc (DESIGN §1). The "next goal" is the
   * unlocked, unfinished milestone with the lowest stage (ties: journal
   * order), so the guidance interleaves chapters - a stone sword right after
   * the stone pickaxe, slow falling before the descent.
   */
  readonly stage: number
  /**
   * Progress that was possible before the journal existed. Migrating a save
   * without journal data also completes the legacy milestones earlier on the
   * arc than the furthest milestone the carried items prove.
   */
  readonly legacy?: boolean
  /** Any trigger completes the milestone */
  readonly triggers: readonly MilestoneTrigger[]
}

export interface ChapterDef {
  /** Stable id (persisted - never rename) */
  readonly id: string
  readonly title: string
  /** One line under the chapter title */
  readonly blurb: string
  /** Accent colour (toasts, journal) */
  readonly accent: string
  /** Milestone ids that unlock the chapter (none: unlocked from the start) */
  readonly requires?: readonly string[]
  readonly milestones: readonly MilestoneDef[]
}

// ---------------------------------------------------------------------------
// Trigger helpers (keep milestones.ts declarative and readable)
// ---------------------------------------------------------------------------

/** Have (or have had) any of these items. */
export function obtain(...items: string[]): ObtainTrigger {
  return { kind: 'obtain', items }
}

/** Have had every one of these items (at any time). */
export function obtainAll(...items: string[]): ObtainTrigger {
  return { kind: 'obtain', items, all: true }
}

/** Have any item carrying one of these tags. */
export function obtainTagged(...tags: string[]): ObtainTrigger {
  return { kind: 'obtain', tags }
}

/** Generic event trigger with a typed predicate. */
export function on<T extends GameEventType>(
  event: T,
  test: (event: GameEventOf<T>) => boolean = () => true
): EventTrigger {
  return { kind: 'event', event, test: test as (event: GameEvent) => boolean }
}

/** Mine one of these blocks (block `properties.name`). */
export function mined(...blockNames: string[]): EventTrigger {
  return on('block-mined', (e) => blockNames.includes(e.blockName))
}

/** Place one of these blocks (block `properties.name`). */
export function placed(...blockNames: string[]): EventTrigger {
  return on('block-placed', (e) => blockNames.includes(e.blockName))
}

/** Craft one of these items (optionally at a given station). */
export function crafted(items: readonly string[] | null, station?: string): EventTrigger {
  return on('item-crafted', (e) => (!items || items.includes(e.itemId)) && (!station || e.station === station))
}

/** Eat/drink one of these items. */
export function consumed(...items: string[]): EventTrigger {
  return on('item-consumed', (e) => items.includes(e.itemId))
}

/** Kill an entity (optionally of given types / below a Y level). */
export function killed(options: { types?: readonly string[]; belowY?: number } = {}): EventTrigger {
  return on(
    'entity-killed',
    (e) =>
      (!options.types || options.types.includes(e.entityType)) &&
      (options.belowY === undefined || e.y < options.belowY)
  )
}

/** Enter a biome (BiomeType string) on a layer. */
export function enteredBiome(biome: string, layer: 0 | 1): EventTrigger {
  return on('biome-entered', (e) => e.biome === biome && e.layer === layer)
}

/** Enter any biome of a layer (0 = Hell). */
export function enteredLayer(layer: 0 | 1): EventTrigger {
  return on('biome-entered', (e) => e.layer === layer)
}

/** Reach a dungeon (any, or one of these dungeon ids). */
export function enteredDungeon(...dungeonIds: string[]): EventTrigger {
  return on('dungeon-entered', (e) => dungeonIds.length === 0 || dungeonIds.includes(e.dungeonId))
}

/** Defeat a guardian. */
export function defeated(guardianId: string): EventTrigger {
  return on('guardian-defeated', (e) => e.guardianId === guardianId)
}

/** Gain a status effect (any, or one of these). */
export function effectApplied(...effectIds: string[]): EventTrigger {
  return on('effect-applied', (e) => effectIds.length === 0 || effectIds.includes(e.effectId))
}

/** Feet below this Y. */
export function reachedDepth(belowY: number): DepthTrigger {
  return { kind: 'depth', belowY }
}
