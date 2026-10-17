import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { PrismPedestalBlockItem } from '../../../../items/blocks/prism_pedestal/PrismPedestalBlockItem.ts'
import { mergeByMaterial, part, sanctumCrystalMaterial, sanctumGoldMaterial, sanctumStoneMaterial, nonIndexed } from '../sanctum_shared/sanctumMaterials.ts'

// Cell spans y -0.5..0.5 (renderer adds +0.5). Stone base, shaft and cap with
// gold rings; a prism floats above the cap.
const crystal = new THREE.OctahedronGeometry(0.17)
crystal.scale(1, 1.7, 1)
crystal.translate(0, 0.42, 0)
const geometry = mergeByMaterial([
  [part(0.8, 0.14, 0.8, 0, -0.43, 0), part(0.46, 0.46, 0.46, 0, -0.13, 0), part(0.66, 0.12, 0.66, 0, 0.16, 0)],
  [part(0.84, 0.04, 0.84, 0, -0.34, 0), part(0.7, 0.04, 0.7, 0, 0.1, 0)],
  [nonIndexed(crystal)],
])
const materials = [sanctumStoneMaterial, sanctumGoldMaterial, sanctumCrystalMaterial]

/**
 * Prism pedestal - a polished stone pedestal with gold rings and a floating
 * glowing prism (light 9): the galleries, shrines and reliquaries of the
 * Prism Sanctum. Decor.
 */
export class PrismPedestalBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.PRISM_PEDESTAL,
    name: 'prism_pedestal',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 3.0,
    lightLevel: 9,
    lightBlocking: 0,
    demolitionForceRequired: 2,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.PRISM_PEDESTAL
  }

  protected getGeometry(): THREE.BufferGeometry {
    return geometry
  }

  protected getMaterials(): THREE.Material[] {
    return materials
  }

  shouldRenderFace(): boolean {
    return true
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getCollisionBox(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0.1, 0, 0.1), new THREE.Vector3(0.9, 0.72, 0.9))
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0.1, 0, 0.1), new THREE.Vector3(0.9, 1, 0.9))
  }

  getDrops(): IItem[] {
    return [new PrismPedestalBlockItem()]
  }
}
