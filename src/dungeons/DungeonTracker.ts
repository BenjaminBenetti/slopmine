import * as THREE from 'three'
import { gameEvents } from '../events/GameEvents.ts'
import { LAYER_BOUNDARY_Y } from '../world/generate/GenerationConfig.ts'
import { findNearestDungeon, type LocatedDungeon } from './DungeonLocator.ts'

/** Horizontal distance (blocks) from a dungeon anchor that counts as entering it. */
export const DUNGEON_ENTER_RADIUS = 32

/** How far from a defeated guardian its dungeon's anchor may be. */
const DEFEAT_MATCH_RADIUS = 96

/** Seconds between dungeon-entered probes. */
const ENTER_POLL_INTERVAL = 1

/** Player-data key for cleared dungeons. */
export const DUNGEON_DATA_KEY = 'dungeons'

interface SavedDungeonData {
  version: 1
  cleared: string[]
}

/** Stable key of one dungeon instance (type + anchor column). */
export function dungeonKey(dungeon: { dungeonId: string; x: number; z: number }): string {
  return `${dungeon.dungeonId}@${Math.round(dungeon.x)},${Math.round(dungeon.z)}`
}

export interface DungeonTrackerDeps {
  /** The player's feet position (live reference). */
  playerPosition: THREE.Vector3
  getSeed(): number
  isLoading(): boolean
}

/**
 * Dungeon bookkeeping on top of the locators:
 *
 * - emits `dungeon-entered` once per dungeon per session when the player (on
 *   the Hell layer) comes within DUNGEON_ENTER_RADIUS blocks horizontally of
 *   a located dungeon anchor (polled once a second);
 * - remembers which dungeons are cleared: a `guardian-defeated` event marks
 *   the located dungeon nearest the defeat position. Saved with the player
 *   data (key 'dungeons') so the Sigil Compass can prefer uncleared ones.
 */
export class DungeonTracker {
  private readonly deps: DungeonTrackerDeps
  private readonly entered = new Set<string>()
  private readonly cleared = new Set<string>()
  private pollTimer = 0

  constructor(deps: DungeonTrackerDeps) {
    this.deps = deps
    gameEvents.on('guardian-defeated', (event) => {
      const dungeon = findNearestDungeon(event.x, event.z, this.deps.getSeed(), DEFEAT_MATCH_RADIUS)
      if (dungeon) this.cleared.add(dungeonKey(dungeon))
    })
  }

  /** Has this dungeon's guardian been defeated (as far as this save knows)? */
  isCleared(dungeon: { dungeonId: string; x: number; z: number }): boolean {
    return this.cleared.has(dungeonKey(dungeon))
  }

  /** Number of dungeons known cleared (changes when one is cleared). */
  get clearedCount(): number {
    return this.cleared.size
  }

  /** Mark a dungeon cleared (also done automatically on guardian-defeated). */
  markCleared(dungeon: { dungeonId: string; x: number; z: number }): void {
    this.cleared.add(dungeonKey(dungeon))
  }

  /** Saved form (player data contributor). */
  serialize(): SavedDungeonData {
    return { version: 1, cleared: Array.from(this.cleared) }
  }

  /** Merge saved data (tolerates missing/unknown fields). */
  restore(data: unknown): void {
    if (!data || typeof data !== 'object') return
    const cleared = (data as Partial<SavedDungeonData>).cleared
    if (!Array.isArray(cleared)) return
    for (const key of cleared) {
      if (typeof key === 'string') this.cleared.add(key)
    }
  }

  update(deltaTime: number): void {
    this.pollTimer -= deltaTime
    if (this.pollTimer > 0) return
    this.pollTimer = ENTER_POLL_INTERVAL
    if (this.deps.isLoading()) return

    const player = this.deps.playerPosition
    if (player.y >= LAYER_BOUNDARY_Y) return
    const dungeon = findNearestDungeon(player.x, player.z, this.deps.getSeed(), DUNGEON_ENTER_RADIUS)
    if (!dungeon) return
    const key = dungeonKey(dungeon)
    if (this.entered.has(key)) return
    this.entered.add(key)
    this.emitEntered(dungeon)
  }

  private emitEntered(dungeon: LocatedDungeon): void {
    gameEvents.emit({
      type: 'dungeon-entered',
      dungeonId: dungeon.dungeonId,
      biome: dungeon.biome,
      x: dungeon.x,
      y: dungeon.y,
      z: dungeon.z,
    })
  }
}
