import * as THREE from 'three'
import type { WorldManager } from '../world/WorldManager.ts'
import type { IPlayerState } from './PlayerState.ts'
import type { IPhysicsBody } from '../physics/interfaces/IPhysicsBody.ts'
import { BlockRaycaster } from './BlockRaycaster.ts'
import { BlockRegistry } from '../world/blocks/BlockRegistry.ts'
import { BlockFace } from '../world/interfaces/IBlock.ts'
import { AABB } from '../physics/collision/AABB.ts'

/** Maximum reach distance for block placement */
const MAX_REACH_DISTANCE = 5

/**
 * Configuration for block placement.
 */
export interface IBlockPlacementConfig {
  maxReachDistance?: number
  /** Called after a block is placed and inventory is updated */
  onBlockPlaced?: () => void
}

/**
 * Handles player block placement via right-click.
 * Uses raycasting to find target block and places on the hit face.
 */
export class BlockPlacement {
  private readonly camera: THREE.PerspectiveCamera
  private readonly worldManager: WorldManager
  private readonly playerState: IPlayerState
  private readonly playerBody: IPhysicsBody
  private readonly raycaster: BlockRaycaster
  private readonly domElement: HTMLElement

  private readonly maxReachDistance: number
  private readonly onBlockPlaced?: () => void

  constructor(
    camera: THREE.PerspectiveCamera,
    worldManager: WorldManager,
    playerState: IPlayerState,
    playerBody: IPhysicsBody,
    domElement: HTMLElement,
    config: IBlockPlacementConfig = {}
  ) {
    this.camera = camera
    this.worldManager = worldManager
    this.playerState = playerState
    this.playerBody = playerBody
    this.domElement = domElement

    this.maxReachDistance = config.maxReachDistance ?? MAX_REACH_DISTANCE
    this.onBlockPlaced = config.onBlockPlaced

    this.raycaster = new BlockRaycaster(worldManager)

    this.setupEventListeners()
  }

  dispose(): void {
    this.removeEventListeners()
  }

  private setupEventListeners(): void {
    this.domElement.addEventListener('mousedown', this.onMouseDown)
  }

  private removeEventListeners(): void {
    this.domElement.removeEventListener('mousedown', this.onMouseDown)
  }

  private onMouseDown = (event: MouseEvent): void => {
    // Only handle right mouse button (button 2)
    if (event.button !== 2) return

    // Only handle when pointer is locked
    if (document.pointerLockElement !== this.domElement) return

    // Prevent context menu
    event.preventDefault()

    this.tryPlaceBlock()
  }

  private tryPlaceBlock(): void {
    // Get the currently selected item
    const selectedIndex = this.playerState.inventory.toolbar.selectedIndex
    const stack = this.playerState.inventory.toolbar.getStack(selectedIndex)

    if (!stack) return

    // Check if item is a block type (ends with "_block")
    const itemId = stack.item.id
    if (!itemId.endsWith('_block')) return

    // Get the block ID from the item ID
    const blockName = itemId.slice(0, -6) // Remove "_block" suffix
    const block = BlockRegistry.getInstance().getBlockByName(blockName)
    if (!block) return

    const blockId = block.properties.id

    // Raycast to find target block
    const hit = this.raycaster.castFromCamera(this.camera, this.maxReachDistance)
    if (!hit) return

    // Calculate placement position from hit face
    const placePos = this.getPlacementPosition(hit.worldX, hit.worldY, hit.worldZ, hit.face)

    // Check if placement would overlap with player
    if (this.wouldOverlapPlayer(placePos.x, placePos.y, placePos.z)) return

    // Check if the placement position is valid (not already occupied by solid block)
    const existingBlock = this.worldManager.getBlock(placePos.x, placePos.y, placePos.z)
    if (existingBlock.properties.isSolid) return

    // Place the block
    this.worldManager.setBlock(placePos.x, placePos.y, placePos.z, blockId)

    // Decrease item stack count
    if (stack.count <= 1) {
      this.playerState.inventory.toolbar.clearSlot(selectedIndex)
    } else {
      stack.count -= 1
    }

    // Notify listeners
    this.onBlockPlaced?.()
  }

  private getPlacementPosition(
    hitX: bigint,
    hitY: bigint,
    hitZ: bigint,
    face: BlockFace
  ): { x: bigint; y: bigint; z: bigint } {
    // Move one block in the direction of the hit face normal.
    // Note: The raycaster returns face values based on the direction the ray
    // was traveling when it entered the block. The face enum values for
    // EAST/WEST and NORTH/SOUTH are swapped relative to the raycaster's
    // convention, so we invert the offsets for those axes.
    switch (face) {
      case BlockFace.TOP:
        return { x: hitX, y: hitY + 1n, z: hitZ }
      case BlockFace.BOTTOM:
        return { x: hitX, y: hitY - 1n, z: hitZ }
      case BlockFace.NORTH:
        return { x: hitX, y: hitY, z: hitZ - 1n }
      case BlockFace.SOUTH:
        return { x: hitX, y: hitY, z: hitZ + 1n }
      case BlockFace.EAST:
        return { x: hitX - 1n, y: hitY, z: hitZ }
      case BlockFace.WEST:
        return { x: hitX + 1n, y: hitY, z: hitZ }
      default:
        return { x: hitX, y: hitY + 1n, z: hitZ }
    }
  }

  private wouldOverlapPlayer(x: bigint, y: bigint, z: bigint): boolean {
    // Create AABB for the block position
    const blockAABB = AABB.forBlock(Number(x), Number(y), Number(z))

    // Get player AABB
    const playerAABB = this.playerBody.getAABB()

    // Check intersection
    return blockAABB.intersects(playerAABB)
  }
}

