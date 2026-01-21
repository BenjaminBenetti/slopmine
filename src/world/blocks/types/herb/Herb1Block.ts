import * as THREE from 'three'
import type { IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import type { IWorldCoordinate } from '../../../interfaces/ICoordinates.ts'
import type { IBlockEntity } from '../../../../entities/interfaces/IBlockEntity.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { HerbBlockEntity } from './HerbBlockEntity.ts'
import herb1TexUrl from './assets/herb-1.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.HERB_1, herb1TexUrl, true)

const herb1Texture = loadBlockTexture(herb1TexUrl)

/**
 * Create cross geometry with single-sided quads (material handles double-side rendering).
 * Two diagonal planes forming an X when viewed from above.
 */
function createCropCrossGeometry(height: number = 1.0, width: number = 0.8): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()

  const w = width * 0.5
  const bottom = -0.5
  const top = bottom + height

  // Only 2 quads (4 triangles total), no back faces needed
  const vertices = new Float32Array([
    // First plane (diagonal from -X,-Z to +X,+Z)
    -w, bottom, -w,  w, bottom, w,  w, top, w,
    -w, bottom, -w,  w, top, w,  -w, top, -w,
    // Second plane (diagonal from -X,+Z to +X,-Z)
    -w, bottom, w,  w, bottom, -w,  w, top, -w,
    -w, bottom, w,  w, top, -w,  -w, top, w,
  ])

  const uvs = new Float32Array([
    // First plane
    0, 0,  1, 0,  1, 1,
    0, 0,  1, 1,  0, 1,
    // Second plane
    0, 0,  1, 0,  1, 1,
    0, 0,  1, 1,  0, 1,
  ])

  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.computeVertexNormals()

  return geo
}

// Stage 1: Short seedling (40% height)
const crossGeometry = createCropCrossGeometry(0.4, 0.7)

const herb1Material = new THREE.MeshLambertMaterial({
  map: herb1Texture,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

export class Herb1Block extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.HERB_1,
    name: 'herb_1',
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
    return TextureId.HERB_1
  }

  protected getGeometry(): THREE.BufferGeometry {
    return crossGeometry
  }

  protected getMaterials(): THREE.Material {
    return herb1Material
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  isGreedyMeshable(): boolean {
    return false
  }

  createBlockEntity(position: IWorldCoordinate, world: IWorld): IBlockEntity {
    return new HerbBlockEntity(position, world, BlockIds.HERB_2)
  }
}
