import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { IBlockProperties, BlockFace, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { GraveCandlesBlockItem } from '../../../../items/blocks/grave_candles/GraveCandlesBlockItem.ts'

// Four stubby bone candles of different heights, each with a soul flame
const candles: Array<[number, number, number]> = [[-0.2, -0.12, 0.3], [0.14, -0.18, 0.2], [-0.05, 0.16, 0.38], [0.22, 0.17, 0.15]]
const parts: THREE.BufferGeometry[] = []
for (const [x, z, h] of candles) {
  const wax = new THREE.BoxGeometry(0.11, h, 0.11)
  wax.translate(x, -0.5 + h / 2, z)
  wax.groups.forEach((g) => { g.materialIndex = 0 })
  const flame = new THREE.BoxGeometry(0.07, 0.09, 0.07)
  flame.translate(x, -0.5 + h + 0.06, z)
  flame.groups.forEach((g) => { g.materialIndex = 1 })
  parts.push(wax, flame)
}
const candlesGeometry = mergeGeometries(parts, true)
const candlesMaterials = [
  new THREE.MeshLambertMaterial({ color: 0xded5bf }),
  new THREE.MeshBasicMaterial({ color: 0x8dffb2 }),
]

/**
 * Grave candles - a cluster of soul candles on a floor, ledge or altar.
 */
export class GraveCandlesBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.GRAVE_CANDLES,
    name: 'grave_candles',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0,
    lightLevel: 8,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.GRAVE_CANDLES
  }

  protected getGeometry(): THREE.BufferGeometry {
    return candlesGeometry
  }

  protected getMaterials(): THREE.Material[] {
    return candlesMaterials
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
    return new THREE.Box3(new THREE.Vector3(0.2, 0, 0.2), new THREE.Vector3(0.8, 0.5, 0.8))
  }

  getDrops(): IItem[] {
    return [new GraveCandlesBlockItem()]
  }

  canPlace(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    return world.getBlock(x, y - 1n, z).properties.isSolid
  }
}
