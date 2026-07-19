import type * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { Block } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { PineFenceGateBlockItem } from '../../../../items/blocks/pine_fence_gate/PineFenceGateBlockItem.ts'
import { fenceGateOpenGeometry } from '../fence_gate_shared/FenceGateGeometry.ts'
import { pineFenceGateMaterial } from './PineFenceGateBlock.ts'

/**
 * Pine fence gate (open) - same posts, bars swung to the side.
 * Non-solid so entities can walk through. Drops the gate item.
 */
export class PineFenceGateOpenBlock extends Block {
  readonly properties: IBlockProperties = {
    id: BlockIds.PINE_FENCE_GATE_OPEN,
    name: 'pine_fence_gate_open',
    isOpaque: false,
    isSolid: false,
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
    return fenceGateOpenGeometry
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
