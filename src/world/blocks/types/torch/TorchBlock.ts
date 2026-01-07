import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TorchBlockItem } from '../../../../items/blocks/torch/TorchBlockItem.ts'

// Create torch geometry: slim post with ember cube on top
const postGeometry = new THREE.BoxGeometry(0.125, 0.625, 0.125)
postGeometry.translate(0, -0.1875, 0) // Position post so ember sits on top

const emberGeometry = new THREE.BoxGeometry(0.1875, 0.1875, 0.1875)
emberGeometry.translate(0, 0.21875, 0) // Position ember on top of post

// Assign material groups: 0 = post faces (first 6 faces), 1 = ember faces (next 6 faces)
postGeometry.groups.forEach((group) => {
  group.materialIndex = 0
})
emberGeometry.groups.forEach((group) => {
  group.materialIndex = 1
})

// Merge geometries into a single geometry with two material groups
const torchGeometry = mergeGeometries([postGeometry, emberGeometry], true)

// Materials: wood brown for post, orange emissive for ember
const postMaterial = new THREE.MeshLambertMaterial({ color: 0x8b4513 }) // Saddle brown
const emberMaterial = new THREE.MeshBasicMaterial({
  color: 0xff6600, // Orange
})

const torchMaterials = [postMaterial, emberMaterial]

export class TorchBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.TORCH,
    name: 'torch',
    isOpaque: false,
    isSolid: false, // No collision - players can walk through
    isLiquid: false,
    hardness: 0, // Instant break
    lightLevel: 14, // Emits light like Minecraft torch
    lightBlocking: 0, // Doesn't block light
    demolitionForceRequired: 0,
    tags: [],
  }

  protected getGeometry(): THREE.BufferGeometry {
    return torchGeometry
  }

  protected getMaterials(): THREE.Material[] {
    return torchMaterials
  }

  getCollisionBox(): THREE.Box3 | null {
    // No collision - players can walk through torches
    return null
  }

  shouldRenderFace(_face: BlockFace): boolean {
    // Always render torch (it's a small non-cube shape)
    return true
  }

  getDrops(): IItem[] {
    return [new TorchBlockItem()]
  }
}
