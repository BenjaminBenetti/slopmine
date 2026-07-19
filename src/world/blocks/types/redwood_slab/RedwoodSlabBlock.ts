import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock, SharedGeometry } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { getMetadataFlipped } from '../../BlockFacing.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { RedwoodSlabBlockItem } from '../../../../items/blocks/redwood_slab/RedwoodSlabBlockItem.ts'

// Reuse the redwood planks texture (registered in the atlas by the planks block module)
import redwoodPlanksTexUrl from '../redwood_planks/assets/redwood-planks.webp'

const redwoodPlanksTexture = loadBlockTexture(redwoodPlanksTexUrl)
const redwoodPlanksMaterial = new THREE.MeshLambertMaterial({ map: redwoodPlanksTexture })

/**
 * Redwood slab - half-height block occupying the bottom of its cell.
 */
export class RedwoodSlabBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.REDWOOD_SLAB,
    name: 'redwood_slab',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 1.5,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.REDWOOD_PLANKS
  }

  protected getGeometry(): THREE.BufferGeometry {
    return SharedGeometry.slabBottom
  }

  protected getMaterials(): THREE.Material {
    return redwoodPlanksMaterial
  }

  getInstanceGeometry(): THREE.BufferGeometry {
    return SharedGeometry.slabBottom
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getCollisionBox(): THREE.Box3 | null {
    return new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0.5, 1)
    )
  }

  getInteractionBox(metadata: number): THREE.Box3 | null {
    // Flipped placement (metadata bit 4) = top slab
    if (getMetadataFlipped(metadata)) {
      return new THREE.Box3(
        new THREE.Vector3(0, 0.5, 0),
        new THREE.Vector3(1, 1, 1)
      )
    }
    return new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0.5, 1)
    )
  }


  /**
   * Placement can flip this block upside down (metadata bit 4).
   */
  supportsVerticalFlip(): boolean {
    return true
  }
  getDrops(): IItem[] {
    return [new RedwoodSlabBlockItem()]
  }
}
