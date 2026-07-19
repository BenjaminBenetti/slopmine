import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IBlock } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { RedwoodWindowBlockItem } from '../../../../items/blocks/redwood_window/RedwoodWindowBlockItem.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import redwoodWindowTexUrl from './assets/redwood-window.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.REDWOOD_WINDOW, redwoodWindowTexUrl, true)

const redwoodWindowTexture = loadBlockTexture(redwoodWindowTexUrl)

// Slightly smaller geometry to prevent z-fighting with adjacent blocks
const INSET = 0.002
const redwoodWindowGeometry = new THREE.BoxGeometry(1 - INSET * 2, 1 - INSET * 2, 1 - INSET * 2)

// Material for redwood window - transparent with texture
const redwoodWindowMaterial = new THREE.MeshLambertMaterial({
  map: redwoodWindowTexture,
  transparent: true,
  // Frame pixels are opaque, pane pixels are alpha holes - cutout, not blend
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/**
 * Redwood window block - a transparent solid block with a redwood-frame border
 * and glass center. Crafted from redwood planks and glass.
 */
export class RedwoodWindowBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.REDWOOD_WINDOW,
    name: 'redwood_window',
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
    return TextureId.REDWOOD_WINDOW
  }

  protected getGeometry(): THREE.BufferGeometry {
    return redwoodWindowGeometry
  }

  protected getMaterials(): THREE.Material {
    return redwoodWindowMaterial
  }

  /**
   * Render face when neighbor is not a redwood window.
   * Window-to-window faces are hidden (like glass).
   */
  shouldRenderFace(_face: BlockFace, neighbor: IBlock): boolean {
    // Don't render if neighbor is opaque
    if (neighbor.properties.isOpaque) {
      return false
    }
    // Don't render window-to-window faces
    if (neighbor.properties.id === BlockIds.REDWOOD_WINDOW) {
      return false
    }
    // Render face for all other cases (air, water, etc.)
    return true
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getDrops(): IItem[] {
    return [new RedwoodWindowBlockItem()]
  }
}
