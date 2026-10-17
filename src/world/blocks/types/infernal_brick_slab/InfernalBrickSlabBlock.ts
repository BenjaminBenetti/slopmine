import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock, SharedGeometry } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { getMetadataFlipped } from '../../BlockFacing.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { InfernalBrickSlabBlockItem } from '../../../../items/blocks/infernal_brick_slab/InfernalBrickSlabBlockItem.ts'
// Reuse the infernal bricks texture (no texture-array layer: custom geometry)
import infernalBricksTexUrl from '../infernal_bricks/assets/infernal-bricks.webp'

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(infernalBricksTexUrl) })

/**
 * Infernal brick slab: half-height bastion masonry (steps, battlement caps,
 * bunk frames, upside-down for lintels). Structural dungeon block (force 6).
 */
export class InfernalBrickSlabBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.INFERNAL_BRICK_SLAB,
    name: 'infernal_brick_slab',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 60.0,
    lightLevel: 0,
    lightBlocking: 0,
    blocksVerticalLight: true,
    demolitionForceRequired: 6,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.INFERNAL_BRICKS
  }

  protected getGeometry(): THREE.BufferGeometry {
    return SharedGeometry.slabBottom
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getInstanceGeometry(): THREE.BufferGeometry {
    return SharedGeometry.slabBottom
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getCollisionBox(): THREE.Box3 | null {
    return new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0.5, 1))
  }

  getInteractionBox(metadata: number): THREE.Box3 | null {
    // Flipped placement (metadata bit 4) = top slab
    if (getMetadataFlipped(metadata)) {
      return new THREE.Box3(new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(1, 1, 1))
    }
    return new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0.5, 1))
  }

  supportsVerticalFlip(): boolean {
    return true
  }

  getDrops(): IItem[] {
    return [new InfernalBrickSlabBlockItem()]
  }
}
