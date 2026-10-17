import type * as THREE from 'three'
import type { TaskScheduler } from '../core/TaskScheduler.ts'
import { TaskPriority } from '../core/interfaces/ITask.ts'
import { FUEL_VALUES } from '../smelting/SmeltingConfig.ts'
import { biomeRegistry } from '../world/generate/biomes/BiomeRegistry.ts'
import { LAYER_BOUNDARY_Y } from '../world/generate/GenerationConfig.ts'
import { registerSporeheartLoot } from './SporeheartLoot.ts'
import { SporeDriftEffect } from './SporeDriftEffect.ts'
import { registerGuardian } from '../dungeons/GuardianRegistry.ts'
import { registerProceduralDungeonLocator } from '../dungeons/ProceduralDungeonLocator.ts'
import { SporemotherEntity, SPOREMOTHER_ID, SPOREMOTHER_INDEX } from './sporemother/SporemotherEntity.ts'
import { registerHiveGarrisons } from './hive/HiveGarrisons.ts'
import { installRootboundEffect } from '../entities/enemies/rootbound_warden/RootboundEffect.ts'
import { SPOREHEART_HIVE, SPOREHEART_HIVE_DUNGEON_ID } from '../world/generate/dungeons/kits/embergrove/hiveConstants.ts'

export interface EmberGroveSetupContext {
  readonly scene: THREE.Scene
  readonly scheduler: TaskScheduler
  readonly camera: THREE.Camera
  /** Player movement (the Rootbound Warden's snare slows it). */
  readonly cameraControls: { addSpeedModifier(modifier: () => number): () => void }
  readonly getSeed: () => number
}

/**
 * Main-thread wiring for the Ember Grove (called from main.ts's depth
 * expansion block): the Sporeheart Hive's chest loot tiers, garrisons,
 * guardian (the Sporemother) and compass locator, emberwood as forge fuel,
 * and the drifting-spore ambience.
 */
export function setupEmberGrove(ctx: EmberGroveSetupContext): void {
  registerSporeheartLoot()
  registerHiveGarrisons()
  installRootboundEffect(ctx.cameraControls)

  // She wakes when the player steps into the heart chamber (radius 8)
  registerGuardian({
    id: SPOREMOTHER_ID,
    index: SPOREMOTHER_INDEX,
    displayName: 'The Sporemother',
    activationRadius: 8,
    activationHeight: 6,
    create: (position) => new SporemotherEntity(position),
  })
  registerProceduralDungeonLocator({
    dungeonId: SPOREHEART_HIVE_DUNGEON_ID,
    displayName: 'Sporeheart Hive',
    config: SPOREHEART_HIVE,
  })

  // Emberwood burns like any other wood
  FUEL_VALUES['emberwood_stem_block'] = 1.5
  FUEL_VALUES['emberwood_planks_block'] = 0.75

  const spores = new SporeDriftEffect(ctx.scene)
  let inGrove = false
  let biomeTimer = 0
  ctx.scheduler.createTask({
    id: 'embergrove-spores',
    priority: TaskPriority.NORMAL,
    update: (dt) => {
      const p = ctx.camera.position
      biomeTimer -= dt
      if (biomeTimer <= 0) {
        biomeTimer = 0.5
        inGrove = false
        if (p.y < LAYER_BOUNDARY_Y) {
          const rx = Math.floor(p.x / 512)
          const rz = Math.floor(p.z / 512)
          inGrove = biomeRegistry.selectBiomeForLayer(rx, rz, ctx.getSeed(), 0) === 'ember-grove'
        }
      }
      spores.update(dt, p, inGrove)
    },
  })
}
