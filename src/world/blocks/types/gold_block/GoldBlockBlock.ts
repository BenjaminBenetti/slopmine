import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { GoldOreItem } from '../../../../items/ores/gold/GoldOreItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import goldBlockTexUrl from './assets/gold_block.webp'

// Register texture for atlas
registerTextureUrl(TextureId.GOLD_BLOCK, goldBlockTexUrl)

const goldBlockTexture = loadBlockTexture(goldBlockTexUrl)
const goldBlockMaterial = new THREE.MeshLambertMaterial({ map: goldBlockTexture })

export class GoldBlockBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.GOLD_BLOCK,
    name: 'gold_block',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 3.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 1,
    tags: [BlockTags.STONE, BlockTags.METAL],
  }

  protected get defaultTextureId(): number {
    return TextureId.GOLD_BLOCK
  }

  protected getMaterials(): THREE.Material {
    return goldBlockMaterial
  }

  getDrops(): IItem[] {
    // Drop 1-2 gold ore
    const count = 1 + Math.floor(Math.random() * 2)
    const drops: IItem[] = []
    for (let i = 0; i < count; i++) {
      drops.push(new GoldOreItem())
    }
    return drops
  }
}
