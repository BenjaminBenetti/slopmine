import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { FoxfireMushroomBlockItem } from '../../../../items/blocks/foxfire_mushroom/FoxfireMushroomBlockItem.ts'
import foxfireMushroomTexUrl from './assets/foxfire_mushroom.webp'

// Register texture
registerTextureUrl(TextureId.FOXFIRE_MUSHROOM, foxfireMushroomTexUrl)

const foxfireMushroomTexture = loadBlockTexture(foxfireMushroomTexUrl)
const foxfireMushroomMaterial = new THREE.MeshLambertMaterial({ map: foxfireMushroomTexture })

export class FoxfireMushroomBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.FOXFIRE_MUSHROOM,
    name: 'foxfire_mushroom',
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
    return TextureId.FOXFIRE_MUSHROOM
  }

  protected getMaterials(): THREE.Material {
    return foxfireMushroomMaterial
  }

  getDrops(): IItem[] {
    return [new FoxfireMushroomBlockItem()]
  }
}
