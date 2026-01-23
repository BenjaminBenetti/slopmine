import * as THREE from 'three'
import type { IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import type { IWorldCoordinate } from '../../../interfaces/ICoordinates.ts'
import type { IBlockEntity } from '../../../../entities/interfaces/IBlockEntity.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { WheatBlockEntity } from './WheatBlockEntity.ts'
import wheat1TexUrl from './assets/wheat-1.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.WHEAT_1, wheat1TexUrl, true)

const wheat1Texture = loadBlockTexture(wheat1TexUrl)

/**
 * Create cross geometry for crop-style blocks (like Minecraft wheat).
 * Two diagonal planes intersecting in the center, forming an X when viewed from above.
 * @param height Height of the plant (0.0 to 1.0, where 1.0 = full block)
 * @param width Width factor (0.0 to 1.0, where 1.0 = corner to corner)
 */
function createCropCrossGeometry(height: number = 1.0, width: number = 0.8): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()

  const w = width * 0.5 // Half-width from center
  const bottom = -0.5   // Bottom of block
  const top = bottom + height // Top based on height

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

// Stage 1: Short seedling (40% height)
const crossGeometry = createCropCrossGeometry(0.4, 0.7)

const wheat1Material = new THREE.MeshLambertMaterial({
  map: wheat1Texture,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

export class Wheat1Block extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.WHEAT_1,
    name: 'wheat_1',
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
    return TextureId.WHEAT_1
  }

  protected getGeometry(): THREE.BufferGeometry {
    return crossGeometry
  }

  protected getMaterials(): THREE.Material {
    return wheat1Material
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  isGreedyMeshable(): boolean {
    return false
  }

  /**
   * Get the interaction box for raycasting.
   * Returns a centered box matching the seedling's cross geometry (height=0.4, width=0.7).
   */
  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(
      new THREE.Vector3(0.15, 0, 0.15),
      new THREE.Vector3(0.85, 0.4, 0.85)
    )
  }

  createBlockEntity(position: IWorldCoordinate, world: IWorld): IBlockEntity {
    return new WheatBlockEntity(position, world, BlockIds.WHEAT_2)
  }
}
