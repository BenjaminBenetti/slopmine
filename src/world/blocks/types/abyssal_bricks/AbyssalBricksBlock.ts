import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { AbyssalBricksBlockItem } from '../../../../items/blocks/abyssal_bricks/AbyssalBricksBlockItem.ts'
import texUrl from './assets/abyssal-bricks.webp'

registerTextureUrl(TextureId.ABYSSAL_BRICKS, texUrl)

const texture = loadBlockTexture(texUrl)
export const abyssalBricksMaterial = new THREE.MeshLambertMaterial({ map: texture })

/**
 * Abyssal bricks - decorative bricks crafted from polished abyssal stone.
 */
export class AbyssalBricksBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.ABYSSAL_BRICKS,
    name: 'abyssal_bricks',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 4.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 2,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.ABYSSAL_BRICKS
  }

  protected getMaterials(): THREE.Material {
    return abyssalBricksMaterial
  }

  getDrops(): IItem[] {
    return [new AbyssalBricksBlockItem()]
  }
}
