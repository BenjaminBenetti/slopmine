import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { BoneBlockItem } from '../../../../items/blocks/bone_block/BoneBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import boneSideTexUrl from './assets/bone-block-side.webp'
import boneTopTexUrl from './assets/bone-block-top.webp'

registerTextureUrl(TextureId.BONE_BLOCK_SIDE, boneSideTexUrl)
registerTextureUrl(TextureId.BONE_BLOCK_TOP, boneTopTexUrl)

const sideMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(boneSideTexUrl) })
const topMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(boneTopTexUrl) })

/**
 * Bone block - bleached bones packed into a solid block. The Ossuary's
 * colossal fossils (ribcages, vertebrae arches, skulls) and bone spires are
 * built from it, and players craft it from 4 bones (and back).
 *
 * The block's registry name is 'bone' so the item id 'bone_block' follows
 * the `<block_name>_block` item display convention.
 */
export class BoneBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.BONE_BLOCK,
    name: 'bone',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 2.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 1,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.BONE_BLOCK_SIDE
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [sideMaterial, sideMaterial, topMaterial, topMaterial, sideMaterial, sideMaterial]
  }

  getTextureForFace(face: BlockFace): number {
    return face === 0 || face === 1 ? TextureId.BONE_BLOCK_TOP : TextureId.BONE_BLOCK_SIDE
  }

  getDrops(): IItem[] {
    return [new BoneBlockItem()]
  }
}
