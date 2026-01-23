import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { HerbItem } from '../../../../items/materials/herb/HerbItem.ts'
import { Herb1BlockItem } from '../../../../items/blocks/herb/Herb1BlockItem.ts'
import herb3TexUrl from './assets/herb-3.webp'

// Register texture for atlas (transparent)
registerTextureUrl(TextureId.HERB_3, herb3TexUrl, true)

const herb3Texture = loadBlockTexture(herb3TexUrl)

/**
 * Create cross geometry with single-sided quads (material handles double-side rendering).
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

// Stage 3: Full mature herb (100% height)
const crossGeometry = createCropCrossGeometry(1.0, 0.85)

const herb3Material = new THREE.MeshLambertMaterial({
  map: herb3Texture,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

export class Herb3Block extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.HERB_3,
    name: 'herb_3',
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
    return TextureId.HERB_3
  }

  protected getGeometry(): THREE.BufferGeometry {
    return crossGeometry
  }

  protected getMaterials(): THREE.Material {
    return herb3Material
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  isGreedyMeshable(): boolean {
    return false
  }

  /**
   * Get the interaction box for raycasting.
   * Returns a centered box matching the mature herb's cross geometry (height=1.0, width=0.85).
   */
  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(
      new THREE.Vector3(0.075, 0, 0.075),
      new THREE.Vector3(0.925, 1.0, 0.925)
    )
  }

  // Mature herb - no entity needed (static block)

  /**
   * Drop herb seeds (1-3) and herb items (1-2) when broken.
   */
  getDrops(): IItem[] {
    const drops: IItem[] = []

    // Drop 1-3 herb seeds (stage 1 blocks for replanting)
    const seedCount = 1 + Math.floor(Math.random() * 3)
    for (let i = 0; i < seedCount; i++) {
      drops.push(new Herb1BlockItem())
    }

    // Drop 1-2 herb items
    const herbCount = 1 + Math.floor(Math.random() * 2)
    for (let i = 0; i < herbCount; i++) {
      drops.push(new HerbItem())
    }

    return drops
  }
}
