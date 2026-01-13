import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { BasaltBlockItem } from '../../../../items/blocks/basalt/BasaltBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import basaltTexUrl from './assets/basalt.webp'

// Register texture for atlas
registerTextureUrl(TextureId.BASALT, basaltTexUrl)

const basaltTexture = loadBlockTexture(basaltTexUrl)
const basaltMaterial = new THREE.MeshLambertMaterial({ map: basaltTexture })

/**
 * Basalt block - dark volcanic rock found in volcanic biomes.
 */
export class BasaltBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.BASALT,
    name: 'basalt',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 1.25,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 1, // Requires pickaxe
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.BASALT
  }

  protected getMaterials(): THREE.Material {
    return basaltMaterial
  }

  getDrops(): IItem[] {
    return [new BasaltBlockItem()]
  }
}
