import * as THREE from 'three'
import type { IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { CoastalFernBlockItem } from '../../../../items/blocks/coastal_fern/CoastalFernBlockItem.ts'
import { BlockIds } from '../../BlockIds.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import coastalFernTexUrl from './assets/coastal-fern.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.COASTAL_FERN, coastalFernTexUrl, true)

const coastalFernTexture = loadBlockTexture(coastalFernTexUrl)

/**
 * Cross geometry for the lower half of the tall fern. Same construction as
 * JungleFernBlock, but full block height. The plane width MUST match
 * CoastalFernTopBlock's so the two halves form continuous planes.
 */
function createTallFernCrossGeometry(bottom: number, top: number, width: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  const w = width * 0.5

  const vertices = new Float32Array([
    // First plane (diagonal from -X,-Z to +X,+Z)
    -w, bottom, -w,  w, bottom, w,  w, top, w,
    -w, bottom, -w,  w, top, w,  -w, top, -w,
    // Second plane (diagonal from -X,+Z to +X,-Z)
    -w, bottom, w,  w, bottom, -w,  w, top, -w,
    -w, bottom, w,  w, top, -w,  -w, top, w,
  ])

  const uvs = new Float32Array([
    0, 0,  1, 0,  1, 1,
    0, 0,  1, 1,  0, 1,
    0, 0,  1, 0,  1, 1,
    0, 0,  1, 1,  0, 1,
  ])

  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.computeVertexNormals()

  return geo
}

export const TALL_FERN_CROSS_WIDTH = 1.15

// Bottom half: dips slightly below the cell to compensate for texture padding
const crossGeometry = createTallFernCrossGeometry(-0.55, 0.5, TALL_FERN_CROSS_WIDTH)

const coastalFernMaterial = new THREE.MeshLambertMaterial({
  map: coastalFernTexture,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

export { createTallFernCrossGeometry }

/**
 * Lower half of the tall coastal fern - a two-block plant the player can
 * walk through. Placing it spawns the top half above; breaking either half
 * removes the other.
 */
export class CoastalFernBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.COASTAL_FERN,
    name: 'coastal_fern',
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
    return TextureId.COASTAL_FERN
  }

  protected getGeometry(): THREE.BufferGeometry {
    return crossGeometry
  }

  protected getMaterials(): THREE.Material {
    return coastalFernMaterial
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0.1, 0, 0.1), new THREE.Vector3(0.9, 1.0, 0.9))
  }

  canPlace(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    // Needs a free cell above for the top half
    return world.getBlock(x, y + 1n, z).properties.id === BlockIds.AIR
  }

  onPlace(world: IWorld, x: bigint, y: bigint, z: bigint): void {
    world.setBlock(x, y + 1n, z, BlockIds.COASTAL_FERN_TOP)
  }

  onBreak(world: IWorld, x: bigint, y: bigint, z: bigint): void {
    if (world.getBlock(x, y + 1n, z).properties.id === BlockIds.COASTAL_FERN_TOP) {
      world.setBlock(x, y + 1n, z, BlockIds.AIR)
    }
  }

  getDrops(): IItem[] {
    return [new CoastalFernBlockItem()]
  }
}
