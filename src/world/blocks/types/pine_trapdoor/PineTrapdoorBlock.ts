import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { PineTrapdoorBlockItem } from '../../../../items/blocks/pine_trapdoor/PineTrapdoorBlockItem.ts'

// Import texture (shared with the open variant)
import pineTrapdoorTexUrl from './assets/pine-trapdoor.webp'

// Register texture for atlas
registerTextureUrl(TextureId.PINE_TRAPDOOR, pineTrapdoorTexUrl)

// Load texture and create material
const pineTrapdoorTexture = loadBlockTexture(pineTrapdoorTexUrl)
const pineTrapdoorMaterial = new THREE.MeshLambertMaterial({ map: pineTrapdoorTexture })

// Panel thickness shared by closed (horizontal) and open (vertical) variants
const PANEL_THICKNESS = 0.12

// Closed trapdoor: thin horizontal panel at the bottom of the cell.
// Geometry is centered around Y=0 (renderer adds +0.5), so the panel
// occupies local y ∈ [-0.5, -0.38] — flush with the cell floor.
const pineTrapdoorClosedGeometry = new THREE.BoxGeometry(1, PANEL_THICKNESS, 1)
  .translate(0, -0.5 + PANEL_THICKNESS / 2, 0)

/**
 * Pine trapdoor (closed state) - thin solid panel lying on the cell floor.
 * E-key toggles to PINE_TRAPDOOR_OPEN via the trapdoor toggle helper
 * (registered centrally in main.ts).
 */
export class PineTrapdoorBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.PINE_TRAPDOOR,
    name: 'pine_trapdoor',
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
    return TextureId.PINE_TRAPDOOR
  }

  protected getGeometry(): THREE.BufferGeometry {
    return pineTrapdoorClosedGeometry
  }

  protected getMaterials(): THREE.Material {
    return pineTrapdoorMaterial
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getCollisionBox(): THREE.Box3 | null {
    return new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, PANEL_THICKNESS, 1)
    )
  }


  /**
   * Placement can flip this block upside down (metadata bit 4).
   */
  supportsVerticalFlip(): boolean {
    return true
  }
  getDrops(): IItem[] {
    return [new PineTrapdoorBlockItem()]
  }
}
