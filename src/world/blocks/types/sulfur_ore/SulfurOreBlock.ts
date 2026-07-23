import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { SulfurItem } from '../../../../items/ores/sulfur/SulfurItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import sulfurOreTexUrl from './assets/sulfur_ore.webp'

// Register texture for atlas
registerTextureUrl(TextureId.SULFUR_ORE, sulfurOreTexUrl)

const sulfurOreTexture = loadBlockTexture(sulfurOreTexUrl)
const sulfurOreMaterial = new THREE.MeshLambertMaterial({ map: sulfurOreTexture })

/**
 * Sulfur ore block - basalt rock crusted with yellow sulfur deposits,
 * found in volcanic biomes. Requires a stone pickaxe or better.
 */
export class SulfurOreBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.SULFUR_ORE,
    name: 'sulfur_ore',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 3.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 2, // Stone pickaxe (tier 2) or better
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.SULFUR_ORE
  }

  protected getMaterials(): THREE.Material {
    return sulfurOreMaterial
  }

  getDrops(): IItem[] {
    // Drop 2-4 sulfur
    const count = 2 + Math.floor(Math.random() * 3)
    const drops: IItem[] = []
    for (let i = 0; i < count; i++) {
      drops.push(new SulfurItem())
    }
    return drops
  }
}
