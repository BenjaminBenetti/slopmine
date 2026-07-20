import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { StickItem } from '../../../../items/materials/stick/StickItem.ts'

import campfireTexUrl from './assets/campfire.webp'

// Register the atlas texture (placeholder: warm magma-style tile; see manifest)
registerTextureUrl(TextureId.CAMPFIRE, campfireTexUrl)

/** Total visual height of the campfire (a low fire pit, walk-through). */
const CAMPFIRE_HEIGHT = 0.3

// ---------------------------------------------------------------------------
// Geometry: a ring of stones around two crossed charred logs with a glowing
// ember bed in the middle. All boxes sit on the cell floor (y = -0.5), same
// slab convention as PineStumpBlock. Material groups (torch pattern):
//   0 = stones, 1 = charred logs, 2 = embers (emissive)
// ---------------------------------------------------------------------------

const FLOOR_Y = -0.5

function makeStone(x: number, z: number, size: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(size, size, size)
  geo.translate(x, FLOOR_Y + size / 2, z)
  geo.groups.forEach((group) => {
    group.materialIndex = 0
  })
  return geo
}

function makeLog(rotationY: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(0.55, 0.12, 0.16)
  geo.rotateY(rotationY)
  geo.translate(0, FLOOR_Y + 0.1, 0)
  geo.groups.forEach((group) => {
    group.materialIndex = 1
  })
  return geo
}

const stoneRing: THREE.BufferGeometry[] = [
  // Cardinal stones (slightly larger)
  makeStone(0.36, 0, 0.22),
  makeStone(-0.36, 0, 0.22),
  makeStone(0, 0.36, 0.22),
  makeStone(0, -0.36, 0.22),
  // Diagonal stones (slightly smaller)
  makeStone(0.29, 0.29, 0.18),
  makeStone(0.29, -0.29, 0.18),
  makeStone(-0.29, 0.29, 0.18),
  makeStone(-0.29, -0.29, 0.18),
]

const crossedLogs: THREE.BufferGeometry[] = [
  makeLog(Math.PI / 4),
  makeLog(-Math.PI / 4),
]

const emberGeometry = new THREE.BoxGeometry(0.34, 0.12, 0.34)
emberGeometry.translate(0, FLOOR_Y + 0.09, 0)
emberGeometry.groups.forEach((group) => {
  group.materialIndex = 2
})

const campfireGeometry = mergeGeometries(
  [...stoneRing, ...crossedLogs, emberGeometry],
  true
)

const stoneMaterial = new THREE.MeshLambertMaterial({ color: 0x7d7d7d }) // Weathered stone
const charredLogMaterial = new THREE.MeshLambertMaterial({ color: 0x3a2a1a }) // Charred wood
const emberMaterial = new THREE.MeshBasicMaterial({ color: 0xff7722 }) // Glowing embers

const campfireMaterials = [stoneMaterial, charredLogMaterial, emberMaterial]

/**
 * Campfire - a low ring of stones with glowing embers. Strong light source
 * (level 13, between torch 11 and resin torch 15). No collision: players can
 * walk through (over) it. Placed by worldgen at hunters' camps in the pine
 * forest.
 */
export class CampfireBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CAMPFIRE,
    name: 'campfire',
    isOpaque: false,
    isSolid: false, // No collision - walk-through like torch
    isLiquid: false,
    hardness: 0.5,
    lightLevel: 13, // Brighter than a torch (11), dimmer than resin torch (15)
    lightBlocking: 0, // Doesn't block light
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.CAMPFIRE
  }

  protected getGeometry(): THREE.BufferGeometry {
    return campfireGeometry
  }

  protected getMaterials(): THREE.Material[] {
    return campfireMaterials
  }

  getCollisionBox(): THREE.Box3 | null {
    // No collision - players can walk through campfires
    return null
  }

  shouldRenderFace(_face: BlockFace): boolean {
    // Always render (small non-cube shape)
    return true
  }

  isGreedyMeshable(): boolean {
    // Custom geometry - cannot be greedy-meshed
    return false
  }

  /**
   * Get the interaction box for raycasting: a low, wide box matching the
   * stone ring footprint.
   */
  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(
      new THREE.Vector3(0.05, 0, 0.05),
      new THREE.Vector3(0.95, CAMPFIRE_HEIGHT, 0.95)
    )
  }

  getDrops(): IItem[] {
    // The stones scatter; a couple of usable sticks survive
    return [new StickItem(), new StickItem()]
  }
}
