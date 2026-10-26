import * as THREE from 'three'
import type { TaskScheduler } from '../core/TaskScheduler.ts'
import { TaskPriority } from '../core/interfaces/ITask.ts'
import type { PlayerHealth } from '../player/PlayerHealth.ts'
import type { HealthDisplayUI } from '../ui/HealthDisplay.ts'
import { createBreathDisplayUI } from '../ui/BreathDisplay.ts'
import { applyDamageModifiers } from '../player/DamageModifiers.ts'
import { playerEffects, StatusEffectIds } from '../player/effects/StatusEffects.ts'
import type { EntitySpawner } from '../entities/spawning/EntitySpawner.ts'
import type { EntitySpawnConfig } from '../entities/spawning/EntitySpawnConfig.ts'
import { FishEntity } from '../entities/aquatic/FishEntity.ts'
import { getFishSpecies } from '../entities/aquatic/FishSpecies.ts'
import { createItemFromId } from '../persistence/ItemRegistry.ts'
import { Hydrology } from '../world/generate/water/Hydrology.ts'
import type { IPhysicsBody } from '../physics/interfaces/IPhysicsBody.ts'
import type { IEntity } from '../entities/interfaces/IEntity.ts'
import { WaterParticles } from '../renderer/water/WaterParticles.ts'
import { setWaterEffects, waterBubbles, waterSplash } from './WaterEffects.ts'
import { waterAmbience } from './WaterHooks.ts'
import type { IBlockProperties } from '../world/interfaces/IBlock.ts'
import { EYE_HEIGHT } from '../physics/constants.ts'
import { getCellLiquidFamily } from '../world/liquid/cellLiquid.ts'

/** Seconds of air the player has under water. */
export const MAX_AIR = 15
/** Air regained per second at the surface (a deep breath refills it in ~2.5 s). */
const AIR_REFILL = 6
/** Out of air: this much damage, every DROWN_INTERVAL seconds. */
const DROWN_DAMAGE = 2
const DROWN_INTERVAL = 1

/** A fish species' spawning: how often, how many alive, how deep the water must be. */
interface FishSpawn {
  readonly type: string
  readonly spawnRate: number
  readonly maxNearby: number
  readonly minWaterDepth?: number
}
/** The open sea (Hydrology: the continent field below 0) - in the Ocean biome and the land biomes' coastal waters. */
const SEA_FISH: readonly FishSpawn[] = [
  { type: 'cod', spawnRate: 0.25, maxNearby: 12, minWaterDepth: 8 },
  { type: 'reef_fish', spawnRate: 0.3, maxNearby: 14, minWaterDepth: 2 },
  { type: 'jellyfish', spawnRate: 0.12, maxNearby: 6, minWaterDepth: 5 },
]
/** Rivers, streams and lakes, by biome. */
const FRESHWATER_FISH: Readonly<Record<string, readonly FishSpawn[]>> = {
  plains: [{ type: 'minnow', spawnRate: 0.35, maxNearby: 14 }, { type: 'trout', spawnRate: 0.18, maxNearby: 6 }],
  'grassy-hills': [{ type: 'minnow', spawnRate: 0.35, maxNearby: 14 }, { type: 'trout', spawnRate: 0.18, maxNearby: 6 }],
  'pine-forest': [
    { type: 'minnow', spawnRate: 0.3, maxNearby: 12 },
    { type: 'trout', spawnRate: 0.15, maxNearby: 5 },
    { type: 'salmon', spawnRate: 0.18, maxNearby: 8 },
  ],
  'coastal-rainforest': [
    { type: 'minnow', spawnRate: 0.3, maxNearby: 12 },
    { type: 'salmon', spawnRate: 0.2, maxNearby: 8 },
    { type: 'trout', spawnRate: 0.12, maxNearby: 5 },
  ],
  jungle: [{ type: 'minnow', spawnRate: 0.3, maxNearby: 12 }, { type: 'catfish', spawnRate: 0.15, maxNearby: 4 }],
  swamp: [{ type: 'catfish', spawnRate: 0.2, maxNearby: 4 }, { type: 'minnow', spawnRate: 0.25, maxNearby: 10 }],
  desert: [{ type: 'minnow', spawnRate: 0.25, maxNearby: 10 }],
  ocean: [{ type: 'minnow', spawnRate: 0.2, maxNearby: 8 }],
}

export interface WaterDeps {
  readonly scheduler: TaskScheduler
  readonly entitySpawner: EntitySpawner
  readonly entityManager: { getEntitiesNear(position: THREE.Vector3, radius: number): IEntity[] }
  readonly seed: number
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly getViewportHeight: () => number
  readonly playerBody: IPhysicsBody
  readonly world: { getBlockFast(x: number, y: number, z: number): { readonly properties: IBlockProperties } }
  /** The water's current in a block (WaterCurrents), blocks/s into `out`. */
  readonly currentAt: (x: number, y: number, z: number, out: THREE.Vector3) => void
  /** The player's controls (`headUnderWater`: the eyes below the surface; `swimming`). */
  readonly cameraControls: { readonly headUnderWater: boolean; readonly swimming: boolean }
  readonly playerHealth: PlayerHealth
  readonly healthDisplay: HealthDisplayUI
}

export interface WaterSystem {
  /** Seconds of air left. */
  readonly air: number
}

/**
 * The water's runtime systems (the world's oceans and rivers come from
 * Hydrology, swimming from the physics engine and the player controls):
 * - the player's air under water: bubbles above the hearts, drowning when it
 *   runs out ('magic' damage: armor doesn't help); a Water Breathing potion
 *   keeps it full
 * - fish: an EntitySpawner provider spawning schools in the water - sea fish
 *   out at sea, river and lake fish by biome (FishEntity, FISH_SPECIES)
 * - the water's particles (WaterParticles, behind the WaterEffects hooks):
 *   splashes when the player, a mob or a drop lands in the water, small ones
 *   while swimming along the surface, bubbles from the player under water
 *   (boats make their own wakes)
 */
export function setupWater(deps: WaterDeps): WaterSystem {
  const { playerHealth } = deps
  registerFishSpawns(deps.entitySpawner, deps.seed)
  const particles = new WaterParticles()
  deps.scene.add(particles.object)
  setWaterEffects(particles)
  const splashes = createSplashWatcher(deps)
  const listen = createWaterListener(deps)
  const breathDisplay = createBreathDisplayUI()
  deps.healthDisplay.attachAbove(breathDisplay.root)

  let air = MAX_AIR
  let drownClock = 0
  const result = { completed: true, elapsedMs: 0, workUnits: 0 }
  deps.scheduler.registerTask({
    id: 'water',
    priority: TaskPriority.CRITICAL,
    enabled: true,
    execute(deltaTime: number) {
      if (playerHealth.isDead) {
        air = MAX_AIR
        drownClock = 0
      } else if (deps.cameraControls.headUnderWater && !playerEffects.has(StatusEffectIds.WATER_BREATHING)) {
        air = Math.max(0, air - deltaTime)
        if (air <= 0) {
          drownClock += deltaTime
          if (drownClock >= DROWN_INTERVAL) {
            drownClock -= DROWN_INTERVAL
            const amount = applyDamageModifiers(DROWN_DAMAGE, 'magic')
            if (amount > 0) playerHealth.takeEnvironmentalDamage(amount)
          }
        }
      } else {
        air = Math.min(MAX_AIR, air + AIR_REFILL * deltaTime)
        drownClock = 0
      }
      breathDisplay.update(air, MAX_AIR)
      splashes(deltaTime)
      listen(deltaTime)
      particles.update(deltaTime, deps.getViewportHeight() / (2 * Math.tan(THREE.MathUtils.degToRad(deps.camera.fov) / 2)))
      return result
    },
  })

  return {
    get air() {
      return air
    },
  }
}

/** Seconds between bubble breaths under water, and between scans of the mobs near the player for splashes. */
const BREATH_EVERY: readonly [number, number] = [1.2, 2.6]
const ENTITY_SCAN = 0.1
const SPLASH_RANGE = 32

/**
 * Splashes and bubbles from what moves around the water: the player's
 * landings, swimming and breath, and mobs and drops falling in near them.
 */
function createSplashWatcher(deps: WaterDeps): (deltaTime: number) => void {
  const body = deps.playerBody
  let wasIn = false
  let lastVy = 0
  let strokeClock = 0
  let breathClock = 1.5
  let scanClock = 0
  const entityState = new WeakMap<IPhysicsBody, number>()
  return (deltaTime: number) => {
    const inWater = body.submerged > 0.12
    const surface = body.waterSurfaceY
    // Landing in the water (and leaping out of it)
    if (inWater && !wasIn && lastVy < -4 && Number.isFinite(surface)) {
      waterSplash(body.position.x, surface, body.position.z, Math.min(1.5, -lastVy / 12))
    }
    wasIn = inWater
    lastVy = body.velocity.y
    // Strokes along the surface
    strokeClock -= deltaTime
    const moving = Math.hypot(body.velocity.x, body.velocity.z) > 1.5
    if (deps.cameraControls.swimming && !deps.cameraControls.headUnderWater && moving && strokeClock <= 0 && Number.isFinite(surface)) {
      strokeClock = 0.45 + Math.random() * 0.25
      waterSplash(body.position.x, surface, body.position.z, 0.12)
    }
    // Breath bubbles under water
    breathClock -= deltaTime
    if (deps.cameraControls.headUnderWater && breathClock <= 0 && Number.isFinite(surface)) {
      breathClock = BREATH_EVERY[0] + Math.random() * (BREATH_EVERY[1] - BREATH_EVERY[0])
      const fx = -Math.sin(deps.camera.rotation.y) * 0.3
      const fz = -Math.cos(deps.camera.rotation.y) * 0.3
      waterBubbles(body.position.x + fx, body.position.y + EYE_HEIGHT - 0.15, body.position.z + fz, surface, 2 + Math.floor(Math.random() * 3))
    }
    // Mobs and drops falling in
    scanClock -= deltaTime
    if (scanClock > 0) return
    scanClock = ENTITY_SCAN
    for (const entity of deps.entityManager.getEntitiesNear(body.position, SPLASH_RANGE)) {
      const other = entity.getPhysicsBody()
      if (!other || other === body || other.skipPhysics) continue
      const was = entityState.get(other) ?? 0
      const now = other.submerged
      if (now > 0.12 && was <= 0.12 && Number.isFinite(other.waterSurfaceY) && other.velocity.y < -2.5) {
        const size = Math.min(1, other.hitboxSize.x * other.hitboxSize.y)
        waterSplash(other.position.x, other.waterSurfaceY, other.position.z, Math.min(1.2, (-other.velocity.y / 14) * (0.4 + size)))
      }
      entityState.set(other, now)
    }
  }
}

/** The water the player hears (WaterHooks.waterAmbience), surveyed about once a second. */
const LISTEN_EVERY = 1
const LISTEN_RINGS: ReadonlyArray<readonly [number, number]> = [[10, 8], [24, 12], [44, 16]]

/**
 * Surf and rivers for the ambience: the share of open water on rings around
 * the player (lots of it near and far: the sea, or a big lake - surf), and
 * the fastest current in the water close by (a river or stream babbling).
 * Reads the blocks, so a saved world without the new seas stays quiet.
 */
function createWaterListener(deps: WaterDeps): (deltaTime: number) => void {
  let clock = 0
  const current = new THREE.Vector3()
  const p = deps.playerBody.position
  const surfaceAt = (x: number, z: number): number | null => {
    const top = Math.floor(p.y) + 6
    for (let y = top; y >= top - 18; y--) {
      const props = deps.world.getBlockFast(x, y, z).properties
      const family = getCellLiquidFamily(props)
      if (family !== undefined && family !== 'lava') return y
      if (props.isSolid) return null
    }
    return null
  }
  return (deltaTime: number) => {
    clock -= deltaTime
    if (clock > 0) return
    clock = LISTEN_EVERY
    let wet = 0
    let total = 0
    let river = 0
    for (const [radius, count] of LISTEN_RINGS) {
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2
        const x = Math.floor(p.x + Math.cos(angle) * radius)
        const z = Math.floor(p.z + Math.sin(angle) * radius)
        const surface = surfaceAt(x, z)
        total += radius >= 24 ? 1.5 : 1
        if (surface === null) continue
        wet += radius >= 24 ? 1.5 : 1
        if (radius <= 24) {
          deps.currentAt(x, surface, z, current)
          const speed = Math.hypot(current.x, current.z)
          river = Math.max(river, Math.min(1, speed / 1.8) * (radius <= 10 ? 1 : 0.6))
        }
      }
    }
    const share = total > 0 ? wet / total : 0
    const target = { sea: Math.max(0, Math.min(1, (share - 0.3) / 0.45)), river }
    // Ease toward the survey (no jumps when the player turns a corner)
    waterAmbience.sea += (target.sea - waterAmbience.sea) * 0.5
    waterAmbience.river += (target.river - waterAmbience.river) * 0.5
  }
}

/** Fish schools as an EntitySpawner provider (fish spawn in the water, not on ground). */
function registerFishSpawns(spawner: EntitySpawner, seed: number): void {
  const hydrology = Hydrology.forSeed(seed)
  const toConfigs = (spawns: readonly FishSpawn[]): EntitySpawnConfig[] =>
    spawns.flatMap((spawn) => {
      const species = getFishSpecies(spawn.type)
      if (!species) return []
      const drop = species.drop
      return [{
        entityType: species.type,
        spawnRate: spawn.spawnRate,
        maxNearby: spawn.maxNearby,
        medium: 'water' as const,
        waters: species.waters,
        minWaterDepth: spawn.minWaterDepth ?? 2,
        minY: 150,
        createEntity: (position) => new FishEntity({
          position,
          species,
          createDrop: drop ? () => createItemFromId(drop) : undefined,
        }),
      }]
    })
  const sea = toConfigs(SEA_FISH)
  const freshwater = new Map(Object.entries(FRESHWATER_FISH).map(([biome, spawns]) => [biome, toConfigs(spawns)]))
  spawner.addSpawnProvider((biome, layer, position) => {
    if (layer !== 1) return undefined
    return hydrology.isOcean(position.x, position.z) ? sea : freshwater.get(biome)
  })
}
