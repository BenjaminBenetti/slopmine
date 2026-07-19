import * as THREE from 'three'
import type { WorldManager } from '../world/WorldManager.ts'
import type { IPlayerState } from './PlayerState.ts'
import type { IPhysicsBody } from '../physics/interfaces/IPhysicsBody.ts'
import type { ItemConsumption } from './ItemConsumption.ts'
import { BlockRaycaster } from './BlockRaycaster.ts'
import { BlockRegistry } from '../world/blocks/BlockRegistry.ts'
import { BlockFace } from '../world/interfaces/IBlock.ts'
import { AABB } from '../physics/collision/AABB.ts'
import { yawToFacing, hitFaceToFacing, setMetadataFacing, setMetadataUses3DRotation, setMetadataFlipped, BlockFacing } from '../world/blocks/BlockFacing.ts'

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

  /** Optional ItemConsumption reference to check if player is consuming */
  private itemConsumption?: ItemConsumption

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

  /**
   * Set the ItemConsumption reference for consumption priority checking.
   * When set, block placement will be skipped if the player is consuming an item.
   */
  setItemConsumption(itemConsumption: ItemConsumption): void {
    this.itemConsumption = itemConsumption
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
    // Skip if player is currently consuming an item
    if (this.itemConsumption?.isConsuming()) return

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

    // Calculate facing direction
    // Surface-attached blocks use the hit face; others use player yaw
    let facing: BlockFacing
    let metadata = 0
    const usesSurfaceFacing = block.usesSurfaceFacing?.() ?? false

    if (usesSurfaceFacing) {
      // Use the face that was clicked - block points away from that surface
      facing = hitFaceToFacing(hit.face)
      // Set the 3D rotation flag so mesh builders know to use full 3D rotation
      metadata = setMetadataUses3DRotation(metadata, true)
    } else {
      // Use player's camera yaw for horizontal facing
      const yaw = this.camera.rotation.y
      facing = yawToFacing(yaw)
    }
    metadata = setMetadataFacing(metadata, facing)

    // Minecraft-style vertical orientation: clicking a block's underside, or
    // the upper half of a side face, places the block upside down
    if (block.supportsVerticalFlip?.()) {
      let flipped = false
      if (hit.face === BlockFace.BOTTOM) {
        flipped = true
      } else if (hit.face !== BlockFace.TOP) {
        // Side face: use where on the face the player clicked
        const faceFraction = hit.point.y - Number(hit.worldY)
        flipped = faceFraction > 0.5
      }
      metadata = setMetadataFlipped(metadata, flipped)
    }

    // Check if the block allows placement (for multi-block structures like beds)
    if (block.canPlace && !block.canPlace(this.worldManager, placePos.x, placePos.y, placePos.z, facing)) {
      return
    }

    // Place the block with facing metadata
    this.worldManager.setBlock(placePos.x, placePos.y, placePos.z, blockId, metadata)

    // Call the block's onPlace hook if it exists
    if (block.onPlace) {
      block.onPlace(this.worldManager, placePos.x, placePos.y, placePos.z, facing)
    }

    // Note: Block entity is created automatically by setBlock() if the block supports it

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

