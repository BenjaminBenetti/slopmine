import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { FrostCrystalBlockItem } from '../../../../items/blocks/frost_crystal/FrostCrystalBlockItem.ts'
import { createCrossSpriteGeometry } from '../cocytus_shared/CrossSpriteGeometry.ts'
import texUrl from './assets/frost-crystal.webp'

const HEIGHT = 0.85

// Non-greedy sprite: no texture-array layer (not registered with registerTextureUrl)
const geometry = createCrossSpriteGeometry(-0.5, -0.5 + HEIGHT, 0.85)

// Unlit: the crystals are their own light and glow in the dark (like torch embers)
const material = new THREE.MeshBasicMaterial({
  map: loadBlockTexture(texUrl),
  color: 0xe4f6ff,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/**
 * Frost crystal - a cluster of glowing ice shards growing on the shores and
 * ice of Cocytus: the biome's cold blue light. Walk-through; drops itself as
 * a decorative light.
 */
export class FrostCrystalBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.FROST_CRYSTAL,
    name: 'frost_crystal',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0.3,
    lightLevel: 11,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.FROST_CRYSTAL
  }

  protected getGeometry(): THREE.BufferGeometry {
    return geometry
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  shouldRenderFace(_face: BlockFace): boolean {
    return true
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0.15, 0, 0.15), new THREE.Vector3(0.85, HEIGHT, 0.85))
  }

  getDrops(): IItem[] {
    return [new FrostCrystalBlockItem()]
  }
}
