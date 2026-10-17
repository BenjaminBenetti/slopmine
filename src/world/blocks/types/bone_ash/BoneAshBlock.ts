import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { BoneAshBlockItem } from '../../../../items/blocks/bone_ash/BoneAshBlockItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import boneAshTexUrl from './assets/bone-ash.webp'

registerTextureUrl(TextureId.BONE_ASH, boneAshTexUrl)

const boneAshMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(boneAshTexUrl) })

/**
 * Bone ash - the pale powdery soil of the Ossuary: crushed bone and the ash
 * of countless pyres, heaped into dunes and drifts. Shovel material.
 */
export class BoneAshBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.BONE_ASH,
    name: 'bone_ash',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 0.6,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 0,
    tags: [BlockTags.SOIL],
  }

  protected get defaultTextureId(): number {
    return TextureId.BONE_ASH
  }

  protected getMaterials(): THREE.Material {
    return boneAshMaterial
  }

  getDrops(): IItem[] {
    return [new BoneAshBlockItem()]
  }
}
