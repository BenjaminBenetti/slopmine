import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { MushroomBlockItem } from '../../../../items/blocks/mushroom/MushroomBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import mushroomTexUrl from './assets/mushroom.webp'

// Register texture for atlas
registerTextureUrl(TextureId.MUSHROOM, mushroomTexUrl)

const mushroomTexture = loadBlockTexture(mushroomTexUrl)
const mushroomMaterial = new THREE.MeshLambertMaterial({ map: mushroomTexture })

export class MushroomBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.MUSHROOM,
    name: 'mushroom',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.2,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.MUSHROOM
  }

  protected getMaterials(): THREE.Material {
    return mushroomMaterial
  }

  getDrops(): IItem[] {
    return [new MushroomBlockItem()]
  }
}
