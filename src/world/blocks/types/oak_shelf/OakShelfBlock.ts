import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { ShelfBlockBase } from '../shelf_shared/ShelfBlockBase.ts'
import { OakShelfBlockItem } from '../../../../items/blocks/oak_shelf/OakShelfBlockItem.ts'

// Reuse the oak planks texture (shared asset lives in the planks block dir)
import oakPlanksTexUrl from '../oak_planks/assets/oak-planks.webp'

const oakPlanksTexture = loadBlockTexture(oakPlanksTexUrl)
const oakShelfMaterial = new THREE.MeshLambertMaterial({ map: oakPlanksTexture })

/**
 * Oak shelf - a wall-mounted display board with 3 item slots.
 */
export class OakShelfBlock extends ShelfBlockBase {
  readonly properties: IBlockProperties = {
    id: BlockIds.OAK_SHELF,
    name: 'oak_shelf',
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
    return TextureId.OAK_PLANKS
  }

  protected getMaterials(): THREE.Material {
    return oakShelfMaterial
  }

  protected createShelfItem(): IItem {
    return new OakShelfBlockItem()
  }
}
