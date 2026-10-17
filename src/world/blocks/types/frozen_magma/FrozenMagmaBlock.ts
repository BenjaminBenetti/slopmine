import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { registerEmissiveTexture } from '../../../../renderer/EmissiveTextures.ts'
import { FrozenMagmaBlockItem } from '../../../../items/blocks/frozen_magma/FrozenMagmaBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import texUrl from './assets/frozen-magma.webp'

registerTextureUrl(TextureId.FROZEN_MAGMA, texUrl)
// Embers glow through the ice. Threshold 0 (the whole texel colour glows,
// like the glowing mushroom caps): the dark ice adds almost nothing, while a
// thresholded glow vanished once distant mip levels averaged the embers into
// the ice
registerEmissiveTexture(TextureId.FROZEN_MAGMA, { strength: 3.0, threshold: 0 })

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(texUrl) })

/**
 * Frozen magma - lava caught mid-fall by the cold of Cocytus: dark ice over
 * dull embers. Builds the frozen lavafalls; the embers still glow.
 */
export class FrozenMagmaBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.FROZEN_MAGMA,
    name: 'frozen_magma',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 3.0,
    lightLevel: 6, // a warm ember glow: the frozen lavafalls are landmarks
    lightBlocking: 15,
    demolitionForceRequired: 2,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.FROZEN_MAGMA
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return [new FrozenMagmaBlockItem()]
  }
}
