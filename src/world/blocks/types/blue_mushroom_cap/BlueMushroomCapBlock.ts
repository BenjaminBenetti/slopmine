import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { BlueMushroomCapBlockItem } from '../../../../items/blocks/blue_mushroom_cap/BlueMushroomCapBlockItem.ts'
import blueMushroomCapTexUrl from './assets/blue_mushroom_cap.webp'

// Register texture for atlas
registerTextureUrl(TextureId.BLUE_MUSHROOM_CAP, blueMushroomCapTexUrl)

const blueMushroomCapTexture = loadBlockTexture(blueMushroomCapTexUrl)
const blueMushroomCapMaterial = new THREE.MeshLambertMaterial({ map: blueMushroomCapTexture })

export class BlueMushroomCapBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.BLUE_MUSHROOM_CAP,
    name: 'blue_mushroom_cap',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.2,
    lightLevel: 15,  // Bioluminescent glow from cap
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.BLUE_MUSHROOM_CAP
  }

  protected getMaterials(): THREE.Material {
    return blueMushroomCapMaterial
  }

  getDrops(): IItem[] {
    return [new BlueMushroomCapBlockItem()]
  }
}
