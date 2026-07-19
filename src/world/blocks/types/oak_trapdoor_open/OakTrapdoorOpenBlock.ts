import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { OakTrapdoorBlockItem } from '../../../../items/blocks/oak_trapdoor/OakTrapdoorBlockItem.ts'

// Shared texture with the closed variant (registered for the atlas there)
import oakTrapdoorTexUrl from '../oak_trapdoor/assets/oak-trapdoor.webp'

// Load texture and create this module's material
const oakTrapdoorTexture = loadBlockTexture(oakTrapdoorTexUrl)
const oakTrapdoorOpenMaterial = new THREE.MeshLambertMaterial({ map: oakTrapdoorTexture })

// Panel thickness shared with the closed variant
const PANEL_THICKNESS = 0.12

// Open trapdoor: thin vertical panel swung up against the -Z edge of the
// cell. Geometry is centered around Y=0 (renderer adds +0.5), so the panel
// spans full X/Y with local z ∈ [-0.5, -0.38].
const oakTrapdoorOpenGeometry = new THREE.BoxGeometry(1, 1, PANEL_THICKNESS)
  .translate(0, 0, -0.5 + PANEL_THICKNESS / 2)

/**
 * Oak trapdoor (open state) - non-solid vertical panel against the -Z edge.
 * E-key toggles back to OAK_TRAPDOOR via the trapdoor toggle helper
 * (registered centrally in main.ts). Drops the same item as the closed state.
 */
export class OakTrapdoorOpenBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.OAK_TRAPDOOR_OPEN,
    name: 'oak_trapdoor_open',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 1.5,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.OAK_TRAPDOOR
  }

  protected getGeometry(): THREE.BufferGeometry {
    return oakTrapdoorOpenGeometry
  }

  protected getMaterials(): THREE.Material {
    return oakTrapdoorOpenMaterial
  }

  isGreedyMeshable(): boolean {
    return false
  }


  /**
   * Placement can flip this block upside down (metadata bit 4).
   */
  supportsVerticalFlip(): boolean {
    return true
  }
  getDrops(): IItem[] {
    return [new OakTrapdoorBlockItem()]
  }
}
