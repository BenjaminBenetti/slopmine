/**
 * Game-wide gameplay event bus.
 *
 * A tiny typed publish/subscribe channel so systems that care about what the
 * player does (the progression journal, guardian bookkeeping, tutorials...)
 * never reach into the systems that do it. Emitters fire plain event objects;
 * listeners subscribe by event type and get an unsubscribe function back.
 *
 * Emitting is synchronous and cheap when nobody listens. A throwing listener
 * is logged and never breaks the emitter or the other listeners.
 */

/** Where an item was crafted. Station ids match RecipeBook's CraftingStation. */
export type CraftStation = 'hand' | 'forge' | 'apothecary' | 'woodworking' | 'hellforge'

export type GameEvent =
  /** The player finished mining a block (fired before the block turns to air). */
  | {
      type: 'block-mined'
      blockId: number
      blockName: string
      x: number
      y: number
      z: number
      /** Held item id, or null for an empty hand. */
      toolId: string | null
    }
  /** The player placed a block. */
  | { type: 'block-placed'; blockId: number; blockName: string; x: number; y: number; z: number }
  /** Items entered the player's inventory (pickups, drops, crafts, loot...). */
  | { type: 'item-added'; itemId: string; count: number }
  /**
   * A crafting station produced an item for the player. World stations that
   * finish on their own (forge, apothecary) include their block position.
   */
  | { type: 'item-crafted'; itemId: string; count: number; station: CraftStation; x?: number; y?: number; z?: number }
  /** The player picked a dropped item up off the ground (`count` = what fit). */
  | { type: 'item-picked-up'; itemId: string; count: number }
  /** The player finished eating/drinking a consumable. */
  | { type: 'item-consumed'; itemId: string }
  /**
   * The player's melee hit landed on an entity (`charge` 0-1; `killed` when it
   * took it down; `blocked` when a shield or ward turned it aside).
   */
  | { type: 'entity-hit'; entityType: string; x: number; y: number; z: number; charge: number; killed: boolean; blocked: boolean }
  /** The player's hit killed an entity. */
  | { type: 'entity-killed'; entityType: string; x: number; y: number; z: number }
  /**
   * The player took damage. `environmental` = lava, burning, hot floors,
   * poison and other ticks without invincibility frames.
   */
  | { type: 'player-hurt'; amount: number; environmental: boolean }
  /** The camera moved into a different biome region (or layer). */
  | { type: 'biome-entered'; biome: string; layer: 0 | 1 }
  /** The player died. */
  | { type: 'player-died' }
  /** The player came within reach of a dungeon (first time per dungeon per session). */
  | { type: 'dungeon-entered'; dungeonId: string; biome: string; x: number; y: number; z: number }
  /** A dungeon guardian (boss) was defeated. */
  | { type: 'guardian-defeated'; guardianId: string; x: number; y: number; z: number }
  /** A status effect started or was refreshed on the player. */
  | { type: 'effect-applied'; effectId: string; durationSeconds: number }
  /** Night fell on the overworld (`day` = the day it belongs to, from 1). */
  | { type: 'nightfall'; day: number }
  /**
   * The sun rose. `day` = the new day; `survived` when the player saw the whole
   * night through without dying.
   */
  | { type: 'daybreak'; day: number; survived: boolean }

export type GameEventType = GameEvent['type']
export type GameEventOf<T extends GameEventType> = Extract<GameEvent, { type: T }>
export type GameEventListener<T extends GameEventType> = (event: GameEventOf<T>) => void

export class GameEventBus {
  private readonly listeners = new Map<GameEventType, Set<(event: GameEvent) => void>>()
  private readonly anyListeners = new Set<(event: GameEvent) => void>()

  /** Subscribe to one event type. Returns an unsubscribe function. */
  on<T extends GameEventType>(type: T, listener: GameEventListener<T>): () => void {
    let set = this.listeners.get(type)
    if (!set) {
      set = new Set()
      this.listeners.set(type, set)
    }
    const wrapped = listener as (event: GameEvent) => void
    set.add(wrapped)
    return () => {
      set.delete(wrapped)
    }
  }

  /** Subscribe to every event. Returns an unsubscribe function. */
  onAny(listener: (event: GameEvent) => void): () => void {
    this.anyListeners.add(listener)
    return () => {
      this.anyListeners.delete(listener)
    }
  }

  emit(event: GameEvent): void {
    const set = this.listeners.get(event.type)
    if (set) {
      for (const listener of set) this.dispatch(listener, event)
    }
    for (const listener of this.anyListeners) this.dispatch(listener, event)
  }

  private dispatch(listener: (event: GameEvent) => void, event: GameEvent): void {
    try {
      listener(event)
    } catch (error) {
      console.error(`[GameEvents] listener for '${event.type}' threw:`, error)
    }
  }
}

/** The game's single event bus. */
export const gameEvents = new GameEventBus()
