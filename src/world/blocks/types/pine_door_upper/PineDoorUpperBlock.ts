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
import pineDoorUpperTexUrl from './assets/pine-door-upper.webp'
import pinePlanksEdgeTexUrl from '../pine_planks/assets/pine-planks.webp'

// Register texture for atlas
registerTextureUrl(TextureId.PINE_DOOR_UPPER, pineDoorUpperTexUrl, true)

const pineDoorUpperTexture = loadBlockTexture(pineDoorUpperTexUrl)
const pineDoorUpperMaterial = new THREE.MeshLambertMaterial({
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
 * Pine door - upper half, closed. Never placed directly by the player;
 * spawned by PineDoorBlock.onPlace. Breaking it removes the lower half.
 */
export class PineDoorUpperBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.PINE_DOOR_UPPER,
    name: 'pine_door_upper',
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
    return TextureId.PINE_DOOR_UPPER
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
      pineDoorUpperMaterial, // +Z front
      pineDoorUpperMaterial, // -Z back
    ]
  }

  isGreedyMeshable(): boolean {
    return false
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
