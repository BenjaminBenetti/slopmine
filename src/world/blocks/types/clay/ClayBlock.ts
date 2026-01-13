import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { ClayBlockItem } from '../../../../items/blocks/clay/ClayBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import clayTexUrl from './assets/clay.webp'

// Register texture for atlas
registerTextureUrl(TextureId.CLAY, clayTexUrl)

const clayTexture = loadBlockTexture(clayTexUrl)
const clayMaterial = new THREE.MeshLambertMaterial({ map: clayTexture })

export class ClayBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CLAY,
    name: 'clay',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.6,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.SOIL],
  }

  protected get defaultTextureId(): number {
    return TextureId.CLAY
  }

  protected getMaterials(): THREE.Material {
    return clayMaterial
  }

  getDrops(): IItem[] {
    return [new ClayBlockItem()]
  }
}
