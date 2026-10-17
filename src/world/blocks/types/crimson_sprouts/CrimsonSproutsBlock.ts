import * as THREE from 'three'
import type { IBlockProperties, BlockFace, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { createGroundCrossGeometry } from '../ember_shared/fungusSpriteGeometry.ts'
import sproutsTexUrl from './assets/crimson-sprouts.webp'

registerTextureUrl(TextureId.CRIMSON_SPROUTS, sproutsTexUrl)

const sproutsTexture = loadBlockTexture(sproutsTexUrl)
const sproutsGeometry = createGroundCrossGeometry(0.75, 0.95)

// Faint self-glow so the ember tips read in the dark
const sproutsMaterial = new THREE.MeshLambertMaterial({
  map: sproutsTexture,
  emissiveMap: sproutsTexture,
  emissive: 0xffffff,
  emissiveIntensity: 0.25,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/** Crimson sprouts - fungal ground cover of the Ember Grove (no drops). */
export class CrimsonSproutsBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CRIMSON_SPROUTS,
    name: 'crimson_sprouts',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.CRIMSON_SPROUTS
  }

  protected getGeometry(): THREE.BufferGeometry {
    return sproutsGeometry
  }

  protected getMaterials(): THREE.Material {
    return sproutsMaterial
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
    return new THREE.Box3(new THREE.Vector3(0.1, 0, 0.1), new THREE.Vector3(0.9, 0.7, 0.9))
  }

  getDrops(): IItem[] {
    return []
  }

  canPlace(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    const below = world.getBlockId ? world.getBlockId(x, y - 1n, z) : world.getBlock(x, y - 1n, z).properties.id
    return below !== BlockIds.AIR
  }
}
