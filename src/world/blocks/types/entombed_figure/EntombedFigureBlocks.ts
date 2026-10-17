import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { BlackIceBlockItem } from '../../../../items/blocks/black_ice/BlackIceBlockItem.ts'
import { BoneItem } from '../../../../items/materials/bone/BoneItem.ts'
import upperTexUrl from './assets/entombed-upper.webp'
import lowerTexUrl from './assets/entombed-lower.webp'
import blackIceTexUrl from '../black_ice/assets/black-ice.webp'

/**
 * Entombed figures - the sinners frozen in the ice of Cocytus.
 *
 * A figure is two blocks of black ice whose faces show the two halves of one
 * dark silhouette (entombed-upper = head and chest, entombed-lower = legs),
 * drawn on the black ice texture itself so the blocks sit seamlessly in the
 * ice. The same two textures serve every pose (no extra texture layers):
 * - upright (pressure ridges): the figure on the four SIDE faces, upper block
 *   on top (side textures read upright);
 * - lying face-up in the lake surface: the figure on the TOP face. Top-face
 *   textures read with their up toward +Z, so the HEAD block lies at +Z of
 *   the FEET block. Lying figures therefore always run along Z.
 * Every other face is plain black ice. Breaking one shatters the figure:
 * black ice, and sometimes a bone.
 */

// BLACK_ICE is registered by BlackIceBlock
registerTextureUrl(TextureId.ENTOMBED_UPPER, upperTexUrl)
registerTextureUrl(TextureId.ENTOMBED_LOWER, lowerTexUrl)

const iceMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(blackIceTexUrl) })
const upperMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(upperTexUrl) })
const lowerMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(lowerTexUrl) })

abstract class EntombedFigureBlock extends SolidBlock {
  /** Texture (and material) of the face(s) that show the figure. */
  protected abstract readonly figureTexture: TextureId
  /** True: figure on the four side faces; false: on the top face. */
  protected abstract readonly upright: boolean

  protected makeProperties(id: BlockIds, name: string): IBlockProperties {
    return {
      id,
      name,
      isOpaque: true,
      isSolid: true,
      isLiquid: false,
      hardness: 3.0,
      lightLevel: 0,
      lightBlocking: 15,
      demolitionForceRequired: 2,
      tags: [BlockTags.ROCK],
    }
  }

  protected get defaultTextureId(): number {
    return TextureId.BLACK_ICE
  }

  private get figureMaterial(): THREE.Material {
    return this.figureTexture === TextureId.ENTOMBED_UPPER ? upperMaterial : lowerMaterial
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    const f = this.figureMaterial
    return this.upright
      ? [f, f, iceMaterial, iceMaterial, f, f]
      : [iceMaterial, iceMaterial, f, iceMaterial, iceMaterial, iceMaterial]
  }

  getTextureForFace(face: BlockFace): number {
    if (this.upright) return face >= 2 ? this.figureTexture : TextureId.BLACK_ICE
    return face === 0 ? this.figureTexture : TextureId.BLACK_ICE
  }

  getDrops(): IItem[] {
    const drops: IItem[] = [new BlackIceBlockItem()]
    if (Math.random() < 0.35) drops.push(new BoneItem())
    return drops
  }
}

/** Standing figure, head and chest (upper block). */
export class EntombedUprightUpperBlock extends EntombedFigureBlock {
  readonly properties = this.makeProperties(BlockIds.ENTOMBED_UPRIGHT_UPPER, 'entombed_upright_upper')
  protected readonly figureTexture = TextureId.ENTOMBED_UPPER
  protected readonly upright = true
}

/** Standing figure, legs (lower block). */
export class EntombedUprightLowerBlock extends EntombedFigureBlock {
  readonly properties = this.makeProperties(BlockIds.ENTOMBED_UPRIGHT_LOWER, 'entombed_upright_lower')
  protected readonly figureTexture = TextureId.ENTOMBED_LOWER
  protected readonly upright = true
}

/** Figure lying face-up in the lake along Z: head block (at +Z of the feet). */
export class EntombedLyingHeadBlock extends EntombedFigureBlock {
  readonly properties = this.makeProperties(BlockIds.ENTOMBED_LYING_HEAD, 'entombed_lying_head')
  protected readonly figureTexture = TextureId.ENTOMBED_UPPER
  protected readonly upright = false
}

/** Figure lying face-up in the lake along Z: feet block. */
export class EntombedLyingFeetBlock extends EntombedFigureBlock {
  readonly properties = this.makeProperties(BlockIds.ENTOMBED_LYING_FEET, 'entombed_lying_feet')
  protected readonly figureTexture = TextureId.ENTOMBED_LOWER
  protected readonly upright = false
}
