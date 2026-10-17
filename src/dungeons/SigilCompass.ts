import * as THREE from 'three'
import { biomeRegistry } from '../world/generate/biomes/BiomeRegistry.ts'
import { LAYER_BOUNDARY_Y } from '../world/generate/GenerationConfig.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../world/interfaces/IChunk.ts'
import { findNearestDungeon, getDungeonLocatorsForBiome, type LocatedDungeon } from './DungeonLocator.ts'
import type { DungeonTracker } from './DungeonTracker.ts'
import type { SigilCompassHud } from '../ui/SigilCompassHud.ts'

/** Item id of the Sigil Compass. */
export const SIGIL_COMPASS_ITEM_ID = 'sigil_compass'

/** How far (blocks, horizontal) the sigil can sense a dungeon. */
export const SIGIL_COMPASS_RANGE = 1024

/** Re-locate at least this often (seconds) while held... */
const REFRESH_INTERVAL = 2
/** ...or when the player moved this far (blocks) since the last lookup. */
const REFRESH_DISTANCE = 16
/** Within this horizontal distance the player has arrived. */
const ARRIVED_DISTANCE = 10
/** Height differences shown from this many blocks. */
const SHOW_HEIGHT_FROM = 6

/** The uncleared-dungeon probe sweep is reused within this many blocks. */
const UNCLEARED_CACHE_DISTANCE = 64

const SILENT = 'The sigil is silent'

export interface SigilCompassDeps {
  camera: THREE.Camera
  /** The player's feet position (live reference). */
  playerPosition: THREE.Vector3
  /** Is the compass in the selected toolbar slot? */
  isHoldingCompass(): boolean
  getSeed(): number
  tracker: DungeonTracker
  hud: SigilCompassHud
}

interface CompassTarget {
  readonly dungeon: LocatedDungeon
  readonly cleared: boolean
}

/**
 * The Sigil Compass: while held, points the HUD needle at the nearest
 * dungeon of the Hell biome the player stands in (via the registered dungeon
 * locators), preferring dungeons whose guardian is not yet defeated. Silent
 * on the surface, in a biome without a locator, or with nothing in range.
 *
 * Locator lookups are cached: re-run every REFRESH_INTERVAL seconds or after
 * REFRESH_DISTANCE blocks of movement, only while the compass is held. Per
 * frame it only turns the needle.
 */
export class SigilCompass {
  private readonly deps: SigilCompassDeps
  private target: CompassTarget | null = null
  private silentMessage = SILENT
  private refreshTimer = 0
  private readonly lastQuery = new THREE.Vector3(Infinity, 0, Infinity)
  private readonly forward = new THREE.Vector3()
  private bearing = 0
  private unclearedCache: {
    x: number
    z: number
    seed: number
    biome: string
    clearedCount: number
    result: LocatedDungeon | null
  } | null = null

  constructor(deps: SigilCompassDeps) {
    this.deps = deps
  }

  /** The dungeon the needle points at (null when silent). For tests/debug. */
  getTarget(): (LocatedDungeon & { cleared: boolean }) | null {
    return this.target ? { ...this.target.dungeon, cleared: this.target.cleared } : null
  }

  /** Force a fresh locator lookup on the next update. */
  invalidate(): void {
    this.refreshTimer = 0
  }

  update(deltaTime: number): void {
    const { hud, playerPosition: player } = this.deps
    if (!this.deps.isHoldingCompass()) {
      hud.setVisible(false)
      this.refreshTimer = 0
      return
    }
    hud.setVisible(true)

    this.refreshTimer -= deltaTime
    const dx = player.x - this.lastQuery.x
    const dz = player.z - this.lastQuery.z
    if (this.refreshTimer <= 0 || dx * dx + dz * dz > REFRESH_DISTANCE * REFRESH_DISTANCE) {
      this.refreshTimer = REFRESH_INTERVAL
      this.lastQuery.copy(player)
      this.locate()
    }

    const target = this.target
    if (!target) {
      hud.show({ kind: 'silent', message: this.silentMessage })
      hud.update(deltaTime)
      return
    }

    const tx = target.dungeon.x - player.x
    const tz = target.dungeon.z - player.z
    const distance = Math.hypot(tx, tz)
    this.deps.camera.getWorldDirection(this.forward)
    const fLen = Math.hypot(this.forward.x, this.forward.z)
    if (fLen > 1e-3) {
      const fx = this.forward.x / fLen
      const fz = this.forward.z / fLen
      // right = (-fz, fx); + bearing = target to the right
      this.bearing = Math.atan2(tx * -fz + tz * fx, tx * fx + tz * fz)
    }

    const dy = target.dungeon.y - player.y
    let detail = distance < ARRIVED_DISTANCE ? 'You stand upon it' : `${Math.round(distance)} blocks`
    if (Math.abs(dy) >= SHOW_HEIGHT_FROM) {
      detail += ` · ${Math.round(Math.abs(dy))} ${dy > 0 ? 'above' : 'below'}`
    }
    hud.show({
      kind: 'target',
      name: target.dungeon.displayName,
      detail,
      bearing: this.bearing,
      arrived: distance < ARRIVED_DISTANCE,
      cleared: target.cleared,
    })
    hud.update(deltaTime)
  }

  /** Re-run the locators for the biome under the player. */
  private locate(): void {
    const player = this.deps.playerPosition
    this.target = null
    if (player.y >= LAYER_BOUNDARY_Y) {
      this.silentMessage = SILENT
      return
    }
    const seed = this.deps.getSeed()
    const { regionX, regionZ } = biomeRegistry.getRegionCoords(
      Math.floor(player.x / CHUNK_SIZE_X),
      Math.floor(player.z / CHUNK_SIZE_Z)
    )
    const biome = biomeRegistry.selectBiomeForLayer(regionX, regionZ, seed, 0)
    if (getDungeonLocatorsForBiome(biome).length === 0) {
      this.silentMessage = SILENT
      return
    }

    const nearest = findNearestDungeon(player.x, player.z, seed, SIGIL_COMPASS_RANGE, { biome })
    if (!nearest) {
      this.silentMessage = SILENT
      return
    }
    if (!this.deps.tracker.isCleared(nearest)) {
      this.target = { dungeon: nearest, cleared: false }
      return
    }
    const uncleared = this.cachedUncleared(player.x, player.z, seed, biome)
    this.target = uncleared ? { dungeon: uncleared, cleared: false } : { dungeon: nearest, cleared: true }
  }

  /**
   * findNearestUncleared, reused while the player stays within
   * UNCLEARED_CACHE_DISTANCE of where it ran (same biome, seed and cleared set):
   * the probe sweep is a few dozen locator calls.
   */
  private cachedUncleared(x: number, z: number, seed: number, biome: string): LocatedDungeon | null {
    const cache = this.unclearedCache
    const clearedCount = this.deps.tracker.clearedCount
    if (
      cache &&
      cache.biome === biome &&
      cache.seed === seed &&
      cache.clearedCount === clearedCount &&
      Math.hypot(cache.x - x, cache.z - z) <= UNCLEARED_CACHE_DISTANCE
    ) {
      return cache.result
    }
    const result = this.findNearestUncleared(x, z, seed, biome)
    this.unclearedCache = { x, z, seed, biome, clearedCount, result }
    return result
  }

  /**
   * The nearest uncleared dungeon of `biome` in range. Locators only answer
   * "nearest to a point", so probe a few rings of points around the player
   * and keep the closest uncleared answer (only runs when the nearest
   * dungeon is cleared).
   */
  private findNearestUncleared(x: number, z: number, seed: number, biome: string): LocatedDungeon | null {
    const { tracker } = this.deps
    let best: LocatedDungeon | null = null
    let bestDistance = Infinity
    const probeRadius = SIGIL_COMPASS_RANGE / 2
    for (const ring of [0.25, 0.5, 0.75]) {
      const r = SIGIL_COMPASS_RANGE * ring
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + ring
        const found = findNearestDungeon(x + Math.cos(angle) * r, z + Math.sin(angle) * r, seed, probeRadius, { biome })
        if (!found || tracker.isCleared(found)) continue
        const distance = Math.hypot(found.x - x, found.z - z)
        if (distance > SIGIL_COMPASS_RANGE || distance >= bestDistance) continue
        best = { ...found, distance }
        bestDistance = distance
      }
    }
    return best
  }
}
