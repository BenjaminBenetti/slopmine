import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { Wheat1BlockItem } from '../../../../items/blocks/wheat/Wheat1BlockItem.ts'
import { WheatItem } from '../../../../items/food/wheat/WheatItem.ts'
import wheat3TexUrl from './assets/wheat-3.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.WHEAT_3, wheat3TexUrl, true)

const wheat3Texture = loadBlockTexture(wheat3TexUrl)

/**
 * Create cross geometry for crop-style blocks.
 */
function createCropCrossGeometry(height: number = 1.0, width: number = 0.8): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()

  const w = width * 0.5
  const bottom = -0.5
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

// Stage 3: Full mature wheat (100% height)
const crossGeometry = createCropCrossGeometry(1.0, 0.85)

const wheat3Material = new THREE.MeshLambertMaterial({
  map: wheat3Texture,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

export class Wheat3Block extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.WHEAT_3,
    name: 'wheat_3',
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
    return TextureId.WHEAT_3
  }

  protected getGeometry(): THREE.BufferGeometry {
    return crossGeometry
  }

  protected getMaterials(): THREE.Material {
    return wheat3Material
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  isGreedyMeshable(): boolean {
    return false
  }

  /**
   * Get the interaction box for raycasting.
   * Returns a centered box matching the mature wheat's cross geometry (height=1.0, width=0.85).
   */
  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(
      new THREE.Vector3(0.075, 0, 0.075),
      new THREE.Vector3(0.925, 1.0, 0.925)
    )
  }

  // Mature wheat - no entity needed (static block)

  /**
   * Drop wheat seeds (1-3) and wheat items (1-5) when broken.
   */
  getDrops(): IItem[] {
    const drops: IItem[] = []

    // Drop 1-3 wheat seeds (stage 1 blocks for replanting)
    const seedCount = 1 + Math.floor(Math.random() * 3)
    for (let i = 0; i < seedCount; i++) {
      drops.push(new Wheat1BlockItem())
    }

    // Drop 1-5 wheat items
    const wheatCount = 1 + Math.floor(Math.random() * 5)
    for (let i = 0; i < wheatCount; i++) {
      drops.push(new WheatItem())
    }

    return drops
  }
}
