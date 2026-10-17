import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { registerEmissiveTexture } from '../../../../renderer/EmissiveTextures.ts'
import { EmberGlyphBlockItem } from '../../../../items/blocks/ember_glyph/EmberGlyphBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import emberGlyphTexUrl from './assets/ember-glyph.webp'

registerTextureUrl(TextureId.EMBER_GLYPH, emberGlyphTexUrl)
// The rune channels glow; the dark stone between them does not
registerEmissiveTexture(TextureId.EMBER_GLYPH, { strength: 1.6, threshold: 0.3 })

const emberGlyphMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(emberGlyphTexUrl) })

/**
 * Ember glyph: infernal stone carved with glowing molten runes, set into the
 * Infernal Bastion's walls, towers and spire. Glows (emissive runes + light
 * 7): the glyph bands on the bastion's towers make it visible from across
 * the sea.
 */
export class EmberGlyphBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.EMBER_GLYPH,
    name: 'ember_glyph',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 60.0,
    lightLevel: 7,
    lightBlocking: 15,
    demolitionForceRequired: 6, // infernium pickaxe
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.EMBER_GLYPH
  }

  protected getMaterials(): THREE.Material {
    return emberGlyphMaterial
  }

  getDrops(): IItem[] {
    return [new EmberGlyphBlockItem()]
  }
}
