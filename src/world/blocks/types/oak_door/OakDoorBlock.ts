import * as THREE from 'three'
import type { IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { OakDoorBlockItem } from '../../../../items/blocks/oak_door/OakDoorBlockItem.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { doorClosedGeometry } from '../door_shared/DoorGeometry.ts'
import oakDoorLowerTexUrl from './assets/oak-door-lower.webp'
import oakPlanksEdgeTexUrl from '../oak_planks/assets/oak-planks.webp'

// Register texture for atlas
registerTextureUrl(TextureId.OAK_DOOR_LOWER, oakDoorLowerTexUrl)

const oakDoorLowerTexture = loadBlockTexture(oakDoorLowerTexUrl)
const oakDoorLowerMaterial = new THREE.MeshLambertMaterial({ map: oakDoorLowerTexture })

// Plain planks for the thin edge faces (door art on the edges reads as
// squished 'side windows')
const oakDoorEdgeTexture = loadBlockTexture(oakPlanksEdgeTexUrl)
const oakDoorEdgeMaterial = new THREE.MeshLambertMaterial({ map: oakDoorEdgeTexture })

/**
 * Oak door - lower half, closed. This is the block the door item places.
 * Placing it spawns the upper half above (same facing metadata); breaking
 * either half removes the other. E-key toggles both halves open.
 */
export class OakDoorBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.OAK_DOOR,
    name: 'oak_door',
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
    return TextureId.OAK_DOOR_LOWER
  }

  protected getGeometry(): THREE.BufferGeometry {
    return doorClosedGeometry
  }

  protected getMaterials(): THREE.Material[] {
    return [
      oakDoorEdgeMaterial, // +X edge
      oakDoorEdgeMaterial, // -X edge
      oakDoorEdgeMaterial, // +Y edge
      oakDoorEdgeMaterial, // -Y edge
      oakDoorLowerMaterial, // +Z front
      oakDoorLowerMaterial, // -Z back
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
    world.setBlock(x, y + 1n, z, BlockIds.OAK_DOOR_UPPER, metadata)
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
