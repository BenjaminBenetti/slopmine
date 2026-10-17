import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { GoldBarItem } from '../../../../items/bars/gold/GoldBarItem.ts'
import { buildDecorGeometry, FLOOR, type DecorBox } from '../molten_decor/DecorGeometry.ts'

// A low heap of gold, a few infernium ingots and gems
const boxes: DecorBox[] = [
  { w: 0.86, h: 0.1, d: 0.8, x: 0, y: FLOOR, z: 0, m: 0 },
  { w: 0.62, h: 0.1, d: 0.6, x: 0.04, y: FLOOR + 0.1, z: -0.02, m: 0 },
  { w: 0.36, h: 0.08, d: 0.34, x: -0.04, y: FLOOR + 0.2, z: 0.02, m: 1 },
  { w: 0.3, h: 0.09, d: 0.13, x: -0.22, y: FLOOR + 0.2, z: 0.24, m: 2, ry: 0.4 }, // infernium ingots
  { w: 0.3, h: 0.09, d: 0.13, x: 0.24, y: FLOOR + 0.1, z: 0.3, m: 2, ry: -0.3 },
  { w: 0.1, h: 0.1, d: 0.1, x: 0.22, y: FLOOR + 0.2, z: -0.18, m: 3, ry: 0.7 }, // diamonds
  { w: 0.08, h: 0.08, d: 0.08, x: -0.3, y: FLOOR + 0.1, z: -0.3, m: 3, ry: 0.3 },
  { w: 0.12, h: 0.04, d: 0.12, x: 0.36, y: FLOOR + 0.1, z: -0.36, m: 1 }, // stray coins
]
const geometry = buildDecorGeometry(boxes)
const materials = [
  new THREE.MeshLambertMaterial({ color: 0xc99a2e }),
  new THREE.MeshLambertMaterial({ color: 0xf2c94c }),
  new THREE.MeshBasicMaterial({ color: 0xd8501c }),
  new THREE.MeshBasicMaterial({ color: 0x6fe0e0 }),
]

/**
 * Infernal hoard: a heap of gold, infernium and gems on the floor of the
 * Infernal Bastion's vault - the vault's loot-tier signature. Walk-over
 * decor; picking it apart yields a gold bar.
 */
export class InfernalHoardBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.INFERNAL_HOARD,
    name: 'infernal_hoard',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 1.0,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.INFERNAL_HOARD
  }

  protected getGeometry(): THREE.BufferGeometry {
    return geometry
  }

  protected getMaterials(): THREE.Material[] {
    return materials
  }

  isGreedyMeshable(): boolean {
    return false
  }

  shouldRenderFace(_face: BlockFace): boolean {
    return true
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0.05, 0, 0.05), new THREE.Vector3(0.95, 0.32, 0.95))
  }

  getDrops(): IItem[] {
    return [new GoldBarItem()]
  }
}
