import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IBlock } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { OakWindowBlockItem } from '../../../../items/blocks/oak_window/OakWindowBlockItem.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import oakWindowTexUrl from './assets/oak-window.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.OAK_WINDOW, oakWindowTexUrl, true)

const oakWindowTexture = loadBlockTexture(oakWindowTexUrl)

// Slightly smaller geometry to prevent z-fighting with adjacent blocks
const INSET = 0.002
const oakWindowGeometry = new THREE.BoxGeometry(1 - INSET * 2, 1 - INSET * 2, 1 - INSET * 2)

// Material for oak window - transparent with texture
const oakWindowMaterial = new THREE.MeshLambertMaterial({
  map: oakWindowTexture,
  transparent: true,
  // Frame pixels are opaque, pane pixels are alpha holes - cutout, not blend
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/**
 * Oak window block - a transparent solid block with an oak-frame border
 * and glass center. Crafted from oak planks and glass.
 */
export class OakWindowBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.OAK_WINDOW,
    name: 'oak_window',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 0.5,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.OAK_WINDOW
  }

  protected getGeometry(): THREE.BufferGeometry {
    return oakWindowGeometry
  }

  protected getMaterials(): THREE.Material {
    return oakWindowMaterial
  }

  /**
   * Render face when neighbor is not an oak window.
   * Window-to-window faces are hidden (like glass).
   */
  shouldRenderFace(_face: BlockFace, neighbor: IBlock): boolean {
    // Don't render if neighbor is opaque
    if (neighbor.properties.isOpaque) {
      return false
    }
    // Don't render window-to-window faces
    if (neighbor.properties.id === BlockIds.OAK_WINDOW) {
      return false
    }
    // Render face for all other cases (air, water, etc.)
    return true
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getDrops(): IItem[] {
    return [new OakWindowBlockItem()]
  }
}
