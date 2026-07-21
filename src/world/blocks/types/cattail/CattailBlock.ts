import * as THREE from 'three'
import type { IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { CattailBlockItem } from '../../../../items/blocks/cattail/CattailBlockItem.ts'
import { BlockIds } from '../../BlockIds.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { cattailCrossGeometry } from './CattailGeometry.ts'
import cattailBottomTexUrl from './assets/cattail-bottom.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.CATTAIL, cattailBottomTexUrl, true)

const cattailBottomTexture = loadBlockTexture(cattailBottomTexUrl)

const cattailBottomMaterial = new THREE.MeshLambertMaterial({
  map: cattailBottomTexture,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/**
 * Cattail reed plant that grows along the water's edge - lower half (stems
 * and the base of the seed heads). Placing it spawns the upper half above;
 * breaking either half removes the other.
 */
export class CattailBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CATTAIL,
    name: 'cattail',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0.0,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.CATTAIL
  }

  protected getGeometry(): THREE.BufferGeometry {
    return cattailCrossGeometry
  }

  protected getMaterials(): THREE.Material {
    return cattailBottomMaterial
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  isGreedyMeshable(): boolean {
    return false
  }

  /**
   * Get the interaction box for raycasting.
   * Full-block cross section matching the reed cluster.
   */
  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(
      new THREE.Vector3(0.075, 0, 0.075),
      new THREE.Vector3(0.925, 1.0, 0.925)
    )
  }

  canPlace(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    // Needs a free cell above for the upper half
    return world.getBlock(x, y + 1n, z).properties.id === BlockIds.AIR
  }

  onPlace(world: IWorld, x: bigint, y: bigint, z: bigint): void {
    world.setBlock(x, y + 1n, z, BlockIds.CATTAIL_TOP)
  }

  onBreak(world: IWorld, x: bigint, y: bigint, z: bigint): void {
    if (world.getBlock(x, y + 1n, z).properties.id === BlockIds.CATTAIL_TOP) {
      world.setBlock(x, y + 1n, z, BlockIds.AIR)
    }
  }

  getDrops(): IItem[] {
    return [new CattailBlockItem()]
  }
}
