import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { DiviningStickBlockItem } from '../../../../items/blocks/divining_stick/DiviningStickBlockItem.ts'
import { BlockFacing, getMetadataFacing } from '../../BlockFacing.ts'
import diviningStickTexUrl from './assets/divining-stick.webp'

// Register texture for atlas
registerTextureUrl(TextureId.DIVINING_STICK, diviningStickTexUrl)

// Load texture
const diviningStickTexture = loadBlockTexture(diviningStickTexUrl)

// Create material with texture
const diviningStickMaterial = new THREE.MeshLambertMaterial({
  map: diviningStickTexture,
})

// Create Y-shaped divining stick geometry
// Main stem: thin vertical post
const stemGeometry = new THREE.BoxGeometry(0.1, 0.6, 0.1)
stemGeometry.translate(0, -0.2, 0) // Lower half of block

// Left branch: angled outward
const leftBranch = new THREE.BoxGeometry(0.08, 0.4, 0.08)
leftBranch.rotateZ(Math.PI / 6) // ~30 degree angle
leftBranch.translate(-0.12, 0.25, 0)

// Right branch: angled outward
const rightBranch = new THREE.BoxGeometry(0.08, 0.4, 0.08)
rightBranch.rotateZ(-Math.PI / 6) // ~30 degree angle
rightBranch.translate(0.12, 0.25, 0)

// Merge all three parts
const diviningStickGeometry = mergeGeometries([stemGeometry, leftBranch, rightBranch])!

if (!diviningStickGeometry) {
  throw new Error('Failed to create divining stick geometry')
}

export class DiviningStickBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.DIVINING_STICK,
    name: 'divining_stick',
    isOpaque: false,
    isSolid: false, // No collision - players can walk through
    isLiquid: false,
    hardness: 0, // Instant break
    lightLevel: 0, // No light emission
    lightBlocking: 0, // Doesn't block light
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.DIVINING_STICK
  }

  protected getGeometry(): THREE.BufferGeometry {
    return diviningStickGeometry
  }

  protected getMaterials(): THREE.Material {
    return diviningStickMaterial
  }

  getCollisionBox(): THREE.Box3 | null {
    // No collision - players can walk through
    return null
  }

  shouldRenderFace(_face: BlockFace): boolean {
    // Always render (it's a small non-cube shape)
    return true
  }

  isGreedyMeshable(): boolean {
    // Custom geometry - cannot be greedy-meshed
    return false
  }

  /**
   * This block attaches to surfaces - uses clicked face for 6-way orientation.
   */
  usesSurfaceFacing(): boolean {
    return true
  }

  /**
   * Get the interaction box for raycasting.
   * Returns a box matching the divining stick's visual geometry based on facing.
   */
  getInteractionBox(metadata: number): THREE.Box3 {
    const facing = getMetadataFacing(metadata)

    // Base box for UP orientation (default): centered Y-stick pointing up
    // Stick dimensions: ~0.4 wide, ~0.9 tall, ~0.2 deep
    switch (facing) {
      case BlockFacing.UP:
        // Pointing up (default)
        return new THREE.Box3(
          new THREE.Vector3(0.3, 0, 0.4),
          new THREE.Vector3(0.7, 0.9, 0.6)
        )
      case BlockFacing.DOWN:
        // Pointing down into floor
        return new THREE.Box3(
          new THREE.Vector3(0.3, 0.1, 0.4),
          new THREE.Vector3(0.7, 1.0, 0.6)
        )
      case BlockFacing.NORTH:
        // Pointing into -Z wall (rotated to horizontal, stick along -Z)
        return new THREE.Box3(
          new THREE.Vector3(0.3, 0.4, 0),
          new THREE.Vector3(0.7, 0.6, 0.9)
        )
      case BlockFacing.SOUTH:
        // Pointing into +Z wall (rotated to horizontal, stick along +Z)
        return new THREE.Box3(
          new THREE.Vector3(0.3, 0.4, 0.1),
          new THREE.Vector3(0.7, 0.6, 1.0)
        )
      case BlockFacing.EAST:
        // Pointing into +X wall (rotated sideways, stick along +X)
        return new THREE.Box3(
          new THREE.Vector3(0.1, 0.4, 0.3),
          new THREE.Vector3(1.0, 0.6, 0.7)
        )
      case BlockFacing.WEST:
        // Pointing into -X wall (rotated sideways, stick along -X)
        return new THREE.Box3(
          new THREE.Vector3(0, 0.4, 0.3),
          new THREE.Vector3(0.9, 0.6, 0.7)
        )
    }
  }

  getDrops(): IItem[] {
    return [new DiviningStickBlockItem()]
  }
}
