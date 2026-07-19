import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { RedwoodFenceGateBlockItem } from '../../../../items/blocks/redwood_fence_gate/RedwoodFenceGateBlockItem.ts'
import { fenceGateClosedGeometry } from '../fence_gate_shared/FenceGateGeometry.ts'

// Shared planks texture - lives in the redwood planks block dir (which also
// registers it with the texture atlas)
import redwoodPlanksTexUrl from '../redwood_planks/assets/redwood-planks.webp'

const redwoodPlanksTexture = loadBlockTexture(redwoodPlanksTexUrl)

/** One planks material for the redwood fence gate module (shared by closed + open). */
export const redwoodFenceGateMaterial = new THREE.MeshLambertMaterial({ map: redwoodPlanksTexture })

/**
 * Redwood fence gate (closed) - two corner posts with three bars across.
 * E-key toggles to the open variant (wired via blockActionRegistry).
 */
export class RedwoodFenceGateBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.REDWOOD_FENCE_GATE,
    name: 'redwood_fence_gate',
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
    return TextureId.REDWOOD_PLANKS
  }

  protected getGeometry(): THREE.BufferGeometry {
    return fenceGateClosedGeometry
  }

  protected getMaterials(): THREE.Material {
    return redwoodFenceGateMaterial
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getDrops(): IItem[] {
    return [new RedwoodFenceGateBlockItem()]
  }
}
