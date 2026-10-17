import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { GlacialBrickStairsBlockItem } from '../../../../items/blocks/glacial_brick_stairs/GlacialBrickStairsBlockItem.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'

// Reuse the glacial brick texture (registered by the glacial brick block module)
import glacialBrickTexUrl from '../glacial_brick/assets/glacial-brick.webp'

const glacialBrickTexture = loadBlockTexture(glacialBrickTexUrl)
const stairsMaterial = new THREE.MeshLambertMaterial({ map: glacialBrickTexture })

// Geometry centered around Y=0 (renderer adds +0.5).
// Step ascends toward -Z; front (+Z) is the low side.
const stairsGeometry = (() => {
  // Full-width bottom slab (y -0.5..0)
  const bottomSlab = new THREE.BoxGeometry(1, 0.5, 1)
  bottomSlab.translate(0, -0.25, 0)

  // Back-top box (y 0..0.5, z -0.5..0)
  const backTop = new THREE.BoxGeometry(1, 0.5, 0.5)
  backTop.translate(0, 0.25, -0.25)

  return mergeGeometries([bottomSlab, backTop], false)
})()

/**
 * Glacial brick stairs - the Frozen Citadel's stairways (oak stairs shape:
 * two merged boxes, a step ascending toward -Z when facing SOUTH; facing and
 * the upside-down flip come from metadata). Dungeon structural (force 6).
 */
export class GlacialBrickStairsBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.GLACIAL_BRICK_STAIRS,
    name: 'glacial_brick_stairs',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 60,
    lightLevel: 0,
    lightBlocking: 0,
    blocksVerticalLight: true,
    demolitionForceRequired: 6,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.GLACIAL_BRICK
  }

  protected getGeometry(): THREE.BufferGeometry {
    return stairsGeometry
  }

  protected getMaterials(): THREE.Material {
    return stairsMaterial
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getCollisionBox(): THREE.Box3 | null {
    // v1 approximation: slab-height collision, upper step is visual-only
    return new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0.5, 1)
    )
  }



  /**
   * True stepped collision: bottom slab plus the raised back half, so
   * auto step-up can climb staircases one half-step at a time.
   * Canonical orientation (facing SOUTH): step ascends toward -Z (back).
   */
  getCollisionBoxes(): THREE.Box3[] {
    return [
      new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0.5, 1)),
      new THREE.Box3(new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(1, 1, 0.5)),
    ]
  }
  /**
   * Placement can flip this block upside down (metadata bit 4).
   */
  supportsVerticalFlip(): boolean {
    return true
  }
  getDrops(): IItem[] {
    return [new GlacialBrickStairsBlockItem()]
  }
}
