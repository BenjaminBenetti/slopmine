import * as THREE from 'three'
import { registerChestLootTable } from '../world/loot/ChestLootRegistry.ts'
import {
  registerGuardian,
  registerGarrison,
  registerProceduralDungeonLocator,
  weightedGarrisonMembers,
} from '../dungeons/index.ts'
import { RimeSovereignEntity } from '../entities/guardians/rime_sovereign/RimeSovereignEntity.ts'
import { FrozenKnightEntity } from '../entities/enemies/frozen_knight/FrozenKnightEntity.ts'
import { RimeArcherEntity } from '../entities/enemies/rime_archer/RimeArcherEntity.ts'
import { FrostWraithEntity } from '../entities/enemies/frost_wraith/FrostWraithEntity.ts'
import { IceRevenantEntity } from '../entities/enemies/ice_revenant/IceRevenantEntity.ts'
import {
  CITADEL_GARRISON,
  FROZEN_CITADEL,
  RIME_SOVEREIGN_GUARDIAN_INDEX,
} from '../world/generate/dungeons/kits/cocytus/frozenCitadelConfig.ts'
import { frozenCitadelLootTables } from './FrozenCitadelLoot.ts'

const knight = { weight: 1, create: (position: THREE.Vector3) => new FrozenKnightEntity({ position }) }
const archer = { weight: 1, create: (position: THREE.Vector3) => new RimeArcherEntity({ position }) }

/**
 * Main-thread wiring of the Cocytus biome (called once from main.ts): the
 * Frozen Citadel's tiered chest loot, its garrisons (indices 50-55), its
 * guardian (the Rime Sovereign, spawner index 5) and its compass locator.
 * The castle itself is the worker kit `kits/cocytus/FrozenCitadelKit.ts`.
 */
export function setupCocytus(): void {
  for (const table of frozenCitadelLootTables) registerChestLootTable(table)

  registerGarrison({
    id: 'citadel_guard',
    index: CITADEL_GARRISON.guard,
    displayName: 'Citadel Guard',
    maxAlive: 2,
    create: knight.create,
  })
  registerGarrison({
    id: 'citadel_archers',
    index: CITADEL_GARRISON.archers,
    displayName: 'Rime Archers',
    maxAlive: 2,
    activationRadius: 12,
    create: archer.create,
  })
  registerGarrison({
    id: 'citadel_patrol',
    index: CITADEL_GARRISON.patrol,
    displayName: 'Citadel Patrol',
    maxAlive: 2,
    create: weightedGarrisonMembers([knight, archer], { 0: knight, 1: archer }),
  })
  registerGarrison({
    id: 'citadel_warden',
    index: CITADEL_GARRISON.warden,
    displayName: 'The Warden',
    maxAlive: 3,
    create: weightedGarrisonMembers([knight, archer], { 0: knight, 1: knight, 2: archer }),
  })
  registerGarrison({
    id: 'citadel_wraiths',
    index: CITADEL_GARRISON.wraiths,
    displayName: 'Frost Wraiths',
    maxAlive: 2,
    activationHeight: 7,
    create: (position) => new FrostWraithEntity({ position }),
  })
  registerGarrison({
    id: 'citadel_revenants',
    index: CITADEL_GARRISON.revenants,
    displayName: 'The Damned',
    maxAlive: 2,
    create: (position) => new IceRevenantEntity({ position }),
  })

  registerGuardian({
    id: 'rime_sovereign',
    index: RIME_SOVEREIGN_GUARDIAN_INDEX,
    displayName: 'The Rime Sovereign',
    // The altar stands mid-hall, 7 blocks below the doorway gallery: he wakes as the
    // player comes down the grand stair (not while they look down from the gallery)
    activationRadius: 10,
    activationHeight: 6,
    // Arena: the 25×25 sunken throne hall around the altar
    create: (position: THREE.Vector3) => new RimeSovereignEntity(position, { home: position.clone(), radius: 12 }),
  })

  registerProceduralDungeonLocator({ dungeonId: 'frozen_citadel', displayName: 'Frozen Citadel', config: FROZEN_CITADEL })
}
