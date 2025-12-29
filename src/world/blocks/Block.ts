import * as THREE from 'three'
import type { IBlock, IBlockProperties, BlockFace, IWorld } from '../interfaces/IBlock.ts'
import { AIR_BLOCK_ID } from '../interfaces/IBlock.ts'

/**
 * Shared geometry for all block meshes.
 */
const sharedBlockGeometry = new THREE.BoxGeometry(1, 1, 1)

/**
 * Abstract base block class implementing common functionality.
 * Uses flyweight pattern - block instances are stateless singletons.
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
   * Get materials for each face. Override for multi-textured blocks.
   * Order: +X, -X, +Y, -Y, +Z, -Z
   */
  protected getMaterials(): THREE.Material | THREE.Material[] {
    return new THREE.MeshLambertMaterial({ color: this.getColor() })
  }

  /**
   * Create a mesh for this block.
   */
  createMesh(): THREE.Mesh | null {
    if (!this.properties.isSolid && this.properties.id === AIR_BLOCK_ID) {
      return null
    }
    return new THREE.Mesh(sharedBlockGeometry, this.getMaterials())
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

  onPlace?(_world: IWorld, _x: bigint, _y: bigint, _z: bigint): void
  onBreak?(_world: IWorld, _x: bigint, _y: bigint, _z: bigint): void
  onNeighborChange?(_world: IWorld, _x: bigint, _y: bigint, _z: bigint, _face: BlockFace): void
}

/**
 * Air block - the default empty block.
 */
export class AirBlock extends Block {
  readonly properties: IBlockProperties = {
    id: AIR_BLOCK_ID,
    name: 'air',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0,
    lightLevel: 0,
    lightBlocking: 0,
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
    if (neighbor.properties.id === AIR_BLOCK_ID) {
      return true
    }

    return neighbor.properties.id !== this.properties.id
  }
}
