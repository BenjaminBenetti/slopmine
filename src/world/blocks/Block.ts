import * as THREE from 'three'
import type { IBlock, IBlockProperties, BlockFace, IWorld } from '../interfaces/IBlock.ts'
import { BlockIds } from './BlockIds.ts'

/**
 * Shared geometry cache for reusable block shapes.
 * Prevents creating duplicate geometries for common shapes.
 */
export const SharedGeometry = {
  /** Standard 1x1x1 cube */
  cube: new THREE.BoxGeometry(1, 1, 1),
  /** Half slab (bottom) */
  slabBottom: new THREE.BoxGeometry(1, 0.5, 1).translate(0, -0.25, 0),
  /** Half slab (top) */
  slabTop: new THREE.BoxGeometry(1, 0.5, 1).translate(0, 0.25, 0),
  /** Cross shape for plants/flowers (two intersecting planes) */
  cross: (() => {
    const geo = new THREE.BufferGeometry()
    const vertices = new Float32Array([
      // First plane (diagonal)
      -0.5, -0.5, -0.5,  0.5, -0.5, 0.5,  0.5, 0.5, 0.5,
      -0.5, -0.5, -0.5,  0.5, 0.5, 0.5,  -0.5, 0.5, -0.5,
      // Second plane (other diagonal)
      -0.5, -0.5, 0.5,  0.5, -0.5, -0.5,  0.5, 0.5, -0.5,
      -0.5, -0.5, 0.5,  0.5, 0.5, -0.5,  -0.5, 0.5, 0.5,
    ])
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
    geo.computeVertexNormals()
    return geo
  })(),
} as const

/**
 * Abstract base block class implementing common functionality.
 * Uses flyweight pattern - block instances are stateless singletons.
 *
 * Override these methods for custom blocks:
 * - getColor(): Change block color
 * - getMaterials(): Multi-textured faces
 * - getGeometry(): Custom shapes (slabs, stairs, plants)
 * - createMesh(): Full control over mesh creation
 */
export abstract class Block implements IBlock {
  abstract readonly properties: IBlockProperties

  /**
   * Default texture ID - subclasses override for multi-textured blocks.
   */
  protected get defaultTextureId(): number {
    return this.properties.id
  }

  /**
   * Get the block color. Override in subclasses for custom colors.
   */
  protected getColor(): number {
    return 0xffffff
  }

  /**
   * Get the geometry for this block. Override for non-cube shapes.
   * Use SharedGeometry for common shapes to save memory.
   */
  protected getGeometry(): THREE.BufferGeometry {
    return SharedGeometry.cube
  }

  /**
   * Get materials for each face. Override for multi-textured blocks.
   * Order: +X, -X, +Y, -Y, +Z, -Z
   */
  protected getMaterials(): THREE.Material | THREE.Material[] {
    return new THREE.MeshLambertMaterial({ color: this.getColor() })
  }

  /**
   * Create a mesh for this block.
   * Combines getGeometry() and getMaterials().
   * Override for fully custom mesh creation.
   */
  createMesh(): THREE.Mesh | null {
    if (!this.properties.isSolid && this.properties.id === BlockIds.AIR) {
      return null
    }
    return new THREE.Mesh(this.getGeometry(), this.getMaterials())
  }

  getTextureForFace(_face: BlockFace): number {
    return this.defaultTextureId
  }

  shouldRenderFace(_face: BlockFace, neighbor: IBlock): boolean {
    if (neighbor.properties.isOpaque) {
      return false
    }
    return true
  }

  getCollisionBox(): THREE.Box3 | null {
    if (!this.properties.isSolid) {
      return null
    }

    return new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 1, 1)
    )
  }

  /**
   * Get material(s) for instanced rendering.
   * By default, returns the same as getMaterials().
   */
  getInstanceMaterial(): THREE.Material | THREE.Material[] {
    return this.getMaterials()
  }

  /**
   * Get geometry for instanced rendering.
   * By default, returns the same as getGeometry().
   */
  getInstanceGeometry(): THREE.BufferGeometry {
    return this.getGeometry()
  }

  onPlace?(_world: IWorld, _x: bigint, _y: bigint, _z: bigint): void
  onBreak?(_world: IWorld, _x: bigint, _y: bigint, _z: bigint): void
  onNeighborChange?(_world: IWorld, _x: bigint, _y: bigint, _z: bigint, _face: BlockFace): void
}

/**
 * Air block - the default empty block.
 */
export class AirBlock extends Block {
  readonly properties: IBlockProperties = {
    id: BlockIds.AIR,
    name: 'air',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  shouldRenderFace(): boolean {
    return false
  }

  createMesh(): THREE.Mesh | null {
    return null
  }
}

/**
 * Base class for standard solid blocks (stone, dirt, etc.)
 */
export abstract class SolidBlock extends Block {
  shouldRenderFace(_face: BlockFace, neighbor: IBlock): boolean {
    return !neighbor.properties.isOpaque
  }
}

/**
 * Base class for transparent blocks (glass, leaves, water)
 */
export abstract class TransparentBlock extends Block {
  shouldRenderFace(_face: BlockFace, neighbor: IBlock): boolean {
    if (neighbor.properties.id === BlockIds.AIR) {
      return true
    }

    return neighbor.properties.id !== this.properties.id
  }
}
