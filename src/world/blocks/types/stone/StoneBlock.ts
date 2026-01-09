import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { StoneBlockItem } from '../../../../items/blocks/stone/StoneBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import stoneTexUrl from './assets/stone.webp'

// Register texture for atlas
registerTextureUrl(TextureId.STONE, stoneTexUrl)

const stoneTexture = loadBlockTexture(stoneTexUrl)
const stoneMaterial = new THREE.MeshLambertMaterial({ map: stoneTexture })

export class StoneBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.STONE,
    name: 'stone',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 2.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 1,
    tags: [BlockTags.STONE],
  }

  protected get defaultTextureId(): number {
    return TextureId.STONE
  }

  protected getMaterials(): THREE.Material {
    return stoneMaterial
  }

  getDrops(): IItem[] {
    return [new StoneBlockItem()]
  }
}
