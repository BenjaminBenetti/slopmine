import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock, SharedGeometry } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { getMetadataFlipped } from '../../BlockFacing.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { GlacialBrickSlabBlockItem } from '../../../../items/blocks/glacial_brick_slab/GlacialBrickSlabBlockItem.ts'

// Reuse the glacial brick texture (registered by the glacial brick block module)
import glacialBrickTexUrl from '../glacial_brick/assets/glacial-brick.webp'

const glacialBrickTexture = loadBlockTexture(glacialBrickTexUrl)
const slabMaterial = new THREE.MeshLambertMaterial({ map: glacialBrickTexture })

/**
 * Glacial brick slab - half-height glacial brick (bottom of its cell, or the
 * top when flipped): ledges, steps and galleries of the Frozen Citadel.
 * Dungeon structural (force 6).
 */
export class GlacialBrickSlabBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.GLACIAL_BRICK_SLAB,
    name: 'glacial_brick_slab',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 60,
    lightLevel: 0,
    lightBlocking: 0,
    blocksVerticalLight: true,
    demolitionForceRequired: 6,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.GLACIAL_BRICK
  }

  protected getGeometry(): THREE.BufferGeometry {
    return SharedGeometry.slabBottom
  }

  protected getMaterials(): THREE.Material {
    return slabMaterial
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
    return [new GlacialBrickSlabBlockItem()]
  }
}
