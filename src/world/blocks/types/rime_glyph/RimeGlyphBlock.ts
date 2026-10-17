import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { registerEmissiveTexture } from '../../../../renderer/EmissiveTextures.ts'
import texUrl from './assets/rime-glyph.webp'

registerTextureUrl(TextureId.RIME_GLYPH, texUrl)
// The rune channels glow cyan; the polished ice around them stays lit-only
registerEmissiveTexture(TextureId.RIME_GLYPH, { strength: 1.6, threshold: 0.55 })

const material = new THREE.MeshLambertMaterial({ map: loadBlockTexture(texUrl) })

/**
 * Rime glyph - a polished-ice floor tile inlaid with a glowing rune: the
 * vaults and the throne hall of the Frozen Citadel. Only the citadel
 * places it (the vault loot table's signature), so like the rime brazier
 * it needs infernium tools and drops nothing.
 */
export class RimeGlyphBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.RIME_GLYPH,
    name: 'rime_glyph',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 60,
    lightLevel: 6,
    lightBlocking: 15,
    demolitionForceRequired: 6,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.RIME_GLYPH
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getDrops(): IItem[] {
    return []
  }
}
