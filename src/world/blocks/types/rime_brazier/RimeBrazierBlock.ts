import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { cellBox } from '../cocytus_shared/CrossSpriteGeometry.ts'

// Model (cell space 0..1): black-iron pedestal and bowl holding a cold cyan
// flame. Material groups: 0 = iron, 1 = flame core, 2 = flame tips (unlit)
const IRON = 0
const FLAME = 1
const TIPS = 2

const geometry = mergeGeometries([
  cellBox(0.25, 0, 0.25, 0.5, 0.1, 0.5, IRON), // foot
  cellBox(0.38, 0.1, 0.38, 0.24, 0.4, 0.24, IRON), // stem
  cellBox(0.12, 0.5, 0.12, 0.76, 0.16, 0.76, IRON), // bowl
  cellBox(0.08, 0.62, 0.08, 0.84, 0.06, 0.84, IRON), // rim
  cellBox(0.2, 0.66, 0.2, 0.6, 0.18, 0.6, FLAME), // flame body
  cellBox(0.3, 0.84, 0.3, 0.4, 0.12, 0.4, TIPS), // flame tip
  cellBox(0.44, 0.96, 0.4, 0.12, 0.04, 0.12, TIPS),
], true)

const ironMaterial = new THREE.MeshLambertMaterial({ color: 0x2c313b })
const flameMaterial = new THREE.MeshBasicMaterial({ color: 0x86e6ff })
const tipMaterial = new THREE.MeshBasicMaterial({ color: 0xd8fbff })
const materials = [ironMaterial, flameMaterial, tipMaterial]

/**
 * Rime brazier - black-iron braziers burning with cold cyan fire that light
 * the Frozen Citadel. Only the citadel places them (its chest-loot
 * signature): they can't be crafted, take infernium tools to break (force 6,
 * like the citadel's masonry) and drop nothing.
 */
export class RimeBrazierBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.RIME_BRAZIER,
    name: 'rime_brazier',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 60,
    lightLevel: 15,
    lightBlocking: 0,
    demolitionForceRequired: 6,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.RIME_BRAZIER
  }

  protected getGeometry(): THREE.BufferGeometry {
    return geometry
  }

  protected getMaterials(): THREE.Material[] {
    return materials
  }

  getCollisionBox(): THREE.Box3 | null {
    return new THREE.Box3(new THREE.Vector3(0.1, 0, 0.1), new THREE.Vector3(0.9, 0.68, 0.9))
  }

  shouldRenderFace(_face: BlockFace): boolean {
    return true
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0.08, 0, 0.08), new THREE.Vector3(0.92, 1, 0.92))
  }

  getDrops(): IItem[] {
    return []
  }
}
