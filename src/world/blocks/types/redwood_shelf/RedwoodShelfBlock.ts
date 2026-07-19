import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { ShelfBlockBase } from '../shelf_shared/ShelfBlockBase.ts'
import { RedwoodShelfBlockItem } from '../../../../items/blocks/redwood_shelf/RedwoodShelfBlockItem.ts'

// Reuse the redwood planks texture (shared asset lives in the planks block dir)
import redwoodPlanksTexUrl from '../redwood_planks/assets/redwood-planks.webp'

const redwoodPlanksTexture = loadBlockTexture(redwoodPlanksTexUrl)
const redwoodShelfMaterial = new THREE.MeshLambertMaterial({ map: redwoodPlanksTexture })

/**
 * Redwood shelf - a wall-mounted display board with 3 item slots.
 */
export class RedwoodShelfBlock extends ShelfBlockBase {
  readonly properties: IBlockProperties = {
    id: BlockIds.REDWOOD_SHELF,
    name: 'redwood_shelf',
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
    return TextureId.REDWOOD_PLANKS
  }

  protected getMaterials(): THREE.Material {
    return redwoodShelfMaterial
  }

  protected createShelfItem(): IItem {
    return new RedwoodShelfBlockItem()
  }
}
