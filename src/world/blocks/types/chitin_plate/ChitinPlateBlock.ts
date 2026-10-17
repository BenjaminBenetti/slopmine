import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { ChitinPlateBlockItem } from '../../../../items/blocks/chitin_plate/ChitinPlateBlockItem.ts'
import texUrl from './assets/chitin-plate.webp'

registerTextureUrl(TextureId.CHITIN_PLATE, texUrl)

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(texUrl) })

/**
 * Chitin plate - armoured carapace plating of the Sporeheart Hive (vault,
 * throne and warden hall floors, armoured walls). Dungeon structure: force 6.
 */
export class ChitinPlateBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CHITIN_PLATE,
    name: 'chitin_plate',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 45,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 6,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.CHITIN_PLATE
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new ChitinPlateBlockItem()]
  }
}
