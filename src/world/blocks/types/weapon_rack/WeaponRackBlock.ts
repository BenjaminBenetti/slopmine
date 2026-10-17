import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { WeaponRackBlockItem } from '../../../../items/blocks/weapon_rack/WeaponRackBlockItem.ts'
import { buildDecorGeometry, FLOOR, type DecorBox } from '../molten_decor/DecorGeometry.ts'

// Against the back (-Z) wall, front facing +Z: a charred-wood frame holding
// two swords and a war axe upright
const Z = -0.36
const boxes: DecorBox[] = [
  // frame: two posts, a top and a bottom rail
  { w: 0.08, h: 0.96, d: 0.1, x: -0.42, y: FLOOR, z: Z, m: 0 },
  { w: 0.08, h: 0.96, d: 0.1, x: 0.42, y: FLOOR, z: Z, m: 0 },
  { w: 0.92, h: 0.07, d: 0.12, x: 0, y: FLOOR + 0.82, z: Z + 0.02, m: 0 },
  { w: 0.92, h: 0.07, d: 0.16, x: 0, y: FLOOR + 0.1, z: Z + 0.04, m: 0 },
  // sword 1 and 2: blade, guard, grip, pommel
  ...[-0.22, 0.02].flatMap((x): DecorBox[] => [
    { w: 0.07, h: 0.62, d: 0.03, x, y: FLOOR + 0.17, z: Z + 0.08, m: 1 },
    { w: 0.2, h: 0.05, d: 0.05, x, y: FLOOR + 0.79, z: Z + 0.08, m: 2 },
    { w: 0.05, h: 0.12, d: 0.05, x, y: FLOOR + 0.84, z: Z + 0.08, m: 3 },
    { w: 0.07, h: 0.05, d: 0.07, x, y: FLOOR + 0.95, z: Z + 0.08, m: 2 },
  ]),
  // war axe: haft and a broad head with a glowing edge
  { w: 0.05, h: 0.8, d: 0.05, x: 0.26, y: FLOOR + 0.14, z: Z + 0.08, m: 0 },
  { w: 0.2, h: 0.22, d: 0.04, x: 0.3, y: FLOOR + 0.66, z: Z + 0.08, m: 1 },
  { w: 0.04, h: 0.22, d: 0.045, x: 0.41, y: FLOOR + 0.66, z: Z + 0.08, m: 4 },
]
const geometry = buildDecorGeometry(boxes)
const materials = [
  new THREE.MeshLambertMaterial({ color: 0x2e2018 }), // charred wood
  new THREE.MeshLambertMaterial({ color: 0x6a6462 }), // dark steel
  new THREE.MeshLambertMaterial({ color: 0xa87a1e }), // gold fittings
  new THREE.MeshLambertMaterial({ color: 0x4a1a19 }), // crimson grips
  new THREE.MeshBasicMaterial({ color: 0xff7a2a }), // hot edge
]

/**
 * Weapon rack: the Infernal Bastion's garrison armament against a wall. Its
 * presence marks a bastion stores chest (loot-tier signature). Decor (any
 * axe or by hand), walk-through.
 */
export class WeaponRackBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.WEAPON_RACK,
    name: 'weapon_rack',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 1.5,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.WEAPON_RACK
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
    return new THREE.Box3(new THREE.Vector3(0.05, 0, 0), new THREE.Vector3(0.95, 1, 0.3))
  }

  getDrops(): IItem[] {
    return [new WeaponRackBlockItem()]
  }
}
