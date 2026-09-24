import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { registerEmissiveTexture } from '../../../../renderer/EmissiveTextures.ts'
import { HellMagmaBlockItem } from '../../../../items/blocks/hell_magma/HellMagmaBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import hellMagmaTexUrl from './assets/hell-magma.webp'

// Register texture
registerTextureUrl(TextureId.HELL_MAGMA, hellMagmaTexUrl)
// Emissive: the molten veins glow, the dark cells do not
registerEmissiveTexture(TextureId.HELL_MAGMA, { strength: 1.0, threshold: 0.2 })

const hellMagmaTexture = loadBlockTexture(hellMagmaTexUrl)
const hellMagmaMaterial = new THREE.MeshLambertMaterial({ map: hellMagmaTexture })

/**
 * Hell Magma block - glowing volcanic rock found in Hell biome pillars.
 * Combines the dark red hell rock base with glowing magma veins.
 * Emits light due to the molten material visible through cracks.
 */
export class HellMagmaBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.HELL_MAGMA,
    name: 'hell_magma',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 1.5,
    lightLevel: 8, // Molten veins glow (emissive) and warm the rock around them
    lightBlocking: 15,
    demolitionForceRequired: 1, // Requires pickaxe
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.HELL_MAGMA
  }

  protected getMaterials(): THREE.Material {
    return hellMagmaMaterial
  }

  getDrops(): IItem[] {
    return [new HellMagmaBlockItem()]
  }
}
