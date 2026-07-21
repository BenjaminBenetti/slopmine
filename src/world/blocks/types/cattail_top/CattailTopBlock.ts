import * as THREE from 'three'
import type { IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { CattailBlockItem } from '../../../../items/blocks/cattail/CattailBlockItem.ts'
import { BlockIds } from '../../BlockIds.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { cattailCrossGeometry } from '../cattail/CattailGeometry.ts'
import cattailTopTexUrl from './assets/cattail-top.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.CATTAIL_TOP, cattailTopTexUrl, true)

const cattailTopTexture = loadBlockTexture(cattailTopTexUrl)

const cattailTopMaterial = new THREE.MeshLambertMaterial({
  map: cattailTopTexture,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/**
 * Cattail reed plant - upper half (seed heads and stem tips). Never placed
 * directly by the player; spawned by CattailBlock.onPlace. Breaking it
 * removes the lower half.
 */
export class CattailTopBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CATTAIL_TOP,
    name: 'cattail_top',
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
    return TextureId.CATTAIL_TOP
  }

  protected getGeometry(): THREE.BufferGeometry {
    return cattailCrossGeometry
  }

  protected getMaterials(): THREE.Material {
    return cattailTopMaterial
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

  onBreak(world: IWorld, x: bigint, y: bigint, z: bigint): void {
    if (world.getBlock(x, y - 1n, z).properties.id === BlockIds.CATTAIL) {
      world.setBlock(x, y - 1n, z, BlockIds.AIR)
    }
  }

  getDrops(): IItem[] {
    return [new CattailBlockItem()]
  }
}
