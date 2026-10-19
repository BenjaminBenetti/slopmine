import * as THREE from 'three'
import type { TaskScheduler } from '../core/TaskScheduler.ts'
import { TaskPriority } from '../core/interfaces/ITask.ts'
import type { IBlock, IBlockProperties } from '../world/interfaces/IBlock.ts'
import { BlockTags } from '../world/blocks/tags/BlockTags.ts'
import { getCellLiquidFamily } from '../world/liquid/cellLiquid.ts'
import { LAYER_BOUNDARY_Y } from '../world/generate/GenerationConfig.ts'
import { worldClock } from '../daynight/WorldClock.ts'
import { ButterflySwarm } from './ButterflySwarm.ts'

/**
 * How thick the butterflies are in each surface biome (1 = all of them):
 * the jungle has them (Ben: "a good amount"), elsewhere only the odd one,
 * none on the plains, in the desert or the volcanic lands.
 */
const BUTTERFLY_DENSITY: Readonly<Record<string, number>> = {
  'jungle': 0.07,
  'grassy-hills': 0.015,
  'coastal-rainforest': 0.015,
  'pine-forest': 0.01,
  'swamp': 0.01,
}

/** Surface biomes whose water has dragonflies (everywhere with water but the volcanic lands). */
const NO_DRAGONFLIES: ReadonlySet<string> = new Set(['volcanic'])

/** Liquid families dragonflies skim over. */
const DRAGONFLY_WATERS: ReadonlySet<string> = new Set(['water', 'swamp_water'])

export interface ButterflySetupDeps {
  readonly scheduler: TaskScheduler
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly playerBody: { readonly position: THREE.Vector3 }
  /** Drawing-buffer height in pixels (render resolution). */
  readonly getViewportHeight: () => number
  readonly getBlock: (x: number, y: number, z: number) => IBlock
  /** Packed light (`sky << 4 | block`) at a world position. */
  readonly getPackedLight: (x: number, y: number, z: number) => number
  /** Biome and layer at a world position (WorldGenerator.getBiomeAtPosition). */
  readonly getBiome: (x: number, z: number, y: number) => { biome: string; layer: number }
}

/** Grass, flowers, ferns: not air, not solid, not liquid. */
function isPlant(properties: IBlockProperties): boolean {
  return properties.id !== 0 && !properties.isSolid && getCellLiquidFamily(properties) === undefined
}

/**
 * Butterflies over the meadows and dragonflies over the water by day: out in
 * the morning, gone at dusk (the fireflies take over in the swamp). The
 * CRITICAL 'butterflies' task advances the swarm (cheap: a few anchor picks
 * per frame, everything else in the shader).
 */
export function setupButterflies(deps: ButterflySetupDeps): void {
  const swarm = new ButterflySwarm({
    butterflyDensityAt: (x, y, z) => {
      const { biome, layer } = deps.getBiome(x, z, y)
      return layer === 1 ? BUTTERFLY_DENSITY[biome] ?? 0 : 0
    },
    hasDragonflies: (x, y, z) => {
      const { biome, layer } = deps.getBiome(x, z, y)
      return layer === 1 && !NO_DRAGONFLIES.has(biome)
    },
    isGround: (x, y, z) => {
      const properties = deps.getBlock(x, y, z).properties
      return getCellLiquidFamily(properties) !== undefined || (properties.isSolid && !properties.tags.includes(BlockTags.LEAVES))
    },
    isWater: (x, y, z) => {
      const properties = deps.getBlock(x, y, z).properties
      const family = getCellLiquidFamily(properties)
      if (family === undefined || !DRAGONFLY_WATERS.has(family)) return false
      // A pool's surface: a source (or a plant standing in one), not a trickle
      return properties.submergedIn !== undefined || properties.liquidLevel === 8
    },
    isPlant: (x, y, z) => isPlant(deps.getBlock(x, y, z).properties),
    isOpen: (x, y, z) => {
      const properties = deps.getBlock(x, y, z).properties
      return properties.id === 0 || isPlant(properties)
    },
    skyLight: (x, y, z) => deps.getPackedLight(x, y, z) >> 4,
  })
  deps.scene.add(swarm.object)

  let surfaceWeight = 1
  deps.scheduler.createTask({
    id: 'butterflies',
    priority: TaskPriority.CRITICAL,
    update: (dt) => {
      const feet = deps.playerBody.position
      const onSurface = feet.y >= LAYER_BOUNDARY_Y ? 1 : 0
      surfaceWeight += (onSurface - surfaceWeight) * Math.min(1, dt * 2)
      const pixelScale = deps.getViewportHeight() / (2 * Math.tan(THREE.MathUtils.degToRad(deps.camera.fov) / 2))
      swarm.update(dt, (1 - worldClock.nightAmount) * surfaceWeight, feet, pixelScale)
    },
  })
}
