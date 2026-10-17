import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { registerEmissiveTexture } from '../../../../renderer/EmissiveTextures.ts'
import { EmberwoodStemBlockItem } from '../../../../items/blocks/emberwood_stem/EmberwoodStemBlockItem.ts'
import stemTexUrl from './assets/emberwood-stem.webp'
import stemEndTexUrl from './assets/emberwood-stem-end.webp'

registerTextureUrl(TextureId.EMBERWOOD_STEM_SIDE, stemTexUrl)
registerTextureUrl(TextureId.EMBERWOOD_STEM_END, stemEndTexUrl)
// The ember-orange fibres smoulder faintly in the dark
registerEmissiveTexture(TextureId.EMBERWOOD_STEM_SIDE, { strength: 0.5, threshold: 0.45 })

const stemMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(stemTexUrl) })
const stemEndMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(stemEndTexUrl) })

/**
 * Emberwood stem - the trunk of the Ember Grove's giant hell fungi, the
 * Hell layer's wood. Axe-effective, drops itself; planks, sticks, torches,
 * tools and chests come from it through the `log`/`wood` item tags.
 *
 * Deliberately NOT a LogBlock: giant fungi have no leaves, so tree felling
 * (log_shared) and leaf decay (leaf_shared) stay out of the fungus forest.
 */
export class EmberwoodStemBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.EMBERWOOD_STEM,
    name: 'emberwood_stem',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 2.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.EMBERWOOD_STEM_SIDE
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [stemMaterial, stemMaterial, stemEndMaterial, stemEndMaterial, stemMaterial, stemMaterial]
  }

  getTextureForFace(face: BlockFace): number {
    return face === 0 || face === 1 ? TextureId.EMBERWOOD_STEM_END : TextureId.EMBERWOOD_STEM_SIDE
  }

  getDrops(): IItem[] {
    return [new EmberwoodStemBlockItem()]
  }
}
