import type * as THREE from 'three'
import type { EntitySpawnConfig } from '../../spawning/EntitySpawnConfig.ts'
import { FrostWraithEntity } from '../frost_wraith/FrostWraithEntity.ts'
import { IceRevenantEntity } from '../ice_revenant/IceRevenantEntity.ts'
import { SkeletonEntity } from '../skeleton/SkeletonEntity.ts'

/**
 * Natural spawns of Cocytus (the frozen lake of Hell). Player-relative
 * ground search (never searchFromSky underground); Y bounds keep them on the
 * lake (Y 46) and its shores and crags, below the cavern roof.
 */
export const cocytusEntitySpawns: EntitySpawnConfig[] = [
  {
    entityType: 'ice_revenant',
    spawnRate: 0.14,
    minY: 44,
    maxY: 100,
    maxNearby: 5,
    createEntity: (pos: THREE.Vector3) => new IceRevenantEntity({ position: pos }),
  },
  {
    entityType: 'frost_wraith',
    spawnRate: 0.1,
    minY: 44,
    maxY: 110,
    maxNearby: 4,
    createEntity: (pos: THREE.Vector3) => new FrostWraithEntity({ position: pos }),
  },
  {
    // A few of Hell's skeletons wander out onto the ice
    entityType: 'skeleton',
    spawnRate: 0.04,
    minY: 44,
    maxY: 100,
    maxNearby: 2,
    createEntity: (pos: THREE.Vector3) => new SkeletonEntity({ position: pos }),
  },
]
