import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { VineBlockItem } from '../../../../items/blocks/vine/VineBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import vineTexUrl from './assets/vine.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.VINE, vineTexUrl, true)

const vineTexture = loadBlockTexture(vineTexUrl)

const vineMaterial = new THREE.MeshLambertMaterial({
  map: vineTexture,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/**
 * Single vertical plane geometry for vines.
 * - Faces +Z (SOUTH) direction by default
 * - Positioned at Z=-0.49 (near -Z edge) so after rotation it ends up
 *   at the edge closest to the attachment block, with front facing outward
 * - Width ~0.9 to provide some visual margin
 * - Full height (1.0) for natural vine appearance
 * Rotation is applied via metadata/facing system.
 */
const vinePlaneGeometry = (() => {
  const geo = new THREE.PlaneGeometry(0.9, 1.0)
  // Offset toward -Z edge so after rotation the plane is at the
  // attachment side with its textured front facing the player
  geo.translate(0, 0, -0.49)
  return geo
})()

export class VineBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.VINE,
    name: 'vine',
    isOpaque: false,
    isSolid: false, // Players can walk through vines
    isLiquid: false,
    hardness: 0.2,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [BlockTags.LEAVES],
  }

  protected get defaultTextureId(): number {
    return TextureId.VINE
  }

  protected getMaterials(): THREE.Material {
    return vineMaterial
  }

  /**
   * Vines use flat plane geometry with rotation, not greedy meshing.
   */
  isGreedyMeshable(): boolean {
    return false
  }

  /**
   * Return flat plane geometry for instanced rendering.
   * Rotation is applied based on metadata facing value.
   */
  getInstanceGeometry(): THREE.BufferGeometry {
    return vinePlaneGeometry
  }

  getDrops(): IItem[] {
    return [new VineBlockItem()]
  }
}
