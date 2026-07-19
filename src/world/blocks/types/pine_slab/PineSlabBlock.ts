import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock, SharedGeometry } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { getMetadataFlipped } from '../../BlockFacing.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { PineSlabBlockItem } from '../../../../items/blocks/pine_slab/PineSlabBlockItem.ts'

// Reuse the pine planks texture (registered in the atlas by the planks block module)
import pinePlanksTexUrl from '../pine_planks/assets/pine-planks.webp'

const pinePlanksTexture = loadBlockTexture(pinePlanksTexUrl)
const pinePlanksMaterial = new THREE.MeshLambertMaterial({ map: pinePlanksTexture })

/**
 * Pine slab - half-height block occupying the bottom of its cell.
 */
export class PineSlabBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.PINE_SLAB,
    name: 'pine_slab',
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
    return TextureId.PINE_PLANKS
  }

  protected getGeometry(): THREE.BufferGeometry {
    return SharedGeometry.slabBottom
  }

  protected getMaterials(): THREE.Material {
    return pinePlanksMaterial
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
    return [new PineSlabBlockItem()]
  }
}
