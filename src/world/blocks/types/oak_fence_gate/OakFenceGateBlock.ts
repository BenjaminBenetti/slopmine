import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { OakFenceGateBlockItem } from '../../../../items/blocks/oak_fence_gate/OakFenceGateBlockItem.ts'
import { fenceGateClosedGeometry } from '../fence_gate_shared/FenceGateGeometry.ts'

// Shared planks texture - lives in the oak planks block dir (which also
// registers it with the texture atlas)
import oakPlanksTexUrl from '../oak_planks/assets/oak-planks.webp'

const oakPlanksTexture = loadBlockTexture(oakPlanksTexUrl)

/** One planks material for the oak fence gate module (shared by closed + open). */
export const oakFenceGateMaterial = new THREE.MeshLambertMaterial({ map: oakPlanksTexture })

/**
 * Oak fence gate (closed) - two corner posts with three bars across.
 * E-key toggles to the open variant (wired via blockActionRegistry).
 */
export class OakFenceGateBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.OAK_FENCE_GATE,
    name: 'oak_fence_gate',
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
    return TextureId.OAK_PLANKS
  }

  protected getGeometry(): THREE.BufferGeometry {
    return fenceGateClosedGeometry
  }

  protected getMaterials(): THREE.Material {
    return oakFenceGateMaterial
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getDrops(): IItem[] {
    return [new OakFenceGateBlockItem()]
  }
}
