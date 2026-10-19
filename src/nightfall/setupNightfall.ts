import * as THREE from 'three'
import type { EntityManager } from '../entities/EntityManager.ts'
import type { EntitySpawner } from '../entities/spawning/EntitySpawner.ts'
import type { EntitySpawnConfig } from '../entities/spawning/EntitySpawnConfig.ts'
import type { IEntity } from '../entities/interfaces/IEntity.ts'
import type { IItem } from '../items/Item.ts'
import { BlockIds } from '../world/blocks/BlockIds.ts'
import { BlockRegistry } from '../world/blocks/BlockRegistry.ts'
import { worldClock } from '../daynight/WorldClock.ts'
import { gameEvents } from '../events/GameEvents.ts'
import { showPlayerNotice } from '../ui/PlayerNotice.ts'
import { playSleepFade } from '../ui/SleepFade.ts'
import { registerSleepHandler } from '../daynight/sleep.ts'
import { registerNightSenses, type PlayerGaze } from '../entities/night/NightSenses.ts'
import { StillwatcherEntity } from '../entities/night/stillwatcher/index.ts'
import { DuskmothEntity } from '../entities/night/duskmoth/index.ts'
import { SandmawEntity } from '../entities/night/sandmaw/index.ts'
import { AshwalkerEntity } from '../entities/night/ashwalker/index.ts'
import { MireAnglerEntity } from '../entities/night/mire_angler/index.ts'
import { HollowStagEntity } from '../entities/night/hollow_stag/index.ts'
import { OrchidMantisEntity } from '../entities/night/orchid_mantis/index.ts'
import { wardLanterns } from './WardLanterns.ts'
import { NIGHT_CREATURE_TYPES } from './NightCreatureTypes.ts'
import { LAYER_BOUNDARY_Y } from '../world/generate/GenerationConfig.ts'

/** Night creatures alive around the player at once, all kinds together. */
const NIGHT_CREATURE_CAP = 6
/** They rise between 24 (the spawner's minimum) and this many blocks from the player. */
const NIGHT_SPAWN_DISTANCE = 64
/** Under (mostly) open sky: never inside a roofed hut or deep under an overhang. */
const NIGHT_MIN_SKY_LIGHT = 8
/** Torch light keeps them away (a torch covers about 6 blocks around it). */
const NIGHT_MAX_BLOCK_LIGHT = 7
/** No sleeping while a night creature is this close (blocks). */
const SLEEP_SAFE_RADIUS = 16

const VEGETATED = ['plains', 'grassy-hills', 'pine-forest', 'coastal-rainforest', 'jungle', 'swamp']

interface NightCreatureDef {
  readonly entityType: string
  readonly biomes: readonly string[]
  /** Spawn chance per chunk within reach per spawner cycle (20 s). */
  readonly spawnRate: number
  readonly maxNearby: number
  readonly validGroundBlocks?: number[]
  readonly create: (position: THREE.Vector3) => IEntity
}

/**
 * Every night creature: one or two hunt in each surface biome. The Hell
 * layer has no night.
 */
const NIGHT_CREATURES: readonly NightCreatureDef[] = [
  // Plains and hills: a scarecrow that only moves while unwatched
  { entityType: 'stillwatcher', biomes: ['plains', 'grassy-hills'], spawnRate: 0.08, maxNearby: 2, create: (p) => new StillwatcherEntity({ position: p }) },
  // Wherever things grow: moths drawn to torchlight
  { entityType: 'duskmoth', biomes: VEGETATED, spawnRate: 0.07, maxNearby: 3, create: (p) => new DuskmothEntity({ position: p }) },
  // Desert: a burrower that swims through sand and erupts beneath its prey
  {
    entityType: 'sandmaw', biomes: ['desert'], spawnRate: 0.1, maxNearby: 2,
    validGroundBlocks: [BlockIds.SAND, BlockIds.SANDSTONE],
    create: (p) => new SandmawEntity({ position: p }),
  },
  // Volcanic: ember-veined husks whose blows set you alight
  { entityType: 'ashwalker', biomes: ['volcanic'], spawnRate: 0.09, maxNearby: 3, create: (p) => new AshwalkerEntity({ position: p }) },
  // Swamp: an ambusher hiding under a glowing lure
  { entityType: 'mire_angler', biomes: ['swamp'], spawnRate: 0.06, maxNearby: 2, create: (p) => new MireAnglerEntity({ position: p }) },
  // Pine forest: a skull-faced stag that charges - lure it into a trunk
  { entityType: 'hollow_stag', biomes: ['pine-forest'], spawnRate: 0.04, maxNearby: 1, create: (p) => new HollowStagEntity({ position: p }) },
  // Jungle and rainforest: a mantis disguised as a flowering bush
  { entityType: 'orchid_mantis', biomes: ['jungle', 'coastal-rainforest'], spawnRate: 0.07, maxNearby: 2, create: (p) => new OrchidMantisEntity({ position: p }) },
]


export interface NightfallSetupDeps {
  readonly entityManager: EntityManager
  readonly entitySpawner: EntitySpawner
  readonly camera: THREE.Camera
  readonly playerBody: { readonly position: THREE.Vector3 }
  /** The selected hotbar item (for "carrying a light"). */
  readonly getHeldItem: () => IItem | null
  /** Packed light (`sky << 4 | block`) at a world position. */
  readonly getPackedLight: (x: number, y: number, z: number) => number
  /** Set the player burning (EnvironmentalDamage.ignite). */
  readonly ignitePlayer: (ticks: number) => void
  /** Jump to the next morning (setupDayNight). */
  readonly skipToMorning: () => void
}

/**
 * Wire the night: night creatures join each surface biome's spawns (only
 * after dusk, under open sky, out of torch light and Ward Lantern reach,
 * NIGHT_CREATURE_CAP at a time), the senses they hunt by (the player's gaze,
 * carried light), sleeping through the night in a bed, and the nightfall
 * notice. They leave by themselves at dawn (DawnRetreat).
 */
export function setupNightfall(deps: NightfallSetupDeps): void {
  const countNightCreatures = (): number => {
    let count = 0
    for (const type of NIGHT_CREATURE_TYPES) count += deps.entityManager.getEntitiesByType(type).length
    return count
  }
  const condition = (): boolean => worldClock.isNight && countNightCreatures() < NIGHT_CREATURE_CAP
  const veto = (x: number, y: number, z: number): boolean => wardLanterns.isWarded(x, y, z)

  const byBiome = new Map<string, EntitySpawnConfig[]>()
  for (const def of NIGHT_CREATURES) {
    const config: EntitySpawnConfig = {
      entityType: def.entityType,
      spawnRate: def.spawnRate,
      maxNearby: def.maxNearby,
      searchFromSky: true,
      validGroundBlocks: def.validGroundBlocks,
      maxSpawnDistance: NIGHT_SPAWN_DISTANCE,
      minSkyLight: NIGHT_MIN_SKY_LIGHT,
      maxBlockLight: NIGHT_MAX_BLOCK_LIGHT,
      condition,
      veto,
      createEntity: def.create,
    }
    for (const biome of def.biomes) {
      const list = byBiome.get(biome) ?? []
      list.push(config)
      byBiome.set(biome, list)
    }
  }
  deps.entitySpawner.addSpawnProvider((biome, layer) => (layer === 1 ? byBiome.get(biome) : undefined))

  // What night creatures sense beyond position: gaze, carried light, block light
  const gaze = { origin: new THREE.Vector3(), direction: new THREE.Vector3() }
  registerNightSenses({
    getPlayerGaze: (): PlayerGaze => {
      deps.camera.getWorldPosition(gaze.origin)
      deps.camera.getWorldDirection(gaze.direction)
      return gaze
    },
    isPlayerCarryingLight: () => {
      const item = deps.getHeldItem()
      if (!item || !('blockName' in item)) return false
      const block = BlockRegistry.getInstance().getBlockByName(String((item as { blockName: unknown }).blockName))
      return (block?.properties.lightLevel ?? 0) > 0
    },
    getBlockLight: (x, y, z) => deps.getPackedLight(x, y, z) & 15,
    ignitePlayer: deps.ignitePlayer,
  })

  // A bed at night: sleep until morning - unless something is prowling close by
  registerSleepHandler(() => {
    const p = deps.playerBody.position
    if (!worldClock.isNight || p.y < LAYER_BOUNDARY_Y) return 'day'
    for (const type of NIGHT_CREATURE_TYPES) {
      for (const creature of deps.entityManager.getEntitiesByType(type)) {
        if (creature.isAlive && !creature.isDying && creature.position.distanceTo(p) < SLEEP_SAFE_RADIUS) {
          showPlayerNotice('You may not rest now: something is prowling nearby.', 2800)
          return 'unsafe'
        }
      }
    }
    playSleepFade(deps.skipToMorning)
    return 'slept'
  })

  gameEvents.on('nightfall', () => {
    if (deps.playerBody.position.y >= LAYER_BOUNDARY_Y) showPlayerNotice('Night falls. Something stirs in the dark...', 3500)
  })
}
