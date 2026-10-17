import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { InfernalIronBarsBlockItem } from '../../../../items/blocks/infernal_iron_bars/InfernalIronBarsBlockItem.ts'
import { buildDecorGeometry, FLOOR, type DecorBox } from '../molten_decor/DecorGeometry.ts'

// A grate in the cell's XY plane (z = 0): 4 bars + 2 cross straps, with
// end posts so adjacent grates read as one continuous run
const boxes: DecorBox[] = [
  ...[-0.5, -0.17, 0.17, 0.5].map((x): DecorBox => ({ w: x === -0.5 || x === 0.5 ? 0.12 : 0.09, h: 1, d: 0.09, x: Math.max(-0.44, Math.min(0.44, x)), y: FLOOR, z: 0, m: 0 })),
  { w: 1, h: 0.08, d: 0.12, x: 0, y: FLOOR + 0.2, z: 0, m: 0 },
  { w: 1, h: 0.08, d: 0.12, x: 0, y: FLOOR + 0.72, z: 0, m: 0 },
  // rivets glow faintly with heat
  { w: 0.05, h: 0.05, d: 0.14, x: -0.17, y: FLOOR + 0.21, z: 0, m: 1 },
  { w: 0.05, h: 0.05, d: 0.14, x: 0.17, y: FLOOR + 0.73, z: 0, m: 1 },
]
const geometry = buildDecorGeometry(boxes)
const materials = [
  new THREE.MeshLambertMaterial({ color: 0x2e2826 }), // blackened iron
  new THREE.MeshLambertMaterial({ color: 0x8a3a1c }), // heated rivets
]

/**
 * Infernal iron bars: a blackened iron grate - the Infernal Bastion's cell
 * fronts, window grilles and raised portcullises. Thin (a plane through the
 * middle of the cell, turned by the metadata facing), see-through, and
 * structural (force 6: no prying the vault open with a diamond pickaxe).
 */
export class InfernalIronBarsBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.INFERNAL_IRON_BARS,
    name: 'infernal_iron_bars',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 40.0,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 6,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.INFERNAL_IRON_BARS
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

  /** Canonical (facing SOUTH): a thin wall through the cell centre along X. */
  getCollisionBox(): THREE.Box3 | null {
    return new THREE.Box3(new THREE.Vector3(0, 0, 0.4), new THREE.Vector3(1, 1, 0.6))
  }

  getCollisionBoxes(): THREE.Box3[] {
    return [new THREE.Box3(new THREE.Vector3(0, 0, 0.4), new THREE.Vector3(1, 1, 0.6))]
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0, 0, 0.35), new THREE.Vector3(1, 1, 0.65))
  }

  getDrops(): IItem[] {
    return [new InfernalIronBarsBlockItem()]
  }
}
