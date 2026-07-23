import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { ObsidianBlockItem } from '../../../../items/blocks/obsidian/ObsidianBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import obsidianTexUrl from './assets/obsidian.webp'

// Register texture for atlas
registerTextureUrl(TextureId.OBSIDIAN, obsidianTexUrl)

const obsidianTexture = loadBlockTexture(obsidianTexUrl)
const obsidianMaterial = new THREE.MeshLambertMaterial({ map: obsidianTexture })

/**
 * Obsidian block - extremely hard volcanic glass found in volcanic biomes.
 * Only a diamond pickaxe (tier 5) can mine it; a rare trophy/building material.
 */
export class ObsidianBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.OBSIDIAN,
    name: 'obsidian',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    // blockHP = 140 * 5 = 700; diamond pickaxe (6.5 dmg * 12 rock) = 78 dps -> ~9s
    hardness: 140.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 5, // Only diamond pickaxe (tier 5) can mine
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.OBSIDIAN
  }

  protected getMaterials(): THREE.Material {
    return obsidianMaterial
  }

  getDrops(): IItem[] {
    return [new ObsidianBlockItem()]
  }
}
