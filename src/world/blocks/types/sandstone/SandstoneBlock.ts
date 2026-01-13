import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { SandstoneBlockItem } from '../../../../items/blocks/sandstone/SandstoneBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import sandstoneTexUrl from './assets/sandstone.webp'

// Register texture for atlas
registerTextureUrl(TextureId.SANDSTONE, sandstoneTexUrl)

const sandstoneTexture = loadBlockTexture(sandstoneTexUrl)
const sandstoneMaterial = new THREE.MeshLambertMaterial({ map: sandstoneTexture })

export class SandstoneBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.SANDSTONE,
    name: 'sandstone',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.8,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 1,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.SANDSTONE
  }

  protected getMaterials(): THREE.Material {
    return sandstoneMaterial
  }

  getDrops(): IItem[] {
    return [new SandstoneBlockItem()]
  }
}
