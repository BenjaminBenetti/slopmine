import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { FrozenBookshelfBlockItem } from '../../../../items/blocks/frozen_bookshelf/FrozenBookshelfBlockItem.ts'
import shelfTexUrl from './assets/frozen-bookshelf.webp'
import planksTexUrl from '../frostbound_planks/assets/frostbound-planks.webp'

// FROSTBOUND_PLANKS (top/bottom) is registered by FrostboundPlanksBlock
registerTextureUrl(TextureId.FROZEN_BOOKSHELF, shelfTexUrl)

const shelfMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(shelfTexUrl) })
const planksMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(planksTexUrl) })

/**
 * Frozen bookshelf - rows of frost-dusted tomes in frostbound timber: the
 * library of the Frozen Citadel.
 */
export class FrozenBookshelfBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.FROZEN_BOOKSHELF,
    name: 'frozen_bookshelf',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 1.5,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.FROZEN_BOOKSHELF
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [shelfMaterial, shelfMaterial, planksMaterial, planksMaterial, shelfMaterial, shelfMaterial]
  }

  getTextureForFace(face: BlockFace): number {
    return face <= 1 ? TextureId.FROSTBOUND_PLANKS : TextureId.FROZEN_BOOKSHELF
  }

  getDrops(): IItem[] {
    return [new FrozenBookshelfBlockItem()]
  }
}
