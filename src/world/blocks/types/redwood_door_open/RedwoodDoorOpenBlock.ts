import * as THREE from 'three'
import type { IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { RedwoodDoorBlockItem } from '../../../../items/blocks/redwood_door/RedwoodDoorBlockItem.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { doorOpenGeometry } from '../door_shared/DoorGeometry.ts'
import redwoodDoorLowerTexUrl from '../redwood_door/assets/redwood-door-lower.webp'
import redwoodPlanksEdgeTexUrl from '../redwood_planks/assets/redwood-planks.webp'

// Reuses the closed lower door texture (registered by RedwoodDoorBlock)
const redwoodDoorLowerTexture = loadBlockTexture(redwoodDoorLowerTexUrl)
const redwoodDoorOpenMaterial = new THREE.MeshLambertMaterial({ map: redwoodDoorLowerTexture })

// Plain planks for the thin edge faces (door art on the edges reads as
// squished 'side windows')
const redwoodDoorEdgeTexture = loadBlockTexture(redwoodPlanksEdgeTexUrl)
const redwoodDoorEdgeMaterial = new THREE.MeshLambertMaterial({ map: redwoodDoorEdgeTexture })

/**
 * Redwood door - lower half, open. Panel is swung along Z so the player can
 * walk through the cell (non-solid). Breaking it removes the upper half.
 */
export class RedwoodDoorOpenBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.REDWOOD_DOOR_OPEN,
    name: 'redwood_door_open',
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
    return TextureId.REDWOOD_DOOR_LOWER
  }

  protected getGeometry(): THREE.BufferGeometry {
    return doorOpenGeometry
  }

  protected getMaterials(): THREE.Material[] {
    return [
      redwoodDoorOpenMaterial, // +X front
      redwoodDoorOpenMaterial, // -X back
      redwoodDoorEdgeMaterial, // +Y edge
      redwoodDoorEdgeMaterial, // -Y edge
      redwoodDoorEdgeMaterial, // +Z edge
      redwoodDoorEdgeMaterial, // -Z edge
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
    if (aboveId === BlockIds.REDWOOD_DOOR_UPPER || aboveId === BlockIds.REDWOOD_DOOR_UPPER_OPEN) {
      world.setBlock(x, y + 1n, z, BlockIds.AIR)
    }
  }

  getDrops(): IItem[] {
    return [new RedwoodDoorBlockItem()]
  }
}
