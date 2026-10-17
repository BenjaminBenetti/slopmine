import * as THREE from 'three'
import type { IEntity } from '../../entities/interfaces/IEntity.ts'
import { SporeDroneEntity } from '../../entities/enemies/spore_drone/index.ts'
import { RootboundWardenEntity } from '../../entities/enemies/rootbound_warden/index.ts'
import { SporeStalkerEntity } from '../../entities/enemies/spore_stalker/index.ts'
import { registerGarrison, weightedGarrisonMembers, type GarrisonDefinition } from '../../dungeons/GarrisonRegistry.ts'
import { HIVE_GARRISON } from '../../world/generate/dungeons/kits/embergrove/hiveConstants.ts'

/**
 * Sporeheart Hive garrisons (garrison spawner indices 30-32; the kit places
 * them with `ctx.garrison` in brood chambers, warden halls / the heart
 * antechamber and stalker dens). The spawner system hands `create` a
 * standable feet position near the spawner; drones take off from a little
 * above it.
 */

const drone = (position: THREE.Vector3): IEntity =>
  new SporeDroneEntity({ position: position.clone().add(new THREE.Vector3(0, 1.5, 0)) })
const warden = (position: THREE.Vector3): IEntity => new RootboundWardenEntity({ position: position.clone() })
const stalker = (position: THREE.Vector3): IEntity => new SporeStalkerEntity({ position: position.clone() })

export const HIVE_GARRISONS: readonly GarrisonDefinition[] = [
  {
    // Brood chambers: a swarm of spore drones lifts off the egg pods
    id: 'hive_brood',
    index: HIVE_GARRISON.BROOD,
    displayName: 'Spore Brood',
    maxAlive: 4,
    activationRadius: 10,
    activationHeight: 6,
    spawnRadius: 4,
    create: drone,
  },
  {
    // Warden halls and the heart antechamber: a Rootbound Warden with drone escorts
    id: 'hive_warden',
    index: HIVE_GARRISON.WARDEN,
    displayName: 'Rootbound Warden',
    maxAlive: 3,
    activationRadius: 11,
    activationHeight: 6,
    spawnRadius: 4,
    create: weightedGarrisonMembers([{ weight: 1, create: drone }], { 0: { weight: 1, create: warden } }),
  },
  {
    // Stalker dens: the grove's own predators, sometimes with a drone
    id: 'hive_stalkers',
    index: HIVE_GARRISON.STALKERS,
    displayName: 'Stalker Den',
    maxAlive: 3,
    activationRadius: 9,
    activationHeight: 5,
    spawnRadius: 3,
    create: weightedGarrisonMembers(
      [
        { weight: 2, create: stalker },
        { weight: 1, create: drone },
      ],
      { 0: { weight: 1, create: stalker } }
    ),
  },
]

export function registerHiveGarrisons(): void {
  for (const garrison of HIVE_GARRISONS) registerGarrison(garrison)
}
