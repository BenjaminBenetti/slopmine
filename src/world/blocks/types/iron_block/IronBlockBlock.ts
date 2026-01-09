import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { IronOreItem } from '../../../../items/ores/iron/IronOreItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import ironBlockTexUrl from './assets/iron_block.webp'

// Register texture for atlas
registerTextureUrl(TextureId.IRON_BLOCK, ironBlockTexUrl)

const ironBlockTexture = loadBlockTexture(ironBlockTexUrl)
const ironBlockMaterial = new THREE.MeshLambertMaterial({ map: ironBlockTexture })

export class IronBlockBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.IRON_BLOCK,
    name: 'iron_block',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 5.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 1,
    tags: [BlockTags.STONE, BlockTags.METAL],
  }

  protected get defaultTextureId(): number {
    return TextureId.IRON_BLOCK
  }

  protected getMaterials(): THREE.Material {
    return ironBlockMaterial
  }

  getDrops(): IItem[] {
    // Drop 1-2 iron ore
    const count = 1 + Math.floor(Math.random() * 2)
    const drops: IItem[] = []
    for (let i = 0; i < count; i++) {
      drops.push(new IronOreItem())
    }
    return drops
  }
}
