import * as THREE from 'three'
import type { IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { CoastalFernBlockItem } from '../../../../items/blocks/coastal_fern/CoastalFernBlockItem.ts'
import { BlockIds } from '../../BlockIds.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { createTallFernCrossGeometry, TALL_FERN_CROSS_WIDTH } from '../coastal_fern/CoastalFernBlock.ts'
import coastalFernTopTexUrl from './assets/coastal-fern-top.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.COASTAL_FERN_TOP, coastalFernTopTexUrl, true)

const coastalFernTopTexture = loadBlockTexture(coastalFernTopTexUrl)

// Top half: starts exactly where the bottom half's planes end (cell boundary)
const crossGeometry = createTallFernCrossGeometry(-0.5, 0.5, TALL_FERN_CROSS_WIDTH)

const coastalFernTopMaterial = new THREE.MeshLambertMaterial({
  map: coastalFernTopTexture,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/**
 * Upper half of the tall coastal fern. Never exists without a
 * CoastalFernBlock below it; breaking it removes the base too.
 */
export class CoastalFernTopBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.COASTAL_FERN_TOP,
    name: 'coastal_fern_top',
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
    return TextureId.COASTAL_FERN_TOP
  }

  protected getGeometry(): THREE.BufferGeometry {
    return crossGeometry
  }

  protected getMaterials(): THREE.Material {
    return coastalFernTopMaterial
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0.1, 0, 0.1), new THREE.Vector3(0.9, 0.9, 0.9))
  }

  onBreak(world: IWorld, x: bigint, y: bigint, z: bigint): void {
    if (world.getBlock(x, y - 1n, z).properties.id === BlockIds.COASTAL_FERN) {
      world.setBlock(x, y - 1n, z, BlockIds.AIR)
    }
  }

  getDrops(): IItem[] {
    return [new CoastalFernBlockItem()]
  }
}
