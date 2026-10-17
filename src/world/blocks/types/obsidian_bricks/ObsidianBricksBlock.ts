import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { ObsidianBricksBlockItem } from '../../../../items/blocks/obsidian_bricks/ObsidianBricksBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import obsidianBricksTexUrl from './assets/obsidian-bricks.webp'

registerTextureUrl(TextureId.OBSIDIAN_BRICKS, obsidianBricksTexUrl)

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(obsidianBricksTexUrl) })

/**
 * Obsidian bricks: glassy black-violet masonry of the Infernal Bastion's keep,
 * citadel spire, vault and throne ring. Structural dungeon block (force 6).
 */
export class ObsidianBricksBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.OBSIDIAN_BRICKS,
    name: 'obsidian_bricks',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    // Bastion structure: blockHP = 60 * 5 = 300 - infernium pickaxe only
    hardness: 60.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 6,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.OBSIDIAN_BRICKS
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new ObsidianBricksBlockItem()]
  }
}
