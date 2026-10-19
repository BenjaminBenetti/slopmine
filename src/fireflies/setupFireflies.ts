import * as THREE from 'three'
import type { TaskScheduler } from '../core/TaskScheduler.ts'
import { TaskPriority } from '../core/interfaces/ITask.ts'
import type { IBlock } from '../world/interfaces/IBlock.ts'
import { BlockTags } from '../world/blocks/tags/BlockTags.ts'
import { getCellLiquidFamily } from '../world/liquid/cellLiquid.ts'
import { LAYER_BOUNDARY_Y } from '../world/generate/GenerationConfig.ts'
import { worldClock } from '../daynight/WorldClock.ts'
import { FireflySwarm } from './FireflySwarm.ts'

/**
 * How thick the fireflies are in each surface biome (1 = all of them): they
 * belong to the swamp and its glowing mushrooms, and live nowhere else.
 */
const FIREFLY_DENSITY: Readonly<Record<string, number>> = {
  'swamp': 1.0,
}

export interface FireflySetupDeps {
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

/**
 * Fireflies over the swamp at night: they come out at dusk and fade at dawn.
 * The CRITICAL 'fireflies' task advances the swarm (cheap: a few anchor picks
 * per frame, everything else in the shader).
 */
export function setupFireflies(deps: FireflySetupDeps): void {
  const swarm = new FireflySwarm({
    densityAt: (x, y, z) => {
      const { biome, layer } = deps.getBiome(x, z, y)
      return layer === 1 ? FIREFLY_DENSITY[biome] ?? 0 : 0
    },
    isGround: (x, y, z) => {
      const properties = deps.getBlock(x, y, z).properties
      return getCellLiquidFamily(properties) !== undefined || (properties.isSolid && !properties.tags.includes(BlockTags.LEAVES))
    },
    isAir: (x, y, z) => deps.getBlock(x, y, z).properties.id === 0,
    skyLight: (x, y, z) => deps.getPackedLight(x, y, z) >> 4,
  })
  deps.scene.add(swarm.object)

  let surfaceWeight = 1
  deps.scheduler.createTask({
    id: 'fireflies',
    priority: TaskPriority.CRITICAL,
    update: (dt) => {
      const feet = deps.playerBody.position
      const onSurface = feet.y >= LAYER_BOUNDARY_Y ? 1 : 0
      surfaceWeight += (onSurface - surfaceWeight) * Math.min(1, dt * 2)
      const pixelScale = deps.getViewportHeight() / (2 * Math.tan(THREE.MathUtils.degToRad(deps.camera.fov) / 2))
      swarm.update(dt, worldClock.nightAmount * surfaceWeight, feet, pixelScale)
    },
  })
}
