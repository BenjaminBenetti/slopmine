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
import { EmberGillsBlockItem } from '../../../../items/blocks/ember_gills/EmberGillsBlockItem.ts'
import gillsTexUrl from './assets/ember-gills.webp'

registerTextureUrl(TextureId.EMBER_GILLS, gillsTexUrl)
// Bioluminescent pore walls: the teal glow under every cap
registerEmissiveTexture(TextureId.EMBER_GILLS, { strength: 0.45, threshold: 0.2 })

const gillsTexture = loadBlockTexture(gillsTexUrl)
// Item displays (icons, held item) glow too
const gillsMaterial = new THREE.MeshLambertMaterial({
  map: gillsTexture,
  emissiveMap: gillsTexture,
  emissive: 0xffffff,
  emissiveIntensity: 0.55,
})

/**
 * Ember gills - the glowing teal underside of a giant fungus cap. The gills
 * glow through their emissive texture; only a sparse subset (the `lit`
 * variant, EMBER_GILLS_LIT, chosen per cell by the fungus generator) casts
 * real block light, so the canopy throws teal pools of light without
 * flooding the light engine with emitters.
 */
export class EmberGillsBlock extends SolidBlock {
  readonly properties: IBlockProperties

  constructor(lit = false) {
    super()
    this.properties = {
      id: lit ? BlockIds.EMBER_GILLS_LIT : BlockIds.EMBER_GILLS,
      name: lit ? 'ember_gills_lit' : 'ember_gills',
      isOpaque: true,
      isSolid: true,
      isLiquid: false,
      hardness: 0.6,
      lightLevel: lit ? 10 : 0,
      lightBlocking: 15,
      demolitionForceRequired: 0,
      tags: [BlockTags.WOOD],
    }
  }

  protected get defaultTextureId(): number {
    return TextureId.EMBER_GILLS
  }

  protected getMaterials(): THREE.Material {
    return gillsMaterial
  }

  getDrops(): IItem[] {
    return [new EmberGillsBlockItem()]
  }
}
