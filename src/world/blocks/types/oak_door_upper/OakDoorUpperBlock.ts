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
import oakDoorUpperTexUrl from './assets/oak-door-upper.webp'
import oakPlanksEdgeTexUrl from '../oak_planks/assets/oak-planks.webp'

// Register texture for atlas
registerTextureUrl(TextureId.OAK_DOOR_UPPER, oakDoorUpperTexUrl, true)

const oakDoorUpperTexture = loadBlockTexture(oakDoorUpperTexUrl)
const oakDoorUpperMaterial = new THREE.MeshLambertMaterial({
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
 * Oak door - upper half, closed. Never placed directly by the player;
 * spawned by OakDoorBlock.onPlace. Breaking it removes the lower half.
 */
export class OakDoorUpperBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.OAK_DOOR_UPPER,
    name: 'oak_door_upper',
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
    return TextureId.OAK_DOOR_UPPER
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
      oakDoorUpperMaterial, // +Z front
      oakDoorUpperMaterial, // -Z back
    ]
  }

  isGreedyMeshable(): boolean {
    return false
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
