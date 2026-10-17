import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { CatacombFriezeBlockItem } from '../../../../items/blocks/catacomb_frieze/CatacombFriezeBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import topTexUrl from '../catacomb_brick/assets/catacomb-brick.webp'
import texUrl from './assets/catacomb-frieze.webp'

registerTextureUrl(TextureId.CATACOMB_FRIEZE, texUrl)

const sideMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(texUrl) })
const topMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(topTexUrl) })

/**
 * Catacomb frieze - a carved band of skulls and crossed bones for crypt walls
 * and lintels. Dungeon structural block (force 6).
 */
export class CatacombFriezeBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CATACOMB_FRIEZE,
    name: 'catacomb_frieze',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 60.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 6,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.CATACOMB_FRIEZE
  }

  getTextureForFace(face: BlockFace): number {
    return face === 0 || face === 1 ? TextureId.CATACOMB_BRICK : TextureId.CATACOMB_FRIEZE
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z (top/bottom: the shared catacomb_brick texture)
    return [sideMaterial, sideMaterial, topMaterial, topMaterial, sideMaterial, sideMaterial]
  }

  getDrops(): IItem[] {
    return [new CatacombFriezeBlockItem()]
  }
}
