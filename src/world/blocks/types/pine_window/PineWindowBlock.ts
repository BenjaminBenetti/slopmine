import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IBlock } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { PineWindowBlockItem } from '../../../../items/blocks/pine_window/PineWindowBlockItem.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import pineWindowTexUrl from './assets/pine-window.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.PINE_WINDOW, pineWindowTexUrl, true)

const pineWindowTexture = loadBlockTexture(pineWindowTexUrl)

// Slightly smaller geometry to prevent z-fighting with adjacent blocks
const INSET = 0.002
const pineWindowGeometry = new THREE.BoxGeometry(1 - INSET * 2, 1 - INSET * 2, 1 - INSET * 2)

// Material for pine window - transparent with texture
const pineWindowMaterial = new THREE.MeshLambertMaterial({
  map: pineWindowTexture,
  transparent: true,
  // Frame pixels are opaque, pane pixels are alpha holes - cutout, not blend
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/**
 * Pine window block - a transparent solid block with a pine-frame border
 * and glass center. Crafted from pine planks and glass.
 */
export class PineWindowBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.PINE_WINDOW,
    name: 'pine_window',
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
    return TextureId.PINE_WINDOW
  }

  protected getGeometry(): THREE.BufferGeometry {
    return pineWindowGeometry
  }

  protected getMaterials(): THREE.Material {
    return pineWindowMaterial
  }

  /**
   * Render face when neighbor is not a pine window.
   * Window-to-window faces are hidden (like glass).
   */
  shouldRenderFace(_face: BlockFace, neighbor: IBlock): boolean {
    // Don't render if neighbor is opaque
    if (neighbor.properties.isOpaque) {
      return false
    }
    // Don't render window-to-window faces
    if (neighbor.properties.id === BlockIds.PINE_WINDOW) {
      return false
    }
    // Render face for all other cases (air, water, etc.)
    return true
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getDrops(): IItem[] {
    return [new PineWindowBlockItem()]
  }
}
