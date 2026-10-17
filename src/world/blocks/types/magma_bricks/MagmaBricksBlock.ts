import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { registerEmissiveTexture } from '../../../../renderer/EmissiveTextures.ts'
import { MagmaBricksBlockItem } from '../../../../items/blocks/magma_bricks/MagmaBricksBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import magmaBricksTexUrl from './assets/magma-bricks.webp'

registerTextureUrl(TextureId.MAGMA_BRICKS, magmaBricksTexUrl)
// The lava mortar glows; the bricks do not
registerEmissiveTexture(TextureId.MAGMA_BRICKS, { strength: 1.3, threshold: 0.4 })

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(magmaBricksTexUrl) })

/**
 * Magma bricks: infernal bricks set in glowing lava mortar - the Infernal
 * Bastion's forge hearths and lava-channel rims. Emissive joints, light 6.
 * Structural dungeon block (force 6).
 */
export class MagmaBricksBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.MAGMA_BRICKS,
    name: 'magma_bricks',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    // Bastion structure: blockHP = 60 * 5 = 300 - infernium pickaxe only
    hardness: 60.0,
    lightLevel: 6,
    lightBlocking: 15,
    demolitionForceRequired: 6,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.MAGMA_BRICKS
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new MagmaBricksBlockItem()]
  }
}
