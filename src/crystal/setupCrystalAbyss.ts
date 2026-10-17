import type * as THREE from 'three'
import { registerChestLootTable } from '../world/loot/ChestLootRegistry.ts'
import type { IEntity } from '../entities/interfaces/IEntity.ts'
import { setCrystalEntitySpawner } from '../entities/enemies/crystal_shared/CrystalEntityHooks.ts'
import { registerGuardian } from '../dungeons/GuardianRegistry.ts'
import { registerGarrison, weightedGarrisonMembers } from '../dungeons/GarrisonRegistry.ts'
import { registerProceduralDungeonLocator } from '../dungeons/ProceduralDungeonLocator.ts'
import { PrismWardenEntity, PRISM_WARDEN_ID, PRISM_WARDEN_NAME } from '../entities/guardians/prism_warden/index.ts'
import { CrystalSentinelEntity } from '../entities/enemies/crystal_sentinel/index.ts'
import { PrismAcolyteEntity } from '../entities/enemies/prism_acolyte/index.ts'
import { ShardlingEntity } from '../entities/enemies/shardling/index.ts'
import {
  GARRISON_ACOLYTE_COVEN, GARRISON_SENTINEL_COURT, GARRISON_SENTINEL_GUARD, GARRISON_SHARD_SWARM,
  PRISM_SANCTUM_CONFIG, PRISM_SANCTUM_DUNGEON_ID, PRISM_WARDEN_GUARDIAN_INDEX,
} from '../world/generate/dungeons/kits/crystal/PrismSanctumConfig.ts'
import { PRISM_SANCTUM_LOOT_TABLES } from './PrismSanctumLoot.ts'

export interface CrystalAbyssDeps {
  readonly entityManager: { addEntity(entity: IEntity): boolean }
}

const acolyte = { weight: 1, create: (position: THREE.Vector3): IEntity => new PrismAcolyteEntity({ position }) }
const sentinel = { weight: 1, create: (position: THREE.Vector3): IEntity => new CrystalSentinelEntity({ position }) }
const shardling = { weight: 1, create: (position: THREE.Vector3): IEntity => new ShardlingEntity({ position }) }

/**
 * Main-thread wiring of the Crystal Abyss (called from main.ts, crystal
 * section of the depth expansion wiring): the Prism Sanctum loot tiers,
 * garrisons (40-43), guardian (Prism Warden, index 4) and procedural
 * dungeon locator, and the entity spawner used by shattering shardlings.
 */
export function setupCrystalAbyss(deps: CrystalAbyssDeps): void {
  for (const table of PRISM_SANCTUM_LOOT_TABLES) registerChestLootTable(table)
  setCrystalEntitySpawner((entity) => {
    deps.entityManager.addEntity(entity)
  })
  registerGuardian({
    id: PRISM_WARDEN_ID,
    index: PRISM_WARDEN_GUARDIAN_INDEX,
    displayName: PRISM_WARDEN_NAME,
    create: (position: THREE.Vector3) => new PrismWardenEntity(position),
  })

  // Garrisons (indices 40-49 are the crystal stream's)
  registerGarrison({
    id: 'sanctum_acolyte_coven',
    index: GARRISON_ACOLYTE_COVEN,
    displayName: 'Acolyte Coven',
    maxAlive: 3,
    activationRadius: 11,
    spawnRadius: 3,
    create: acolyte.create,
  })
  registerGarrison({
    id: 'sanctum_sentinel_guard',
    index: GARRISON_SENTINEL_GUARD,
    displayName: 'Sentinel Guard',
    maxAlive: 2,
    activationRadius: 10,
    spawnRadius: 2,
    create: sentinel.create,
  })
  registerGarrison({
    id: 'sanctum_sentinel_court',
    index: GARRISON_SENTINEL_COURT,
    displayName: 'Sentinel Court',
    maxAlive: 3,
    activationRadius: 12,
    spawnRadius: 4,
    // Two sentinels and an acolyte calling down light from behind them
    create: weightedGarrisonMembers([sentinel], { 2: acolyte }),
  })
  registerGarrison({
    id: 'sanctum_shard_swarm',
    index: GARRISON_SHARD_SWARM,
    displayName: 'Shard Swarm',
    maxAlive: 4,
    activationRadius: 10,
    spawnRadius: 4,
    // A sentinel herding shardlings, now and then an acolyte
    create: weightedGarrisonMembers([shardling, { ...acolyte, weight: 0.25 }], { 0: sentinel }),
  })

  registerProceduralDungeonLocator({
    dungeonId: PRISM_SANCTUM_DUNGEON_ID,
    displayName: 'Prism Sanctum',
    config: PRISM_SANCTUM_CONFIG,
  })
}
