import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { CarvedBonePillarBlockItem } from '../../../../items/blocks/carved_bone_pillar/CarvedBonePillarBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import topTexUrl from '../bone_block/assets/bone-block-top.webp'
import texUrl from './assets/carved-bone-pillar.webp'

registerTextureUrl(TextureId.CARVED_BONE_PILLAR, texUrl)

const sideMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(texUrl) })
const topMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(topTexUrl) })

/**
 * Carved bone pillar - a column of bone carved into stacked vertebrae, the
 * colonnades of the Catacombs halls and the throne crypt.
 */
export class CarvedBonePillarBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CARVED_BONE_PILLAR,
    name: 'carved_bone_pillar',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 2.5,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 1,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.CARVED_BONE_PILLAR
  }

  getTextureForFace(face: BlockFace): number {
    return face === 0 || face === 1 ? TextureId.BONE_BLOCK_TOP : TextureId.CARVED_BONE_PILLAR
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z (top/bottom: the shared bone_block_top texture)
    return [sideMaterial, sideMaterial, topMaterial, topMaterial, sideMaterial, sideMaterial]
  }

  getDrops(): IItem[] {
    return [new CarvedBonePillarBlockItem()]
  }
}
