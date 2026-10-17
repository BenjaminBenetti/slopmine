import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { IBlockProperties, BlockFace, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { GlowBulbBlockItem } from '../../../../items/blocks/glow_bulb/GlowBulbBlockItem.ts'

/**
 * Hanging lamp geometry, block-local (-0.5..0.5), anchored at the ceiling:
 * a root stalk, a crimson cap collar and a glowing teal bulb with a few
 * nodules. Group 0 = lit (stalk, collar), group 1 = self-lit (bulb).
 */
function buildBulbGeometry(): THREE.BufferGeometry {
  const part = (w: number, h: number, d: number, x: number, y: number, z: number, group: number): THREE.BufferGeometry => {
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z)
    for (const grp of g.groups) grp.materialIndex = group
    return g
  }
  return mergeGeometries([
    part(0.1, 0.3, 0.1, 0, 0.35, 0, 0),         // stalk from the ceiling
    part(0.38, 0.1, 0.38, 0, 0.17, 0, 0),       // cap collar
    part(0.34, 0.34, 0.34, 0, -0.04, 0, 1),     // bulb
    part(0.22, 0.12, 0.22, 0, -0.26, 0, 1),     // bulb tip
    part(0.08, 0.08, 0.08, 0.2, -0.02, 0.05, 1), // nodules
    part(0.08, 0.08, 0.08, -0.18, 0.06, -0.12, 1),
  ], true)
}

const geometry = buildBulbGeometry()
const stalkMaterial = new THREE.MeshLambertMaterial({ color: 0x5a1e22 })
const bulbMaterial = new THREE.MeshBasicMaterial({ color: 0x6af0d8 })
const materials = [stalkMaterial, bulbMaterial]

/**
 * Glow bulb - a bioluminescent lamp hanging from the hive's tunnel ceilings
 * (light 12). Players can harvest and re-hang it (needs a block above).
 */
export class GlowBulbBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.GLOW_BULB,
    name: 'glow_bulb',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0.3,
    lightLevel: 12,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.GLOW_BULB
  }

  protected getGeometry(): THREE.BufferGeometry {
    return geometry
  }

  protected getMaterials(): THREE.Material[] {
    return materials
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
    return new THREE.Box3(new THREE.Vector3(0.28, 0.18, 0.28), new THREE.Vector3(0.72, 1, 0.72))
  }

  getDrops(): IItem[] {
    return [new GlowBulbBlockItem()]
  }

  /** Hangs from a block above. */
  canPlace(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    const above = world.getBlockId ? world.getBlockId(x, y + 1n, z) : world.getBlock(x, y + 1n, z).properties.id
    return above !== BlockIds.AIR
  }
}
