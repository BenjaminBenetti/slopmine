import * as THREE from 'three'
import type { IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { PineDoorBlockItem } from '../../../../items/blocks/pine_door/PineDoorBlockItem.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { doorOpenGeometry } from '../door_shared/DoorGeometry.ts'
import pineDoorUpperTexUrl from '../pine_door_upper/assets/pine-door-upper.webp'
import pinePlanksEdgeTexUrl from '../pine_planks/assets/pine-planks.webp'

// Reuses the closed upper door texture (registered by PineDoorUpperBlock)
const pineDoorUpperTexture = loadBlockTexture(pineDoorUpperTexUrl)
const pineDoorUpperOpenMaterial = new THREE.MeshLambertMaterial({
  map: pineDoorUpperTexture,
  // Window panes are alpha-cutout - render see-through with crisp holes
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

// Plain planks for the thin edge faces (door art on the edges reads as
// squished 'side windows')
const pineDoorEdgeTexture = loadBlockTexture(pinePlanksEdgeTexUrl)
const pineDoorEdgeMaterial = new THREE.MeshLambertMaterial({ map: pineDoorEdgeTexture })

/**
 * Pine door - upper half, open. Non-solid. Breaking it removes the lower half.
 */
export class PineDoorUpperOpenBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.PINE_DOOR_UPPER_OPEN,
    name: 'pine_door_upper_open',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 2.0,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.PINE_DOOR_UPPER
  }

  protected getGeometry(): THREE.BufferGeometry {
    return doorOpenGeometry
  }

  protected getMaterials(): THREE.Material[] {
    return [
      pineDoorUpperOpenMaterial, // +X front
      pineDoorUpperOpenMaterial, // -X back
      pineDoorEdgeMaterial, // +Y edge
      pineDoorEdgeMaterial, // -Y edge
      pineDoorEdgeMaterial, // +Z edge
      pineDoorEdgeMaterial, // -Z edge
    ]
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1))
  }

  onBreak(world: IWorld, x: bigint, y: bigint, z: bigint): void {
    const belowId = world.getBlock(x, y - 1n, z).properties.id
    if (belowId === BlockIds.PINE_DOOR || belowId === BlockIds.PINE_DOOR_OPEN) {
      world.setBlock(x, y - 1n, z, BlockIds.AIR)
    }
  }

  getDrops(): IItem[] {
    return [new PineDoorBlockItem()]
  }
}
