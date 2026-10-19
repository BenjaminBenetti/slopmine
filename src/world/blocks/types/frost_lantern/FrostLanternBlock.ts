import * as THREE from 'three'
import { mergeTaggedParts } from '../model_shared/mergeTaggedParts.ts'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { FrostLanternBlockItem } from '../../../../items/blocks/frost_lantern/FrostLanternBlockItem.ts'
import { cellBox } from '../cocytus_shared/CrossSpriteGeometry.ts'

// Model (cell space 0..1): dark iron cage around a glowing block of rime ice.
// Material groups: 0 = iron, 1 = glowing core (unlit)
const IRON = 0
const CORE = 1
const HEIGHT = 0.7

const geometry = mergeTaggedParts([
  cellBox(0.22, 0, 0.22, 0.56, 0.08, 0.56, IRON), // base plate
  cellBox(0.22, 0.08, 0.22, 0.07, 0.48, 0.07, IRON), // corner posts
  cellBox(0.71, 0.08, 0.22, 0.07, 0.48, 0.07, IRON),
  cellBox(0.22, 0.08, 0.71, 0.07, 0.48, 0.07, IRON),
  cellBox(0.71, 0.08, 0.71, 0.07, 0.48, 0.07, IRON),
  cellBox(0.2, 0.56, 0.2, 0.6, 0.07, 0.6, IRON), // cap
  cellBox(0.4, 0.63, 0.4, 0.2, 0.07, 0.2, IRON), // finial
  cellBox(0.31, 0.1, 0.31, 0.38, 0.44, 0.38, CORE), // rime-ice core
])

const ironMaterial = new THREE.MeshLambertMaterial({ color: 0x3b4250 })
const coreMaterial = new THREE.MeshBasicMaterial({ color: 0xaeeeff })
const materials = [ironMaterial, coreMaterial]

/**
 * Frost lantern - a cage of dark iron around a core of glowing rime ice.
 * Bright cold light (15); crafted from a rime crystal and glacial ice, and
 * lights the halls of the Frozen Citadel.
 */
export class FrostLanternBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.FROST_LANTERN,
    name: 'frost_lantern',
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
    return TextureId.FROST_LANTERN
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
    return new THREE.Box3(new THREE.Vector3(0.2, 0, 0.2), new THREE.Vector3(0.8, HEIGHT, 0.8))
  }

  getDrops(): IItem[] {
    return [new FrostLanternBlockItem()]
  }
}
