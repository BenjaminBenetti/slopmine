import * as THREE from 'three'
import type { IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { OakDoorBlockItem } from '../../../../items/blocks/oak_door/OakDoorBlockItem.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { doorOpenGeometry } from '../door_shared/DoorGeometry.ts'
import oakDoorUpperTexUrl from '../oak_door_upper/assets/oak-door-upper.webp'
import oakPlanksEdgeTexUrl from '../oak_planks/assets/oak-planks.webp'

// Reuses the closed upper door texture (registered by OakDoorUpperBlock)
const oakDoorUpperTexture = loadBlockTexture(oakDoorUpperTexUrl)
const oakDoorUpperOpenMaterial = new THREE.MeshLambertMaterial({
  map: oakDoorUpperTexture,
  // Window panes are alpha-cutout - render see-through with crisp holes
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

// Plain planks for the thin edge faces (door art on the edges reads as
// squished 'side windows')
const oakDoorEdgeTexture = loadBlockTexture(oakPlanksEdgeTexUrl)
const oakDoorEdgeMaterial = new THREE.MeshLambertMaterial({ map: oakDoorEdgeTexture })

/**
 * Oak door - upper half, open. Non-solid. Breaking it removes the lower half.
 */
export class OakDoorUpperOpenBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.OAK_DOOR_UPPER_OPEN,
    name: 'oak_door_upper_open',
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
    return TextureId.OAK_DOOR_UPPER
  }

  protected getGeometry(): THREE.BufferGeometry {
    return doorOpenGeometry
  }

  protected getMaterials(): THREE.Material[] {
    return [
      oakDoorUpperOpenMaterial, // +X front
      oakDoorUpperOpenMaterial, // -X back
      oakDoorEdgeMaterial, // +Y edge
      oakDoorEdgeMaterial, // -Y edge
      oakDoorEdgeMaterial, // +Z edge
      oakDoorEdgeMaterial, // -Z edge
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
    if (belowId === BlockIds.OAK_DOOR || belowId === BlockIds.OAK_DOOR_OPEN) {
      world.setBlock(x, y - 1n, z, BlockIds.AIR)
    }
  }

  getDrops(): IItem[] {
    return [new OakDoorBlockItem()]
  }
}
