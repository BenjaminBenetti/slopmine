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
import redwoodDoorUpperTexUrl from '../redwood_door_upper/assets/redwood-door-upper.webp'
import redwoodPlanksEdgeTexUrl from '../redwood_planks/assets/redwood-planks.webp'

// Reuses the closed upper door texture (registered by RedwoodDoorUpperBlock)
const redwoodDoorUpperTexture = loadBlockTexture(redwoodDoorUpperTexUrl)
const redwoodDoorUpperOpenMaterial = new THREE.MeshLambertMaterial({
  map: redwoodDoorUpperTexture,
  // Window panes are alpha-cutout - render see-through with crisp holes
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

// Plain planks for the thin edge faces (door art on the edges reads as
// squished 'side windows')
const redwoodDoorEdgeTexture = loadBlockTexture(redwoodPlanksEdgeTexUrl)
const redwoodDoorEdgeMaterial = new THREE.MeshLambertMaterial({ map: redwoodDoorEdgeTexture })

/**
 * Redwood door - upper half, open. Non-solid. Breaking it removes the lower half.
 */
export class RedwoodDoorUpperOpenBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.REDWOOD_DOOR_UPPER_OPEN,
    name: 'redwood_door_upper_open',
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
    return TextureId.REDWOOD_DOOR_UPPER
  }

  protected getGeometry(): THREE.BufferGeometry {
    return doorOpenGeometry
  }

  protected getMaterials(): THREE.Material[] {
    return [
      redwoodDoorUpperOpenMaterial, // +X front
      redwoodDoorUpperOpenMaterial, // -X back
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
    const belowId = world.getBlock(x, y - 1n, z).properties.id
    if (belowId === BlockIds.REDWOOD_DOOR || belowId === BlockIds.REDWOOD_DOOR_OPEN) {
      world.setBlock(x, y - 1n, z, BlockIds.AIR)
    }
  }

  getDrops(): IItem[] {
    return [new RedwoodDoorBlockItem()]
  }
}
