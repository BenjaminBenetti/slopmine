import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { Hemp1BlockItem } from '../../../../items/blocks/hemp/Hemp1BlockItem.ts'
import { HempFiberItem } from '../../../../items/materials/hemp_fiber/HempFiberItem.ts'
import hemp3TexUrl from './assets/hemp-3.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.HEMP_3, hemp3TexUrl, true)

const hemp3Texture = loadBlockTexture(hemp3TexUrl)

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

// Stage 3: Full mature hemp (110% height - taller than wheat, shifted down 0.1 to sit on ground)
const crossGeometry = createCropCrossGeometry(1.1, 0.85, -0.1)

const hemp3Material = new THREE.MeshLambertMaterial({
  map: hemp3Texture,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

export class Hemp3Block extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.HEMP_3,
    name: 'hemp_3',
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
    return TextureId.HEMP_3
  }

  protected getGeometry(): THREE.BufferGeometry {
    return crossGeometry
  }

  protected getMaterials(): THREE.Material {
    return hemp3Material
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  isGreedyMeshable(): boolean {
    return false
  }

  /**
   * Get the interaction box for raycasting.
   * Returns a centered box matching the mature hemp's cross geometry (height=1.1, width=0.85, offset=-0.1).
   */
  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(
      new THREE.Vector3(0.075, -0.1, 0.075),
      new THREE.Vector3(0.925, 1.0, 0.925)
    )
  }

  // Mature hemp - no entity needed (static block)

  /**
   * Drop hemp seeds (1-3) and hemp fiber items (1-5) when broken.
   */
  getDrops(): IItem[] {
    const drops: IItem[] = []

    // Drop 1-3 hemp seeds (stage 1 blocks for replanting)
    const seedCount = 1 + Math.floor(Math.random() * 3)
    for (let i = 0; i < seedCount; i++) {
      drops.push(new Hemp1BlockItem())
    }

    // Drop 1-5 hemp fiber items
    const fiberCount = 1 + Math.floor(Math.random() * 5)
    for (let i = 0; i < fiberCount; i++) {
      drops.push(new HempFiberItem())
    }

    return drops
  }
}
