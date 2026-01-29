import * as THREE from 'three'
import type { IBlockProperties, IWorld, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IBlockState } from '../../../blockstate/interfaces/IBlockState.ts'
import type { IWorldCoordinate } from '../../../interfaces/ICoordinates.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { WoodworkingBenchBlockItem } from '../../../../items/blocks/woodworking_bench/WoodworkingBenchBlockItem.ts'
import { WoodworkingBenchState } from './WoodworkingBenchState.ts'
import { BlockStateManager } from '../../../blockstate/BlockStateManager.ts'
import { BlockTickManager } from '../../../blockstate/BlockTickManager.ts'
import { deleteBlockStateFromPersistence } from '../../../../persistence/index.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'

import woodworkingBenchFrontTexUrl from './assets/woodworking-bench-front.webp'
import woodworkingBenchSideTexUrl from './assets/woodworking-bench-side.webp'
import woodworkingBenchTopTexUrl from './assets/woodworking-bench-top.webp'

// Register textures for atlas
registerTextureUrl(TextureId.WOODWORKING_BENCH_FRONT, woodworkingBenchFrontTexUrl)
registerTextureUrl(TextureId.WOODWORKING_BENCH_SIDE, woodworkingBenchSideTexUrl)
registerTextureUrl(TextureId.WOODWORKING_BENCH_TOP, woodworkingBenchTopTexUrl)

const woodworkingBenchFrontTexture = loadBlockTexture(woodworkingBenchFrontTexUrl)
const woodworkingBenchSideTexture = loadBlockTexture(woodworkingBenchSideTexUrl)
const woodworkingBenchTopTexture = loadBlockTexture(woodworkingBenchTopTexUrl)

const woodworkingBenchFrontMaterial = new THREE.MeshLambertMaterial({ map: woodworkingBenchFrontTexture })
const woodworkingBenchSideMaterial = new THREE.MeshLambertMaterial({ map: woodworkingBenchSideTexture })
const woodworkingBenchTopMaterial = new THREE.MeshLambertMaterial({ map: woodworkingBenchTopTexture })

// Reference to the block tick manager - set during initialization
let blockTickManager: BlockTickManager | null = null

/**
 * Set the block tick manager reference for woodworking bench blocks.
 * Call this during game initialization.
 */
export function setWoodworkingBenchBlockTickManager(manager: BlockTickManager): void {
  blockTickManager = manager
}

/**
 * Woodworking Bench block for processing wood into planks and other wood products.
 *
 * Interactable: Press E to open woodworking UI.
 * Contains 1 input slot and 3 output slots.
 * Crafting is instant - click to craft.
 */
export class WoodworkingBenchBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.WOODWORKING_BENCH,
    name: 'woodworking_bench',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 2.5,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 1,
    tags: [BlockTags.WOOD],
  }

  /** Mark this block as interactable */
  readonly isInteractable = true

  protected get defaultTextureId(): number {
    return TextureId.WOODWORKING_BENCH_FRONT
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [
      woodworkingBenchSideMaterial,  // +X (right) - side
      woodworkingBenchSideMaterial,  // -X (left) - side
      woodworkingBenchTopMaterial,   // +Y (top)
      woodworkingBenchTopMaterial,   // -Y (bottom)
      woodworkingBenchFrontMaterial, // +Z (front) - front with tools
      woodworkingBenchSideMaterial,  // -Z (back) - side
    ]
  }

  /**
   * Return texture ID for each face for greedy meshing.
   * TOP=0, BOTTOM=1, NORTH=2, SOUTH=3, EAST=4, WEST=5
   */
  getTextureForFace(face: BlockFace): number {
    switch (face) {
      case 0: // TOP
      case 1: // BOTTOM
        return TextureId.WOODWORKING_BENCH_TOP
      case 3: // SOUTH (+Z) - front with tools
        return TextureId.WOODWORKING_BENCH_FRONT
      default:
        return TextureId.WOODWORKING_BENCH_SIDE
    }
  }

  getDrops(): IItem[] {
    return [new WoodworkingBenchBlockItem()]
  }

  /**
   * Woodworking bench blocks use instanced rendering (not greedy meshing) to support rotation.
   */
  isGreedyMeshable(): boolean {
    return false
  }

  /**
   * Create a block state instance for this woodworking bench.
   * Used by the persistence system for deserialization.
   */
  createState(position: IWorldCoordinate): IBlockState {
    return new WoodworkingBenchState(position)
  }

  /**
   * Called when this block is placed.
   * Creates a WoodworkingBenchState for this position.
   */
  onPlace(_world: IWorld, x: bigint, y: bigint, z: bigint): void {
    const position = { x, y, z }
    const state = this.createState(position) as WoodworkingBenchState
    BlockStateManager.getInstance().setState(position, state)

    // Register with tick manager if available (though we don't tick)
    if (blockTickManager) {
      blockTickManager.register(state)
    }
  }

  /**
   * Called when this block is loaded from persistence.
   * Creates a WoodworkingBenchState for this position (same as onPlace).
   */
  onLoad(_world: IWorld, x: bigint, y: bigint, z: bigint): void {
    const position = { x, y, z }

    // Skip if state already exists (shouldn't happen, but defensive)
    if (BlockStateManager.getInstance().hasState(position)) {
      return
    }

    const state = this.createState(position) as WoodworkingBenchState
    BlockStateManager.getInstance().setState(position, state)

    // Register with tick manager if available
    if (blockTickManager) {
      blockTickManager.register(state)
    }
  }

  /**
   * Called when this block is broken.
   * Removes the WoodworkingBenchState and drops contained items.
   */
  onBreak(_world: IWorld, x: bigint, y: bigint, z: bigint): void {
    const position = { x, y, z }
    const state = BlockStateManager.getInstance().getState<WoodworkingBenchState>(position)

    if (state) {
      // Unregister from tick manager
      if (blockTickManager) {
        blockTickManager.unregister(state)
      }

      // TODO: Drop contained items
      // const items = state.getAllItems()
      // items.forEach(stack => dropItemAtPosition(world, x, y, z, stack))

      BlockStateManager.getInstance().removeState(position)
    }

    // Delete persisted block state (fire and forget)
    deleteBlockStateFromPersistence(x, y, z)
  }
}
