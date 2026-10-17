import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { InfernalThroneBlockItem } from '../../../../items/blocks/infernal_throne/InfernalThroneBlockItem.ts'
import { buildDecorGeometry, FLOOR, type DecorBox } from '../molten_decor/DecorGeometry.ts'

// Seat faces +Z (SOUTH); the tall back rises past the cell top (the cell
// above stays free: the back is decorative geometry only)
const boxes: DecorBox[] = [
  { w: 1.0, h: 0.42, d: 0.9, x: 0, y: FLOOR, z: 0, m: 0 }, // obsidian plinth
  { w: 0.84, h: 0.1, d: 0.7, x: 0, y: FLOOR + 0.42, z: 0.04, m: 2 }, // crimson cushion
  { w: 0.9, h: 1.3, d: 0.16, x: 0, y: FLOOR + 0.42, z: -0.38, m: 0 }, // back
  { w: 0.98, h: 0.08, d: 0.2, x: 0, y: FLOOR + 0.42, z: -0.38, m: 1 }, // gold bands
  { w: 0.98, h: 0.08, d: 0.2, x: 0, y: FLOOR + 1.6, z: -0.38, m: 1 },
  { w: 0.14, h: 0.3, d: 0.7, x: -0.46, y: FLOOR + 0.42, z: 0, m: 0 }, // arms
  { w: 0.14, h: 0.3, d: 0.7, x: 0.46, y: FLOOR + 0.42, z: 0, m: 0 },
  { w: 0.18, h: 0.06, d: 0.74, x: -0.46, y: FLOOR + 0.72, z: 0, m: 1 },
  { w: 0.18, h: 0.06, d: 0.74, x: 0.46, y: FLOOR + 0.72, z: 0, m: 1 },
  // crown of spikes on the back and a burning gem
  ...[-0.36, -0.12, 0.12, 0.36].map((x, i): DecorBox => ({ w: 0.1, h: i === 1 || i === 2 ? 0.36 : 0.24, d: 0.1, x, y: FLOOR + 1.68, z: -0.38, m: 1 })),
  { w: 0.22, h: 0.22, d: 0.06, x: 0, y: FLOOR + 1.2, z: -0.29, m: 3 },
]
const geometry = buildDecorGeometry(boxes)
const materials = [
  new THREE.MeshLambertMaterial({ color: 0x1d1026 }), // obsidian
  new THREE.MeshLambertMaterial({ color: 0xc99a2e }), // gold
  new THREE.MeshLambertMaterial({ color: 0x6e1414 }), // crimson
  new THREE.MeshBasicMaterial({ color: 0xff8a2a }), // ember gem
]

/**
 * Infernal throne: the Pyre Tyrant's obsidian and gold throne at the back of
 * the Throne Crucible. Structural (force 6), solid seat height.
 */
export class InfernalThroneBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.INFERNAL_THRONE,
    name: 'infernal_throne',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 60.0,
    lightLevel: 4,
    lightBlocking: 0,
    demolitionForceRequired: 6,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.INFERNAL_THRONE
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
    return new THREE.Box3(new THREE.Vector3(0, 0, 0.05), new THREE.Vector3(1, 0.52, 0.95))
  }

  getCollisionBoxes(): THREE.Box3[] {
    return [
      new THREE.Box3(new THREE.Vector3(0, 0, 0.05), new THREE.Vector3(1, 0.52, 0.95)),
      new THREE.Box3(new THREE.Vector3(0.05, 0.52, 0.04), new THREE.Vector3(0.95, 1, 0.2)),
    ]
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1))
  }

  getDrops(): IItem[] {
    return [new InfernalThroneBlockItem()]
  }
}
