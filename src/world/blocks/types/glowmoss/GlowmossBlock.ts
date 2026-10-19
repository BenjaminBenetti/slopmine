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
import { GlowmossBlockItem } from '../../../../items/blocks/glowmoss/GlowmossBlockItem.ts'
import glowmossTopTexUrl from './assets/glowmoss_top.webp'
import glowmossSideTexUrl from './assets/glowmoss_side.webp'
import glowmossTopGlowUrl from './assets/glowmoss_top_glow.webp'
import glowmossSideGlowUrl from './assets/glowmoss_side_glow.webp'
import mudTexUrl from '../mud/assets/mud.webp'

registerTextureUrl(TextureId.GLOWMOSS_TOP, glowmossTopTexUrl)
registerTextureUrl(TextureId.GLOWMOSS_SIDE, glowmossSideTexUrl)
// By day it is muddy grass with a few pale specks; in the dark its glow maps
// light up - turquoise spores (each twinkling on its own) over a faint sheen
registerEmissiveTexture(TextureId.GLOWMOSS_TOP, {
  strength: 1.8, threshold: 0, map: glowmossTopGlowUrl, darkOnly: true, pulse: { amount: 0.8, grain: 'speck' },
})
registerEmissiveTexture(TextureId.GLOWMOSS_SIDE, {
  strength: 1.8, threshold: 0, map: glowmossSideGlowUrl, darkOnly: true, pulse: { amount: 0.8, grain: 'speck' },
})

const glowmossTopMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(glowmossTopTexUrl) })
const glowmossSideMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(glowmossSideTexUrl) })
const mudMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(mudTexUrl) })

/**
 * Glowmoss - the swamp floor where the glowing mushrooms spread their
 * mycelium. By day it passes for muddy grass; after dark (and in deep shade)
 * its turquoise spores light up and twinkle. It lights itself - emissive, no
 * block light (warm torch light would be the wrong colour, and whole carpets
 * of emitters would cost light work).
 */
export class GlowmossBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.GLOWMOSS,
    name: 'glowmoss',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.4,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.SOIL],
  }

  protected get defaultTextureId(): number {
    return TextureId.GLOWMOSS_SIDE
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [
      glowmossSideMaterial,
      glowmossSideMaterial,
      glowmossTopMaterial,
      mudMaterial,
      glowmossSideMaterial,
      glowmossSideMaterial,
    ]
  }

  getTextureForFace(face: BlockFace): number {
    switch (face) {
      case 0: return TextureId.GLOWMOSS_TOP
      case 1: return TextureId.MUD
      default: return TextureId.GLOWMOSS_SIDE
    }
  }

  getDrops(): IItem[] {
    // Unlike muddy grass, the moss comes up whole (for glowing gardens)
    return [new GlowmossBlockItem()]
  }
}
