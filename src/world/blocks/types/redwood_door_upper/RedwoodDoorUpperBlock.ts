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
import redwoodDoorUpperTexUrl from './assets/redwood-door-upper.webp'
import redwoodPlanksEdgeTexUrl from '../redwood_planks/assets/redwood-planks.webp'

// Register texture for atlas
registerTextureUrl(TextureId.REDWOOD_DOOR_UPPER, redwoodDoorUpperTexUrl, true)

const redwoodDoorUpperTexture = loadBlockTexture(redwoodDoorUpperTexUrl)
const redwoodDoorUpperMaterial = new THREE.MeshLambertMaterial({
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
 * Redwood door - upper half, closed. Never placed directly by the player;
 * spawned by RedwoodDoorBlock.onPlace. Breaking it removes the lower half.
 */
export class RedwoodDoorUpperBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.REDWOOD_DOOR_UPPER,
    name: 'redwood_door_upper',
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
    return TextureId.REDWOOD_DOOR_UPPER
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
      redwoodDoorUpperMaterial, // +Z front
      redwoodDoorUpperMaterial, // -Z back
    ]
  }

  isGreedyMeshable(): boolean {
    return false
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
