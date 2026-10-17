import type * as THREE from 'three'
import { registerChestLootTable } from '../world/loot/ChestLootRegistry.ts'
import type { EntityManager } from '../entities/EntityManager.ts'
import { HellhoundEntity, HELLHOUND_MAX_NEARBY } from '../entities/enemies/hellhound/HellhoundEntity.ts'
import { InfernalKnightEntity } from '../entities/enemies/infernal_knight/InfernalKnightEntity.ts'
import { EmberCasterEntity } from '../entities/enemies/ember_caster/EmberCasterEntity.ts'
import { SkeletonEntity } from '../entities/enemies/skeleton/index.ts'
import { MagmaSlimeEntity } from '../entities/animals/magma_slime/index.ts'
import { registerGuardian } from '../dungeons/GuardianRegistry.ts'
import { registerGarrison, weightedGarrisonMembers, type GarrisonMemberEntry } from '../dungeons/GarrisonRegistry.ts'
import { registerProceduralDungeonLocator } from '../dungeons/ProceduralDungeonLocator.ts'
import { PyreTyrantEntity, PYRE_TYRANT_ID, PYRE_TYRANT_INDEX } from '../entities/guardians/pyre_tyrant/PyreTyrantEntity.ts'
import { INFERNAL_BASTION, BASTION_GARRISON } from '../world/generate/dungeons/kits/molten/BastionConfig.ts'
import { bastionTierLootTables } from './InfernalBastionLoot.ts'

/** Systems the Molten Wastes stream wires (from main.ts). */
export interface MoltenSetupDeps {
  readonly entityManager: EntityManager
}

/**
 * Wire the Molten Wastes: the Infernal Bastion's chest loot (four tiers),
 * dungeon locator, garrisons and guardian (the Pyre Tyrant), and the
 * hellhound pack spawner. Called once from main.ts (depth expansion wiring).
 */
export function setupMolten(deps: MoltenSetupDeps): void {
  for (const table of bastionTierLootTables) registerChestLootTable(table)

  // Pack leaders bring their followers through the entity manager, trimmed
  // so the pack never pushes the hellhound count past the spawn cap (the
  // leader is already counted: it calls this from its own update)
  HellhoundEntity.setPackSpawner((followers) => {
    const room = HELLHOUND_MAX_NEARBY - deps.entityManager.getEntitiesByType('hellhound').length
    for (let i = 0; i < followers.length && i < room; i++) deps.entityManager.addEntity(followers[i])
  })

  registerGuardian({
    id: PYRE_TYRANT_ID,
    index: PYRE_TYRANT_INDEX,
    displayName: 'The Pyre Tyrant',
    // The crucible door is 13 blocks from the altar: a few steps inside wake the tyrant
    activationRadius: 11,
    activationHeight: 8,
    create: (position: THREE.Vector3) => new PyreTyrantEntity(position),
  })

  registerProceduralDungeonLocator({
    dungeonId: 'infernal_bastion',
    displayName: 'Infernal Bastion',
    config: INFERNAL_BASTION,
  })

  registerBastionGarrisons()
}

// --- Infernal Bastion garrisons (spawner indices 10-17, see BastionConfig) ---

const knight: GarrisonMemberEntry = { weight: 1, create: (p) => new InfernalKnightEntity({ position: p }) }
const caster: GarrisonMemberEntry = { weight: 1, create: (p) => new EmberCasterEntity({ position: p }) }
const skeleton: GarrisonMemberEntry = { weight: 1, create: (p) => new SkeletonEntity({ position: p }) }
const hound: GarrisonMemberEntry = { weight: 1, create: (p) => new HellhoundEntity({ position: p, packLeader: false }) }
const slime: GarrisonMemberEntry = { weight: 1, create: (p) => new MagmaSlimeEntity({ position: p, variant: 'hell' }) }

const weighted = (entry: GarrisonMemberEntry, weight: number): GarrisonMemberEntry => ({ weight, create: entry.create })

/** Members by weight; `fixed` slots (slot 0 = the sergeant) always use their entry. */
const members = weightedGarrisonMembers

function registerBastionGarrisons(): void {
  const G = BASTION_GARRISON
  // Gatehouse: a knight holds the gate with skeleton archers behind him
  registerGarrison({
    id: 'bastion_gate_guard', index: G.GATE_GUARD, displayName: 'Gate Guard',
    maxAlive: 3, activationRadius: 12, activationHeight: 6,
    create: members([weighted(skeleton, 2), weighted(knight, 1)], { 0: knight }),
  })
  // Barracks: knights and skeletons turning out of their bunks
  registerGarrison({
    id: 'bastion_barracks', index: G.BARRACKS, displayName: 'Barracks',
    maxAlive: 3,
    create: members([weighted(knight, 1), weighted(skeleton, 2)], { 0: knight }),
  })
  // Watchtower roofs: ember casters raining fire on the bailey
  registerGarrison({
    id: 'bastion_caster_nest', index: G.CASTER_NEST, displayName: 'Caster Nest',
    maxAlive: 2, activationRadius: 14, activationHeight: 16, spawnRadius: 2,
    create: caster.create,
  })
  // Kennels: a pack of hellhounds (never pack leaders - no extra followers)
  registerGarrison({
    id: 'bastion_kennel', index: G.KENNEL, displayName: 'Kennels',
    maxAlive: 3,
    create: hound.create,
  })
  // War forge: the forgemaster knight and magma slimes crawling from the hearths
  registerGarrison({
    id: 'bastion_forge', index: G.FORGE, displayName: 'War Forge',
    maxAlive: 3, activationRadius: 12, activationHeight: 8,
    create: members([weighted(slime, 2), weighted(skeleton, 1)], { 0: knight }),
  })
  // Prison: escaped skeletons and the caster warden
  registerGarrison({
    id: 'bastion_prison', index: G.PRISON, displayName: 'Prison',
    maxAlive: 3,
    create: members([weighted(skeleton, 3), weighted(hound, 1)], { 0: caster }),
  })
  // Treasury and vault: an elite pair - knight and caster
  registerGarrison({
    id: 'bastion_vault_guard', index: G.VAULT_GUARD, displayName: 'Vault Guard',
    maxAlive: 2, activationRadius: 9, respawnSeconds: 900,
    create: members([knight, caster], { 0: knight, 1: caster }),
  })
  // Curtain wall and arcade walks: skeleton sentries with a caster
  registerGarrison({
    id: 'bastion_wall_patrol', index: G.WALL_PATROL, displayName: 'Wall Patrol',
    maxAlive: 2, activationRadius: 12, activationHeight: 10,
    create: members([weighted(skeleton, 3), weighted(caster, 1)]),
  })
}
