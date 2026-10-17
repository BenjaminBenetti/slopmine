import type * as THREE from 'three'
import { registerChestLootTable } from '../world/loot/ChestLootRegistry.ts'
import { catacombsLootTables } from './CatacombsLoot.ts'
import { registerGuardian } from '../dungeons/GuardianRegistry.ts'
import { registerGarrison, weightedGarrisonMembers } from '../dungeons/GarrisonRegistry.ts'
import { registerProceduralDungeonLocator } from '../dungeons/ProceduralDungeonLocator.ts'
import {
  BONE_KING_INDEX,
  CATACOMBS,
  CATACOMBS_KIT_ID,
  GARRISON_GHOUL_DEN,
  GARRISON_GUARD_CRYPT,
  GARRISON_NICHE_AMBUSH,
  GARRISON_PRIEST_SANCTUM,
  GARRISON_WRAITH_HAUNT,
} from '../world/generate/dungeons/kits/ossuary/CatacombsConfig.ts'
import { BoneKingEntity, BONE_KING_ID, BONE_KING_NAME } from '../entities/guardians/bone_king/index.ts'
import { CryptGhoulEntity } from '../entities/enemies/crypt_ghoul/index.ts'
import { HollowPriestEntity } from '../entities/enemies/hollow_priest/index.ts'
import { SkeletonEntity } from '../entities/enemies/skeleton/index.ts'
import { WraithEntity } from '../entities/enemies/wraith/index.ts'
import { BoneHoundEntity } from '../entities/enemies/bone_hound/index.ts'

const ghoul = (position: THREE.Vector3) => new CryptGhoulEntity({ position })
const skeleton = (position: THREE.Vector3) => new SkeletonEntity({ position })

/**
 * Main-thread wiring for The Ossuary (called from main.ts's depth wiring
 * block): the Catacombs' four chest loot tiers, its garrisons (indices
 * 20-24), the Bone King guardian (spawner index 2, in the throne crypt) and
 * the Catacombs dungeon locator (sigil compass).
 */
export function setupOssuary(): void {
  for (const table of catacombsLootTables) registerChestLootTable(table)

  // Ghoul den: crypt ghouls lurking among the niches - they wait until the
  // player is close, shriek, and leap
  registerGarrison({
    id: 'catacombs_ghoul_den',
    index: GARRISON_GHOUL_DEN,
    displayName: 'Ghoul Den',
    maxAlive: 3,
    activationRadius: 9,
    activationHeight: 4,
    spawnRadius: 4,
    create: ghoul,
  })

  // Niche ambush: two ghouls burst from a niche corridor as the player passes
  registerGarrison({
    id: 'catacombs_niche_ambush',
    index: GARRISON_NICHE_AMBUSH,
    displayName: 'Niche Ambush',
    maxAlive: 2,
    activationRadius: 6,
    activationHeight: 4,
    spawnRadius: 2,
    create: (position) => new CryptGhoulEntity({ position, lurking: false }),
  })

  // Priest sanctum: a hollow priest at its candle ring, with skeleton acolytes
  registerGarrison({
    id: 'catacombs_priest_sanctum',
    index: GARRISON_PRIEST_SANCTUM,
    displayName: 'Priest Sanctum',
    maxAlive: 3,
    activationRadius: 10,
    activationHeight: 4,
    spawnRadius: 3,
    create: weightedGarrisonMembers(
      [
        { weight: 3, create: skeleton },
        { weight: 1, create: ghoul },
      ],
      { 0: { weight: 1, create: (position) => new HollowPriestEntity({ position }) } }
    ),
  })

  // Guard crypt: the dead stand watch - skeletons with a bone hound
  registerGarrison({
    id: 'catacombs_guard_crypt',
    index: GARRISON_GUARD_CRYPT,
    displayName: 'Guard Crypt',
    maxAlive: 3,
    activationRadius: 8,
    activationHeight: 4,
    spawnRadius: 3,
    create: weightedGarrisonMembers([
      { weight: 3, create: skeleton },
      { weight: 1, create: (position) => new BoneHoundEntity({ position }) },
    ]),
  })

  // Wraith haunt: an ossuary hall where wraiths drift between the pillars
  registerGarrison({
    id: 'catacombs_wraith_haunt',
    index: GARRISON_WRAITH_HAUNT,
    displayName: 'Wraith Haunt',
    maxAlive: 2,
    activationRadius: 10,
    activationHeight: 5,
    spawnRadius: 4,
    create: (position) => new WraithEntity({ position }),
  })

  // The spawner sits on the throne dais, 18 blocks in from the throne
  // crypt's door: the King rises once the player is ~5 blocks into the hall
  registerGuardian({
    id: BONE_KING_ID,
    index: BONE_KING_INDEX,
    displayName: BONE_KING_NAME,
    activationRadius: 13,
    activationHeight: 5,
    create: (position) => new BoneKingEntity(position),
  })

  registerProceduralDungeonLocator({
    dungeonId: CATACOMBS_KIT_ID,
    displayName: 'The Catacombs',
    config: CATACOMBS,
  })
}
