import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { OssifiedRockBlockItem } from '../../../../items/blocks/ossified_rock/OssifiedRockBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import ossifiedRockTexUrl from './assets/ossified-rock.webp'

registerTextureUrl(TextureId.OSSIFIED_ROCK, ossifiedRockTexUrl)

const ossifiedRockMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(ossifiedRockTexUrl) })

/**
 * Ossified rock - the bedrock of the Ossuary, grey-olive stone shot through
 * with fossil fragments. Hosts the soul veins.
 */
export class OssifiedRockBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.OSSIFIED_ROCK,
    name: 'ossified_rock',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 2.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 1,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.OSSIFIED_ROCK
  }

  protected getMaterials(): THREE.Material {
    return ossifiedRockMaterial
  }

  getDrops(): IItem[] {
    return [new OssifiedRockBlockItem()]
  }
}
