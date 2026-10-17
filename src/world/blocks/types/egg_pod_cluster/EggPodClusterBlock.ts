import * as THREE from 'three'
import type { IBlockProperties, BlockFace, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { createGroundCrossGeometry } from '../ember_shared/fungusSpriteGeometry.ts'
import texUrl from './assets/egg-pods.webp'

registerTextureUrl(TextureId.EGG_POD_CLUSTER, texUrl)

const texture = loadBlockTexture(texUrl)
const geometry = createGroundCrossGeometry(0.85, 0.95)
// The teal cores glow through the shells
const material = new THREE.MeshLambertMaterial({
  map: texture,
  emissiveMap: texture,
  emissive: 0xffffff,
  emissiveIntensity: 0.35,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/** Egg pod cluster - brood pods on the floors of the hive's nurseries (decor). */
export class EggPodClusterBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.EGG_POD_CLUSTER,
    name: 'egg_pod_cluster',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0.2,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.EGG_POD_CLUSTER
  }

  protected getGeometry(): THREE.BufferGeometry {
    return geometry
  }

  protected getMaterials(): THREE.Material {
    return material
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
    return new THREE.Box3(new THREE.Vector3(0.1, 0, 0.1), new THREE.Vector3(0.9, 0.85, 0.9))
  }

  getDrops(): IItem[] {
    return []
  }

  canPlace(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    const below = world.getBlockId ? world.getBlockId(x, y - 1n, z) : world.getBlock(x, y - 1n, z).properties.id
    return below !== BlockIds.AIR
  }
}
