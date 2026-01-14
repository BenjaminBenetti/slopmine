import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { PurpleMushroomCapBlockItem } from '../../../../items/blocks/purple_mushroom_cap/PurpleMushroomCapBlockItem.ts'
import purpleMushroomCapTexUrl from './assets/purple_mushroom_cap.webp'

// Register texture for atlas
registerTextureUrl(TextureId.PURPLE_MUSHROOM_CAP, purpleMushroomCapTexUrl)

const purpleMushroomCapTexture = loadBlockTexture(purpleMushroomCapTexUrl)
const purpleMushroomCapMaterial = new THREE.MeshLambertMaterial({ map: purpleMushroomCapTexture })

export class PurpleMushroomCapBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.PURPLE_MUSHROOM_CAP,
    name: 'purple_mushroom_cap',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.2,
    lightLevel: 15,  // Magical glow from cap
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.PURPLE_MUSHROOM_CAP
  }

  protected getMaterials(): THREE.Material {
    return purpleMushroomCapMaterial
  }

  getDrops(): IItem[] {
    return [new PurpleMushroomCapBlockItem()]
  }
}
