import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { HellRockBlockItem } from '../../../../items/blocks/hell_rock/HellRockBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import hellRockTexUrl from './assets/hell-rock.webp'

// Register texture for atlas
registerTextureUrl(TextureId.HELL_ROCK, hellRockTexUrl)

const hellRockTexture = loadBlockTexture(hellRockTexUrl)
const hellRockMaterial = new THREE.MeshLambertMaterial({ map: hellRockTexture })

export class HellRockBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.HELL_ROCK,
    name: 'hell_rock',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 1.5,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 1,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.HELL_ROCK
  }

  protected getMaterials(): THREE.Material {
    return hellRockMaterial
  }

  getDrops(): IItem[] {
    return [new HellRockBlockItem()]
  }
}
