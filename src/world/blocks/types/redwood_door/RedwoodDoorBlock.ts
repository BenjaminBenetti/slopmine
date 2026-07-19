import * as THREE from 'three'
import type { IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { RedwoodDoorBlockItem } from '../../../../items/blocks/redwood_door/RedwoodDoorBlockItem.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { doorClosedGeometry } from '../door_shared/DoorGeometry.ts'
import redwoodDoorLowerTexUrl from './assets/redwood-door-lower.webp'
import redwoodPlanksEdgeTexUrl from '../redwood_planks/assets/redwood-planks.webp'

// Register texture for atlas
registerTextureUrl(TextureId.REDWOOD_DOOR_LOWER, redwoodDoorLowerTexUrl)

const redwoodDoorLowerTexture = loadBlockTexture(redwoodDoorLowerTexUrl)
const redwoodDoorLowerMaterial = new THREE.MeshLambertMaterial({ map: redwoodDoorLowerTexture })

// Plain planks for the thin edge faces (door art on the edges reads as
// squished 'side windows')
const redwoodDoorEdgeTexture = loadBlockTexture(redwoodPlanksEdgeTexUrl)
const redwoodDoorEdgeMaterial = new THREE.MeshLambertMaterial({ map: redwoodDoorEdgeTexture })

/**
 * Redwood door - lower half, closed. This is the block the door item places.
 * Placing it spawns the upper half above (same facing metadata); breaking
 * either half removes the other. E-key toggles both halves open.
 */
export class RedwoodDoorBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.REDWOOD_DOOR,
    name: 'redwood_door',
    isOpaque: false,
    isSolid: true,
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
    return doorClosedGeometry
  }

  protected getMaterials(): THREE.Material[] {
    return [
      redwoodDoorEdgeMaterial, // +X edge
      redwoodDoorEdgeMaterial, // -X edge
      redwoodDoorEdgeMaterial, // +Y edge
      redwoodDoorEdgeMaterial, // -Y edge
      redwoodDoorLowerMaterial, // +Z front
      redwoodDoorLowerMaterial, // -Z back
    ]
  }

  isGreedyMeshable(): boolean {
    return false
  }

  canPlace(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    // Needs a free cell above for the upper half
    return world.getBlock(x, y + 1n, z).properties.id === BlockIds.AIR
  }

  onPlace(world: IWorld, x: bigint, y: bigint, z: bigint): void {
    const metadata = world.getMetadata?.(x, y, z) ?? 0
    world.setBlock(x, y + 1n, z, BlockIds.REDWOOD_DOOR_UPPER, metadata)
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
