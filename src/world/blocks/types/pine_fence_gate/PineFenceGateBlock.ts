import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { PineFenceGateBlockItem } from '../../../../items/blocks/pine_fence_gate/PineFenceGateBlockItem.ts'
import { fenceGateClosedGeometry } from '../fence_gate_shared/FenceGateGeometry.ts'

// Shared planks texture - lives in the pine planks block dir (which also
// registers it with the texture atlas)
import pinePlanksTexUrl from '../pine_planks/assets/pine-planks.webp'

const pinePlanksTexture = loadBlockTexture(pinePlanksTexUrl)

/** One planks material for the pine fence gate module (shared by closed + open). */
export const pineFenceGateMaterial = new THREE.MeshLambertMaterial({ map: pinePlanksTexture })

/**
 * Pine fence gate (closed) - two corner posts with three bars across.
 * E-key toggles to the open variant (wired via blockActionRegistry).
 */
export class PineFenceGateBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.PINE_FENCE_GATE,
    name: 'pine_fence_gate',
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
    return fenceGateClosedGeometry
  }

  protected getMaterials(): THREE.Material {
    return pineFenceGateMaterial
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getDrops(): IItem[] {
    return [new PineFenceGateBlockItem()]
  }
}
