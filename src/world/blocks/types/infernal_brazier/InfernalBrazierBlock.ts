import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { InfernalBrazierBlockItem } from '../../../../items/blocks/infernal_brazier/InfernalBrazierBlockItem.ts'

// ---------------------------------------------------------------------------
// Geometry: a blackened iron fire basket on a short stem, heaped with glowing
// coals and a squat flame. Cell space is [-0.5, 0.5]; material groups:
//   0 = iron (lit like the world), 1 = coals (emissive), 2 = flame (emissive)
// ---------------------------------------------------------------------------

function box(w: number, h: number, d: number, x: number, y0: number, z: number, group: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d)
  geo.translate(x, y0 + h / 2, z)
  geo.groups.forEach((g) => {
    g.materialIndex = group
  })
  return geo
}

const FLOOR = -0.5
const parts: THREE.BufferGeometry[] = [
  // Foot plate and stem
  box(0.62, 0.08, 0.62, 0, FLOOR, 0, 0),
  box(0.18, 0.3, 0.18, 0, FLOOR + 0.08, 0, 0),
  // Basket: floor + four rim walls (open top), corner spikes
  box(0.84, 0.08, 0.84, 0, FLOOR + 0.38, 0, 0),
  box(0.84, 0.26, 0.08, 0, FLOOR + 0.46, 0.38, 0),
  box(0.84, 0.26, 0.08, 0, FLOOR + 0.46, -0.38, 0),
  box(0.08, 0.26, 0.68, 0.38, FLOOR + 0.46, 0, 0),
  box(0.08, 0.26, 0.68, -0.38, FLOOR + 0.46, 0, 0),
  box(0.1, 0.12, 0.1, 0.38, FLOOR + 0.72, 0.38, 0),
  box(0.1, 0.12, 0.1, -0.38, FLOOR + 0.72, 0.38, 0),
  box(0.1, 0.12, 0.1, 0.38, FLOOR + 0.72, -0.38, 0),
  box(0.1, 0.12, 0.1, -0.38, FLOOR + 0.72, -0.38, 0),
  // Coal bed filling the basket
  box(0.68, 0.16, 0.68, 0, FLOOR + 0.46, 0, 1),
  // Flame: a wide low tongue and a tall bright core
  box(0.5, 0.18, 0.5, 0, FLOOR + 0.62, 0, 2),
  box(0.26, 0.34, 0.26, 0.04, FLOOR + 0.62, -0.03, 2),
]

const brazierGeometry = mergeGeometries(parts, true)

const ironMaterial = new THREE.MeshLambertMaterial({ color: 0x2b2522 }) // blackened iron
const coalMaterial = new THREE.MeshBasicMaterial({ color: 0xff5a14 }) // glowing coals
const flameMaterial = new THREE.MeshBasicMaterial({ color: 0xffb43c }) // flame core

const brazierMaterials = [ironMaterial, coalMaterial, flameMaterial]

/**
 * Infernal brazier: an iron fire basket heaped with burning coals - the
 * Infernal Bastion's beacons (tower tops, gate posts, the guardian's arena).
 * Full-strength light source (15), solid (players can't walk through it).
 */
export class InfernalBrazierBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.INFERNAL_BRAZIER,
    name: 'infernal_brazier',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 3.0,
    lightLevel: 15,
    lightBlocking: 0,
    demolitionForceRequired: 1, // any pickaxe (iron basket)
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.INFERNAL_BRAZIER
  }

  protected getGeometry(): THREE.BufferGeometry {
    return brazierGeometry
  }

  protected getMaterials(): THREE.Material[] {
    return brazierMaterials
  }

  getCollisionBox(): THREE.Box3 | null {
    return new THREE.Box3(new THREE.Vector3(0.08, 0, 0.08), new THREE.Vector3(0.92, 0.84, 0.92))
  }

  shouldRenderFace(_face: BlockFace): boolean {
    return true
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0.08, 0, 0.08), new THREE.Vector3(0.92, 0.9, 0.92))
  }

  getDrops(): IItem[] {
    return [new InfernalBrazierBlockItem()]
  }
}
