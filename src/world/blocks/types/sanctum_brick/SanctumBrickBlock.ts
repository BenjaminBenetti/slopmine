import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { registerEmissiveTexture } from '../../../../renderer/EmissiveTextures.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { AbyssalBricksBlockItem } from '../../../../items/blocks/abyssal_bricks/AbyssalBricksBlockItem.ts'
import texUrl from './assets/sanctum-brick.webp'

registerTextureUrl(TextureId.SANCTUM_BRICK, texUrl)
// The prism-inlaid seams glow; the brick faces do not
registerEmissiveTexture(TextureId.SANCTUM_BRICK, { strength: 1.1, threshold: 0.2 })

const texture = loadBlockTexture(texUrl)
const material = new THREE.MeshLambertMaterial({ map: texture })

/**
 * Sanctum brick - the walls of the Prism Sanctum dungeon: polished abyssal
 * brick with glowing prism-inlaid seams. Dungeon structural block (DESIGN §4):
 * force 6 and very hard, so the way in is the door until the player has
 * infernium tools. Only the sanctum places it, which makes it the signature
 * of the sanctum vault loot table. Breaks into plain abyssal bricks.
 */
export class SanctumBrickBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.SANCTUM_BRICK,
    name: 'sanctum_brick',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    // blockHP = 200 * 5 = 1000: slow even with infernium tools
    hardness: 200.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 6,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.SANCTUM_BRICK
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new AbyssalBricksBlockItem()]
  }
}
