import * as THREE from 'three'
import type { IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import type { IWorldCoordinate } from '../../../interfaces/ICoordinates.ts'
import type { IBlockEntity } from '../../../../entities/interfaces/IBlockEntity.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { HempBlockEntity } from './HempBlockEntity.ts'
import hemp2TexUrl from './assets/hemp-2.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.HEMP_2, hemp2TexUrl, true)

const hemp2Texture = loadBlockTexture(hemp2TexUrl)

/**
 * Create cross geometry for crop-style blocks.
 * @param yOffset Vertical offset to shift geometry (negative = lower)
 */
function createCropCrossGeometry(height: number = 1.0, width: number = 0.8, yOffset: number = 0): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()

  const w = width * 0.5
  const bottom = -0.5 + yOffset
  const top = bottom + height

  // Two intersecting diagonal planes (DoubleSide handles back faces)
  const vertices = new Float32Array([
    // First plane (diagonal from -X,-Z to +X,+Z)
    -w, bottom, -w,  w, bottom, w,  w, top, w,
    -w, bottom, -w,  w, top, w,  -w, top, -w,
    // Second plane (diagonal from -X,+Z to +X,-Z)
    -w, bottom, w,  w, bottom, -w,  w, top, -w,
    -w, bottom, w,  w, top, -w,  -w, top, w,
  ])

  // UV coordinates for texture mapping
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

// Stage 2: Growing plant (70% height, shifted down 0.1 to sit on ground)
const crossGeometry = createCropCrossGeometry(0.7, 0.8, -0.1)

const hemp2Material = new THREE.MeshLambertMaterial({
  map: hemp2Texture,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

export class Hemp2Block extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.HEMP_2,
    name: 'hemp_2',
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
    return TextureId.HEMP_2
  }

  protected getGeometry(): THREE.BufferGeometry {
    return crossGeometry
  }

  protected getMaterials(): THREE.Material {
    return hemp2Material
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  isGreedyMeshable(): boolean {
    return false
  }

  /**
   * Get the interaction box for raycasting.
   * Returns a centered box matching the growing plant's cross geometry (height=0.7, width=0.8, offset=-0.1).
   */
  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(
      new THREE.Vector3(0.1, -0.1, 0.1),
      new THREE.Vector3(0.9, 0.6, 0.9)
    )
  }

  createBlockEntity(position: IWorldCoordinate, world: IWorld): IBlockEntity {
    return new HempBlockEntity(position, world, BlockIds.HEMP_3)
  }
}
