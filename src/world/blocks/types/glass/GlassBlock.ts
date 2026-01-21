import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IBlock } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { GlassBlockItem } from '../../../../items/blocks/glass/GlassBlockItem.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import glassTexUrl from './assets/glass.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.GLASS, glassTexUrl, true)

const glassTexture = loadBlockTexture(glassTexUrl)

// Slightly smaller geometry to prevent z-fighting with adjacent blocks
const INSET = 0.002
const glassGeometry = new THREE.BoxGeometry(1 - INSET * 2, 1 - INSET * 2, 1 - INSET * 2)

// Material for glass - transparent with texture
const glassMaterial = new THREE.MeshLambertMaterial({
  map: glassTexture,
  transparent: true,
  opacity: 0.6,
  side: THREE.DoubleSide,
})

/**
 * Glass block - a transparent solid block.
 * Smelted from sand in a forge.
 */
export class GlassBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.GLASS,
    name: 'glass',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 0.3,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.GLASS
  }

  protected getGeometry(): THREE.BufferGeometry {
    return glassGeometry
  }

  protected getMaterials(): THREE.Material {
    return glassMaterial
  }

  /**
   * Render face when neighbor is not glass.
   * Glass-to-glass faces are hidden (like water).
   */
  shouldRenderFace(_face: BlockFace, neighbor: IBlock): boolean {
    // Don't render if neighbor is opaque
    if (neighbor.properties.isOpaque) {
      return false
    }
    // Don't render glass-to-glass faces
    if (neighbor.properties.id === BlockIds.GLASS) {
      return false
    }
    // Render face for all other cases (air, water, etc.)
    return true
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getDrops(): IItem[] {
    return [new GlassBlockItem()]
  }
}
