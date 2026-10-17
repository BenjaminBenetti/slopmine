import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { PrismShardItem } from '../../../../items/materials/prism_shard/PrismShardItem.ts'
import {
  CLUSTER_HEIGHT, CLUSTER_WIDTH, createClusterGeometry, prismClusterMaterial,
} from '../prism_cluster/prismClusterShared.ts'

const geometry = createClusterGeometry(true)

/**
 * Hanging prism cluster - the prism cluster sprite growing down from a
 * ceiling (geode roofs, floating island undersides). Same rules and drop as
 * the floor cluster.
 */
export class HangingPrismClusterBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.HANGING_PRISM_CLUSTER,
    name: 'hanging_prism_cluster',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0.6,
    lightLevel: 6,
    lightBlocking: 0,
    demolitionForceRequired: 5,
    tags: [BlockTags.ROCK], // pickaxe (force 5 needs a matching tool)
  }

  protected get defaultTextureId(): number {
    return TextureId.PRISM_CLUSTER
  }

  protected getGeometry(): THREE.BufferGeometry {
    return geometry
  }

  protected getMaterials(): THREE.Material {
    return prismClusterMaterial
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    const m = (1 - CLUSTER_WIDTH * 0.7) / 2
    return new THREE.Box3(new THREE.Vector3(m, 1 - CLUSTER_HEIGHT, m), new THREE.Vector3(1 - m, 1, 1 - m))
  }

  getDrops(): IItem[] {
    return [new PrismShardItem()]
  }
}
