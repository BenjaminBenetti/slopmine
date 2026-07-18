import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { ResinTorchBlockItem } from '../../../../items/blocks/resin_torch/ResinTorchBlockItem.ts'

// Resin torch geometry: sturdier post than the standard torch, wrapped in a
// resin-soaked moss band, with a larger two-part flame
const postGeometry = new THREE.BoxGeometry(0.15, 0.65, 0.15)
postGeometry.translate(0, -0.175, 0)

const bandGeometry = new THREE.BoxGeometry(0.19, 0.14, 0.19)
bandGeometry.translate(0, 0.08, 0)

const emberGeometry = new THREE.BoxGeometry(0.24, 0.22, 0.24)
emberGeometry.translate(0, 0.26, 0)

const flameGeometry = new THREE.BoxGeometry(0.13, 0.13, 0.13)
flameGeometry.translate(0, 0.43, 0)

postGeometry.groups.forEach((g) => { g.materialIndex = 0 })
bandGeometry.groups.forEach((g) => { g.materialIndex = 1 })
emberGeometry.groups.forEach((g) => { g.materialIndex = 2 })
flameGeometry.groups.forEach((g) => { g.materialIndex = 3 })

const resinTorchGeometry = mergeGeometries(
  [postGeometry, bandGeometry, emberGeometry, flameGeometry],
  true
)

const resinTorchMaterials = [
  new THREE.MeshLambertMaterial({ color: 0x8b4513 }), // wood post
  new THREE.MeshLambertMaterial({ color: 0x5a6b3a }), // resin-soaked moss band
  new THREE.MeshBasicMaterial({ color: 0xffa020 }),   // blazing amber ember
  new THREE.MeshBasicMaterial({ color: 0xfff0a0 }),   // white-hot flame tip
]

/**
 * Resin torch - the upgraded torch, burning pine resin over a dried-moss
 * wick. Emits the maximum blocklight the engine supports (15 vs the
 * standard torch's 14).
 */
export class ResinTorchBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.RESIN_TORCH,
    name: 'resin_torch',
    isOpaque: false,
    isSolid: false, // No collision - players can walk through
    isLiquid: false,
    hardness: 0, // Instant break
    lightLevel: 15, // Engine maximum (4-bit blocklight)
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.RESIN_TORCH
  }

  protected getGeometry(): THREE.BufferGeometry {
    return resinTorchGeometry
  }

  protected getMaterials(): THREE.Material[] {
    return resinTorchMaterials
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
    return new THREE.Box3(
      new THREE.Vector3(0.33, 0, 0.33),
      new THREE.Vector3(0.67, 0.95, 0.67)
    )
  }

  getDrops(): IItem[] {
    return [new ResinTorchBlockItem()]
  }
}
