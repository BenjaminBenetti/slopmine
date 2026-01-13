import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { PurpleMushroomBlockItem } from '../../../../items/blocks/purple_mushroom/PurpleMushroomBlockItem.ts'
import purpleMushroomTexUrl from './assets/purple_mushroom.webp'

// Register texture for atlas
registerTextureUrl(TextureId.PURPLE_MUSHROOM, purpleMushroomTexUrl)

const purpleMushroomTexture = loadBlockTexture(purpleMushroomTexUrl)
const purpleMushroomMaterial = new THREE.MeshLambertMaterial({ map: purpleMushroomTexture })

export class PurpleMushroomBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.PURPLE_MUSHROOM,
    name: 'purple_mushroom',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.2,
    lightLevel: 2,  // Slight magical glow
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.PURPLE_MUSHROOM
  }

  protected getMaterials(): THREE.Material {
    return purpleMushroomMaterial
  }

  getDrops(): IItem[] {
    return [new PurpleMushroomBlockItem()]
  }
}
