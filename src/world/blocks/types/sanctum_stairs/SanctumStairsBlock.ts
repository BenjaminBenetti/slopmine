import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { polishedAbyssalStoneMaterial } from '../polished_abyssal_stone/PolishedAbyssalStoneBlock.ts'
import { SanctumStairsBlockItem } from '../../../../items/blocks/sanctum_stairs/SanctumStairsBlockItem.ts'

// Same shape as the wood stairs: a bottom slab plus the raised back half
// (ascending toward -Z in the canonical SOUTH-facing orientation).
const geometry = (() => {
  const bottom = new THREE.BoxGeometry(1, 0.5, 1).translate(0, -0.25, 0)
  const back = new THREE.BoxGeometry(1, 0.5, 0.5).translate(0, 0.25, -0.25)
  const merged = mergeGeometries([bottom, back], false)
  if (!merged) throw new Error('sanctum stairs: merge failed')
  return merged
})()

/**
 * Sanctum stairs - polished abyssal stone stairs of the Prism Sanctum's
 * processional and inner stairs. Dungeon structural block (force 6); drops
 * itself.
 */
export class SanctumStairsBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.SANCTUM_STAIRS,
    name: 'sanctum_stairs',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 60.0,
    lightLevel: 0,
    lightBlocking: 0,
    blocksVerticalLight: true,
    demolitionForceRequired: 6,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.POLISHED_ABYSSAL_STONE
  }

  protected getGeometry(): THREE.BufferGeometry {
    return geometry
  }

  protected getMaterials(): THREE.Material {
    return polishedAbyssalStoneMaterial
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getCollisionBox(): THREE.Box3 | null {
    return new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0.5, 1))
  }

  /** Stepped collision (bottom slab + raised back half) for auto step-up. */
  getCollisionBoxes(): THREE.Box3[] {
    return [
      new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0.5, 1)),
      new THREE.Box3(new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(1, 1, 0.5)),
    ]
  }

  supportsVerticalFlip(): boolean {
    return true
  }

  getDrops(): IItem[] {
    return [new SanctumStairsBlockItem()]
  }
}
