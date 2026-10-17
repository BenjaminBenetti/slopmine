import * as THREE from 'three'
import type { IBlockProperties, BlockFace, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { GlowcapItem } from '../../../../items/food/glowcap/GlowcapItem.ts'
import { createGroundCrossGeometry } from '../ember_shared/fungusSpriteGeometry.ts'
import glowcapTexUrl from './assets/glowcap.webp'

registerTextureUrl(TextureId.GLOWCAP, glowcapTexUrl)

const glowcapTexture = loadBlockTexture(glowcapTexUrl)
const glowcapGeometry = createGroundCrossGeometry(0.8, 0.85)

// Bioluminescent: the sprite glows on its own (emissive map = its texels)
const glowcapMaterial = new THREE.MeshLambertMaterial({
  map: glowcapTexture,
  emissiveMap: glowcapTexture,
  emissive: 0xffffff,
  emissiveIntensity: 0.7,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/**
 * Glowcap - a cluster of small teal-glowing mushrooms on the Ember Grove
 * floor. A light source that makes the fungus forest floor readable, and
 * the Hell layer's forage: drops 1-2 glowcaps (food, ember-sight potions,
 * hellbane leggings/shovel).
 */
export class GlowcapBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.GLOWCAP,
    name: 'glowcap',
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
    return TextureId.GLOWCAP
  }

  protected getGeometry(): THREE.BufferGeometry {
    return glowcapGeometry
  }

  protected getMaterials(): THREE.Material {
    return glowcapMaterial
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
    return new THREE.Box3(new THREE.Vector3(0.15, 0, 0.15), new THREE.Vector3(0.85, 0.8, 0.85))
  }

  getDrops(): IItem[] {
    const drops: IItem[] = [new GlowcapItem()]
    if (Math.random() < 0.5) drops.push(new GlowcapItem())
    return drops
  }

  /** A glowcap needs ground to grow on. */
  canPlace(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    const below = world.getBlockId ? world.getBlockId(x, y - 1n, z) : world.getBlock(x, y - 1n, z).properties.id
    return below !== BlockIds.AIR
  }
}
