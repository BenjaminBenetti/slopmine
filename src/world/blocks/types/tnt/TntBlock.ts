import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TntBlockItem } from '../../../../items/blocks/tnt/TntBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import tntTexUrl from './assets/tnt.webp'

// Register texture for atlas
registerTextureUrl(TextureId.TNT, tntTexUrl)

const tntTexture = loadBlockTexture(tntTexUrl)
const tntMaterial = new THREE.MeshLambertMaterial({ map: tntTexture })

/**
 * TNT block - a crafted explosive crate (4 sulfur + 2 charcoal).
 * Player-crafted only, never placed by worldgen. Ignited via E-interact
 * (see TntSystem, wired in main.ts): ~2s fuse, then a radius-4 explosion
 * that destroys blocks (obsidian and liquids are spared), scatters drops,
 * damages/knocks back the player, and chain-ignites nearby TNT.
 */
export class TntBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.TNT,
    name: 'tnt',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    // blockHP = 0.5 * 5 = 2.5; quick to break by hand
    hardness: 0.5,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 0, // Mineable by hand
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.TNT
  }

  protected getMaterials(): THREE.Material {
    return tntMaterial
  }

  getDrops(): IItem[] {
    return [new TntBlockItem()]
  }
}
