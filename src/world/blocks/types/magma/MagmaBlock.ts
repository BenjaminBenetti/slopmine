import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { registerEmissiveTexture } from '../../../../renderer/EmissiveTextures.ts'
import { MagmaBlockItem } from '../../../../items/blocks/magma/MagmaBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import magmaTexUrl from './assets/magma.webp'

// Register texture
registerTextureUrl(TextureId.MAGMA, magmaTexUrl)
// Emissive: the molten cracks glow
registerEmissiveTexture(TextureId.MAGMA, { strength: 1.2, threshold: 0.1 })

const magmaTexture = loadBlockTexture(magmaTexUrl)
const magmaMaterial = new THREE.MeshLambertMaterial({ map: magmaTexture })

/**
 * Magma block - glowing volcanic rock found beneath basalt in volcanic biomes.
 * Emits light due to the molten material visible through cracks.
 */
export class MagmaBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.MAGMA,
    name: 'magma',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 1.5,
    lightLevel: 8, // Molten cracks glow (emissive) and warm the rock around them
    lightBlocking: 15,
    demolitionForceRequired: 1, // Requires pickaxe
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.MAGMA
  }

  protected getMaterials(): THREE.Material {
    return magmaMaterial
  }

  getDrops(): IItem[] {
    return [new MagmaBlockItem()]
  }
}
