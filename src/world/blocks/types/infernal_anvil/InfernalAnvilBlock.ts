import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { InfernalAnvilBlockItem } from '../../../../items/blocks/infernal_anvil/InfernalAnvilBlockItem.ts'
import { buildDecorGeometry, FLOOR, type DecorBox } from '../molten_decor/DecorGeometry.ts'

// Canonical: the anvil's length runs along X (horn toward +X), facing SOUTH
const boxes: DecorBox[] = [
  { w: 0.8, h: 0.16, d: 0.62, x: 0, y: FLOOR, z: 0, m: 0 }, // foot
  { w: 0.56, h: 0.12, d: 0.44, x: 0, y: FLOOR + 0.16, z: 0, m: 0 },
  { w: 0.32, h: 0.3, d: 0.3, x: 0, y: FLOOR + 0.28, z: 0, m: 0 }, // waist
  { w: 0.82, h: 0.22, d: 0.42, x: -0.04, y: FLOOR + 0.58, z: 0, m: 0 }, // face
  { w: 0.18, h: 0.14, d: 0.24, x: 0.45, y: FLOOR + 0.64, z: 0, m: 0 }, // horn
  { w: 0.08, h: 0.08, d: 0.14, x: 0.56, y: FLOOR + 0.67, z: 0, m: 0 },
  { w: 0.5, h: 0.02, d: 0.3, x: -0.08, y: FLOOR + 0.8, z: 0, m: 1 }, // polished face, still hot
  { w: 0.16, h: 0.05, d: 0.12, x: -0.18, y: FLOOR + 0.82, z: 0.05, m: 2 }, // glowing billet
]
const geometry = buildDecorGeometry(boxes)
const materials = [
  new THREE.MeshLambertMaterial({ color: 0x2a2624 }),
  new THREE.MeshLambertMaterial({ color: 0x5a5250 }),
  new THREE.MeshBasicMaterial({ color: 0xff8a2a }),
]

/**
 * Infernal anvil: a blackened forge anvil with a red-hot billet on its face,
 * dressing the Infernal Bastion's forge hall and armory. Solid decor.
 */
export class InfernalAnvilBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.INFERNAL_ANVIL,
    name: 'infernal_anvil',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 5.0,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 2,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.INFERNAL_ANVIL
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
    return new THREE.Box3(new THREE.Vector3(0.08, 0, 0.18), new THREE.Vector3(0.92, 0.82, 0.82))
  }

  getCollisionBoxes(): THREE.Box3[] {
    return [new THREE.Box3(new THREE.Vector3(0.08, 0, 0.18), new THREE.Vector3(0.92, 0.82, 0.82))]
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0.05, 0, 0.15), new THREE.Vector3(1, 0.85, 0.85))
  }

  getDrops(): IItem[] {
    return [new InfernalAnvilBlockItem()]
  }
}
