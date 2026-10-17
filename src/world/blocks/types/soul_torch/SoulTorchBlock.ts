import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { SoulTorchBlockItem } from '../../../../items/blocks/soul_torch/SoulTorchBlockItem.ts'

// Soul torch: a bone shaft with a knuckle collar, crowned by a pale-green
// soul flame (two stacked full-bright cubes, like the torch's ember)
const shaftGeometry = new THREE.BoxGeometry(0.125, 0.6, 0.125)
shaftGeometry.translate(0, -0.2, 0)

const collarGeometry = new THREE.BoxGeometry(0.19, 0.1, 0.19)
collarGeometry.translate(0, 0.1, 0)

const flameGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.2)
flameGeometry.translate(0, 0.25, 0)

const tipGeometry = new THREE.BoxGeometry(0.1, 0.12, 0.1)
tipGeometry.translate(0, 0.41, 0)

shaftGeometry.groups.forEach((g) => { g.materialIndex = 0 })
collarGeometry.groups.forEach((g) => { g.materialIndex = 1 })
flameGeometry.groups.forEach((g) => { g.materialIndex = 2 })
tipGeometry.groups.forEach((g) => { g.materialIndex = 3 })

const soulTorchGeometry = mergeGeometries([shaftGeometry, collarGeometry, flameGeometry, tipGeometry], true)

const soulTorchMaterials = [
  new THREE.MeshLambertMaterial({ color: 0xd8d0bc }), // bleached bone shaft
  new THREE.MeshLambertMaterial({ color: 0xa89e86 }), // knuckle collar
  new THREE.MeshBasicMaterial({ color: 0x5fe08a }),   // soul flame
  new THREE.MeshBasicMaterial({ color: 0xd4ffe0 }),   // pale-white flame tip
]

/**
 * Soul torch - a bone torch burning with pale-green soul fire. Crafted from
 * a bone and a soul shard; the Catacombs line their halls with them.
 */
export class SoulTorchBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.SOUL_TORCH,
    name: 'soul_torch',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0,
    lightLevel: 11, // A little dimmer than a torch: soul fire is cold
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.SOUL_TORCH
  }

  protected getGeometry(): THREE.BufferGeometry {
    return soulTorchGeometry
  }

  protected getMaterials(): THREE.Material[] {
    return soulTorchMaterials
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
    return new THREE.Box3(new THREE.Vector3(0.35, 0, 0.35), new THREE.Vector3(0.65, 0.95, 0.65))
  }

  getDrops(): IItem[] {
    return [new SoulTorchBlockItem()]
  }
}
