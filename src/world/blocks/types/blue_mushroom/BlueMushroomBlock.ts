import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { BlueMushroomBlockItem } from '../../../../items/blocks/blue_mushroom/BlueMushroomBlockItem.ts'
import blueMushroomTexUrl from './assets/blue_mushroom.webp'

// Register texture for atlas
registerTextureUrl(TextureId.BLUE_MUSHROOM, blueMushroomTexUrl)

const blueMushroomTexture = loadBlockTexture(blueMushroomTexUrl)
const blueMushroomMaterial = new THREE.MeshLambertMaterial({ map: blueMushroomTexture })

export class BlueMushroomBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.BLUE_MUSHROOM,
    name: 'blue_mushroom',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.2,
    lightLevel: 2,  // Slight bioluminescent glow
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.BLUE_MUSHROOM
  }

  protected getMaterials(): THREE.Material {
    return blueMushroomMaterial
  }

  getDrops(): IItem[] {
    return [new BlueMushroomBlockItem()]
  }
}
