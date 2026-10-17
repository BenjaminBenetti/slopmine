import * as THREE from 'three'
import type { IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BoneItem } from '../../../../items/materials/bone/BoneItem.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { createCrossGeometry } from '../soul_bloom/crossGeometry.ts'
import bonePileTexUrl from './assets/bone-pile.webp'

registerTextureUrl(TextureId.BONE_PILE, bonePileTexUrl)

const bonePileGeometry = createCrossGeometry(0.7, 0.9)
const bonePileMaterial = new THREE.MeshLambertMaterial({
  map: loadBlockTexture(bonePileTexUrl),
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/**
 * Bone pile - a skull on a heap of old bones, scattered over the Ossuary's
 * ash and stacked in the Catacombs' burial niches. Breaks into 1-3 bones,
 * the raw material of bone blocks.
 */
export class BonePileBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.BONE_PILE,
    name: 'bone_pile',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0.3,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.BONE_PILE
  }

  protected getGeometry(): THREE.BufferGeometry {
    return bonePileGeometry
  }

  protected getMaterials(): THREE.Material {
    return bonePileMaterial
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0.1, 0, 0.1), new THREE.Vector3(0.9, 0.6, 0.9))
  }

  getDrops(): IItem[] {
    const count = 1 + Math.floor(Math.random() * 3) // 1-3
    const drops: IItem[] = []
    for (let i = 0; i < count; i++) drops.push(new BoneItem())
    return drops
  }

  canPlace(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    const below = world.getBlock(x, y - 1n, z)
    return below.properties.isSolid
  }
}
