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
import oakDoorLowerTexUrl from '../oak_door/assets/oak-door-lower.webp'
import oakPlanksEdgeTexUrl from '../oak_planks/assets/oak-planks.webp'

// Reuses the closed lower door texture (registered by OakDoorBlock)
const oakDoorLowerTexture = loadBlockTexture(oakDoorLowerTexUrl)
const oakDoorOpenMaterial = new THREE.MeshLambertMaterial({ map: oakDoorLowerTexture })

// Plain planks for the thin edge faces (door art on the edges reads as
// squished 'side windows')
const oakDoorEdgeTexture = loadBlockTexture(oakPlanksEdgeTexUrl)
const oakDoorEdgeMaterial = new THREE.MeshLambertMaterial({ map: oakDoorEdgeTexture })

/**
 * Oak door - lower half, open. Panel is swung along Z so the player can
 * walk through the cell (non-solid). Breaking it removes the upper half.
 */
export class OakDoorOpenBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.OAK_DOOR_OPEN,
    name: 'oak_door_open',
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
    return TextureId.OAK_DOOR_LOWER
  }

  protected getGeometry(): THREE.BufferGeometry {
    return doorOpenGeometry
  }

  protected getMaterials(): THREE.Material[] {
    return [
      oakDoorOpenMaterial, // +X front
      oakDoorOpenMaterial, // -X back
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
    const aboveId = world.getBlock(x, y + 1n, z).properties.id
    if (aboveId === BlockIds.OAK_DOOR_UPPER || aboveId === BlockIds.OAK_DOOR_UPPER_OPEN) {
      world.setBlock(x, y + 1n, z, BlockIds.AIR)
    }
  }

  getDrops(): IItem[] {
    return [new OakDoorBlockItem()]
  }
}
