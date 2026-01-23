import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { LadderBlockItem } from '../../../../items/blocks/ladder/LadderBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import ladderTexUrl from './assets/ladder.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.LADDER, ladderTexUrl, true)

const ladderTexture = loadBlockTexture(ladderTexUrl)

const ladderMaterial = new THREE.MeshLambertMaterial({
  map: ladderTexture,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/**
 * Single vertical plane geometry for ladders.
 * - Faces +Z (SOUTH) direction by default
 * - Positioned at Z=-0.49 (near -Z edge) so after rotation it ends up
 *   at the edge closest to the attachment block, with front facing outward
 * - Width ~0.9 to provide some visual margin
 * - Full height (1.0) for natural ladder appearance
 * Rotation is applied via metadata/facing system.
 */
const ladderPlaneGeometry = (() => {
  const geo = new THREE.PlaneGeometry(0.9, 1.0)
  // Offset toward -Z edge so after rotation the plane is at the
  // attachment side with its textured front facing the player
  geo.translate(0, 0, -0.49)
  return geo
})()

export class LadderBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.LADDER,
    name: 'ladder',
    isOpaque: false,
    isSolid: false, // Players can walk through ladders
    isLiquid: false,
    hardness: 0.4,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD, BlockTags.CLIMBABLE],
  }

  protected get defaultTextureId(): number {
    return TextureId.LADDER
  }

  protected getMaterials(): THREE.Material {
    return ladderMaterial
  }

  /**
   * Ladders use flat plane geometry with rotation, not greedy meshing.
   */
  isGreedyMeshable(): boolean {
    return false
  }

  /**
   * Return flat plane geometry for instanced rendering.
   * Rotation is applied based on metadata facing value.
   */
  getInstanceGeometry(): THREE.BufferGeometry {
    return ladderPlaneGeometry
  }

  getDrops(): IItem[] {
    return [new LadderBlockItem()]
  }
}
