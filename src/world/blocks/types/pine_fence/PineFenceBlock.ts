import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { PineFenceBlockItem } from '../../../../items/blocks/pine_fence/PineFenceBlockItem.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { fenceGeometry } from '../oak_fence/OakFenceBlock.ts'

// Fence blocks reuse their wood's planks texture (shared asset lives in the planks block dir)
import pinePlanksTexUrl from '../pine_planks/assets/pine-planks.webp'

// Load texture and create the module-level material for pine fence
const pinePlanksTexture = loadBlockTexture(pinePlanksTexUrl)
const pineFenceMaterial = new THREE.MeshLambertMaterial({ map: pinePlanksTexture })

/**
 * Pine fence - decorative post-and-rail barrier built from pine planks.
 */
export class PineFenceBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.PINE_FENCE,
    name: 'pine_fence',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 1.5,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.PINE_PLANKS
  }

  protected getGeometry(): THREE.BufferGeometry {
    return fenceGeometry
  }

  protected getMaterials(): THREE.Material {
    return pineFenceMaterial
  }

  getDrops(): IItem[] {
    return [new PineFenceBlockItem()]
  }

  isGreedyMeshable(): boolean {
    return false
  }
}
