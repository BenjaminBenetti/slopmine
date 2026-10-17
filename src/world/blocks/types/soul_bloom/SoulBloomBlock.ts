import * as THREE from 'three'
import type { IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { SoulBloomBlockItem } from '../../../../items/blocks/soul_bloom/SoulBloomBlockItem.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { createCrossGeometry } from './crossGeometry.ts'
import soulBloomTexUrl from './assets/soul-bloom.webp'

registerTextureUrl(TextureId.SOUL_BLOOM, soulBloomTexUrl)

const soulBloomGeometry = createCrossGeometry(0.85, 0.9)
// Full-bright (unlit) like a torch flame: the bloom is its own soul-light,
// glowing pale green against the dark ash whatever the world light
const soulBloomMaterial = new THREE.MeshBasicMaterial({
  map: loadBlockTexture(soulBloomTexUrl),
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/**
 * Soul bloom - a ghostly, glowing flower that grows from the bone ash of the
 * Ossuary. A faint light source; replantable on bone ash.
 */
export class SoulBloomBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.SOUL_BLOOM,
    name: 'soul_bloom',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0,
    lightLevel: 6,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.SOUL_BLOOM
  }

  protected getGeometry(): THREE.BufferGeometry {
    return soulBloomGeometry
  }

  protected getMaterials(): THREE.Material {
    return soulBloomMaterial
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0.2, 0, 0.2), new THREE.Vector3(0.8, 0.85, 0.8))
  }

  getDrops(): IItem[] {
    return [new SoulBloomBlockItem()]
  }

  canPlace(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    const below = world.getBlockId ? world.getBlockId(x, y - 1n, z) : world.getBlock(x, y - 1n, z).properties.id
    return below === BlockIds.BONE_ASH || below === BlockIds.OSSIFIED_ROCK
  }
}
