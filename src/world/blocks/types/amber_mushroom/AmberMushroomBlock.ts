import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { AmberMushroomBlockItem } from '../../../../items/blocks/amber_mushroom/AmberMushroomBlockItem.ts'
import amberMushroomTexUrl from './assets/amber_mushroom.webp'

// Register texture
registerTextureUrl(TextureId.AMBER_MUSHROOM, amberMushroomTexUrl)

const amberMushroomTexture = loadBlockTexture(amberMushroomTexUrl)
const amberMushroomMaterial = new THREE.MeshLambertMaterial({ map: amberMushroomTexture })

export class AmberMushroomBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.AMBER_MUSHROOM,
    name: 'amber_mushroom',
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
    return TextureId.AMBER_MUSHROOM
  }

  protected getMaterials(): THREE.Material {
    return amberMushroomMaterial
  }

  getDrops(): IItem[] {
    return [new AmberMushroomBlockItem()]
  }
}
