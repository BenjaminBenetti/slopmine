import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { FrostLanternBlockItem } from '../../../../items/blocks/frost_lantern/FrostLanternBlockItem.ts'
import { cellBox } from '../cocytus_shared/CrossSpriteGeometry.ts'

// Model (cell space 0..1): a chain from the ceiling and a frost lantern
// hanging below it. Material groups: 0 = iron, 1 = glowing core (unlit)
const IRON = 0
const CORE = 1

const geometry = mergeGeometries([
  cellBox(0.46, 0.62, 0.48, 0.08, 0.38, 0.04, IRON), // chain links
  cellBox(0.48, 0.62, 0.46, 0.04, 0.38, 0.08, IRON),
  cellBox(0.38, 0.56, 0.38, 0.24, 0.06, 0.24, IRON), // cap
  cellBox(0.3, 0.12, 0.3, 0.06, 0.44, 0.06, IRON), // cage posts
  cellBox(0.64, 0.12, 0.3, 0.06, 0.44, 0.06, IRON),
  cellBox(0.3, 0.12, 0.64, 0.06, 0.44, 0.06, IRON),
  cellBox(0.64, 0.12, 0.64, 0.06, 0.44, 0.06, IRON),
  cellBox(0.28, 0.06, 0.28, 0.44, 0.06, 0.44, IRON), // base
  cellBox(0.35, 0.13, 0.35, 0.3, 0.4, 0.3, CORE), // rime-ice core
], true)

const ironMaterial = new THREE.MeshLambertMaterial({ color: 0x3b4250 })
const coreMaterial = new THREE.MeshBasicMaterial({ color: 0xaeeeff })
const materials = [ironMaterial, coreMaterial]

/**
 * Hanging frost lantern - a frost lantern on a chain, hanging from the
 * block above: corridors and chandeliers of the Frozen Citadel. Bright
 * cold light (15); breaks into a frost lantern.
 */
export class HangingFrostLanternBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.HANGING_FROST_LANTERN,
    name: 'hanging_frost_lantern',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0.5,
    lightLevel: 15,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.HANGING_FROST_LANTERN
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
    return new THREE.Box3(new THREE.Vector3(0.26, 0.04, 0.26), new THREE.Vector3(0.74, 1, 0.74))
  }

  getDrops(): IItem[] {
    return [new FrostLanternBlockItem()]
  }
}
