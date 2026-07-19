import * as THREE from 'three'
import type { IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { PineDoorBlockItem } from '../../../../items/blocks/pine_door/PineDoorBlockItem.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { doorClosedGeometry } from '../door_shared/DoorGeometry.ts'
import pineDoorLowerTexUrl from './assets/pine-door-lower.webp'
import pinePlanksEdgeTexUrl from '../pine_planks/assets/pine-planks.webp'

// Register texture for atlas
registerTextureUrl(TextureId.PINE_DOOR_LOWER, pineDoorLowerTexUrl)

const pineDoorLowerTexture = loadBlockTexture(pineDoorLowerTexUrl)
const pineDoorLowerMaterial = new THREE.MeshLambertMaterial({ map: pineDoorLowerTexture })

// Plain planks for the thin edge faces (door art on the edges reads as
// squished 'side windows')
const pineDoorEdgeTexture = loadBlockTexture(pinePlanksEdgeTexUrl)
const pineDoorEdgeMaterial = new THREE.MeshLambertMaterial({ map: pineDoorEdgeTexture })

/**
 * Pine door - lower half, closed. This is the block the door item places.
 * Placing it spawns the upper half above (same facing metadata); breaking
 * either half removes the other. E-key toggles both halves open.
 */
export class PineDoorBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.PINE_DOOR,
    name: 'pine_door',
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
    return TextureId.PINE_DOOR_LOWER
  }

  protected getGeometry(): THREE.BufferGeometry {
    return doorClosedGeometry
  }

  protected getMaterials(): THREE.Material[] {
    return [
      pineDoorEdgeMaterial, // +X edge
      pineDoorEdgeMaterial, // -X edge
      pineDoorEdgeMaterial, // +Y edge
      pineDoorEdgeMaterial, // -Y edge
      pineDoorLowerMaterial, // +Z front
      pineDoorLowerMaterial, // -Z back
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
    world.setBlock(x, y + 1n, z, BlockIds.PINE_DOOR_UPPER, metadata)
  }

  onBreak(world: IWorld, x: bigint, y: bigint, z: bigint): void {
    const aboveId = world.getBlock(x, y + 1n, z).properties.id
    if (aboveId === BlockIds.PINE_DOOR_UPPER || aboveId === BlockIds.PINE_DOOR_UPPER_OPEN) {
      world.setBlock(x, y + 1n, z, BlockIds.AIR)
    }
  }

  getDrops(): IItem[] {
    return [new PineDoorBlockItem()]
  }
}
