import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { OakFenceBlockItem } from '../../../../items/blocks/oak_fence/OakFenceBlockItem.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'

// Fence blocks reuse their wood's planks texture (shared asset lives in the planks block dir)
import oakPlanksTexUrl from '../oak_planks/assets/oak-planks.webp'

// Load texture and create the module-level material for oak fence
const oakPlanksTexture = loadBlockTexture(oakPlanksTexUrl)
const oakFenceMaterial = new THREE.MeshLambertMaterial({ map: oakPlanksTexture })

// Fence dimensions
const POST_SIZE = 0.25            // Center post thickness (X/Z)
const RAIL_HEIGHT = 0.15          // Rail thickness (Y)
const RAIL_DEPTH = 0.15           // Rail thickness (Z)
const TOP_RAIL_Y = 0.25           // Top rail center (local Y, geometry centered around 0)
const BOTTOM_RAIL_Y = -0.15       // Bottom rail center

/**
 * Shared fence geometry: full-height center post + two horizontal rails
 * spanning the full block width along X. Centered around Y=0 since the
 * renderer adds +0.5. Reused by all wood fence variants.
 */
export const fenceGeometry = (() => {
  const geometries: THREE.BufferGeometry[] = []

  // Center post - full block height
  const post = new THREE.BoxGeometry(POST_SIZE, 1, POST_SIZE)
  geometries.push(post)

  // Top rail - full width along X, thin
  const topRail = new THREE.BoxGeometry(1, RAIL_HEIGHT, RAIL_DEPTH)
  topRail.translate(0, TOP_RAIL_Y, 0)
  geometries.push(topRail)

  // Bottom rail - full width along X, thin
  const bottomRail = new THREE.BoxGeometry(1, RAIL_HEIGHT, RAIL_DEPTH)
  bottomRail.translate(0, BOTTOM_RAIL_Y, 0)
  geometries.push(bottomRail)

  return mergeGeometries(geometries, false)
})()

/**
 * Oak fence - decorative post-and-rail barrier built from oak planks.
 */
export class OakFenceBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.OAK_FENCE,
    name: 'oak_fence',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 1.5,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.OAK_PLANKS
  }

  protected getGeometry(): THREE.BufferGeometry {
    return fenceGeometry
  }

  protected getMaterials(): THREE.Material {
    return oakFenceMaterial
  }

  getDrops(): IItem[] {
    return [new OakFenceBlockItem()]
  }

  isGreedyMeshable(): boolean {
    return false
  }
}
