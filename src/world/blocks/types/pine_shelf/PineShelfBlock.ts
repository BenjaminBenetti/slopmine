import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { ShelfBlockBase } from '../shelf_shared/ShelfBlockBase.ts'
import { PineShelfBlockItem } from '../../../../items/blocks/pine_shelf/PineShelfBlockItem.ts'

// Reuse the pine planks texture (shared asset lives in the planks block dir)
import pinePlanksTexUrl from '../pine_planks/assets/pine-planks.webp'

const pinePlanksTexture = loadBlockTexture(pinePlanksTexUrl)
const pineShelfMaterial = new THREE.MeshLambertMaterial({ map: pinePlanksTexture })

/**
 * Pine shelf - a wall-mounted display board with 3 item slots.
 */
export class PineShelfBlock extends ShelfBlockBase {
  readonly properties: IBlockProperties = {
    id: BlockIds.PINE_SHELF,
    name: 'pine_shelf',
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
    return TextureId.PINE_PLANKS
  }

  protected getMaterials(): THREE.Material {
    return pineShelfMaterial
  }

  protected createShelfItem(): IItem {
    return new PineShelfBlockItem()
  }
}
