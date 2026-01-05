import * as THREE from 'three'
import type { BlockId } from '../world/interfaces/IBlock.ts'
import type { WorldManager } from '../world/WorldManager.ts'
import type { IPlayerState } from './PlayerState.ts'
import { BlockRaycaster, type IBlockRaycastHit } from './BlockRaycaster.ts'
import { MiningOverlay } from '../renderer/MiningOverlay.ts'
import { BlockIds } from '../world/blocks/BlockIds.ts'
import { calculateMiningDamage } from './MiningDamage.ts'
import { hasToolStats, HAND_STATS } from '../items/interfaces/IToolStats.ts'

/** Maximum reach distance for block interaction */
const MAX_REACH_DISTANCE = 5

/**
 * Tracks the current mining progress.
 */
interface IMiningProgress {
  worldX: bigint
  worldY: bigint
  worldZ: bigint
  blockId: BlockId
  progress: number
  requiredTime: number
}

/**
 * Configuration for block interaction.
 */
export interface IBlockInteractionConfig {
  maxReachDistance?: number
  /** Called after items are collected from a broken block */
  onItemsCollected?: () => void
}

/**
 * Handles player interaction with blocks (breaking).
 * Coordinates raycasting, mining progress, visual feedback, and item drops.
 */
export class BlockInteraction {
  private readonly camera: THREE.PerspectiveCamera
  private readonly worldManager: WorldManager
  private readonly playerState: IPlayerState
  private readonly raycaster: BlockRaycaster
  private readonly miningOverlay: MiningOverlay
  private readonly domElement: HTMLElement

  private readonly maxReachDistance: number
  private readonly onItemsCollected?: () => void

  private isMouseDown = false
  private currentMining: IMiningProgress | null = null

  constructor(
    camera: THREE.PerspectiveCamera,
    worldManager: WorldManager,
    playerState: IPlayerState,
    scene: THREE.Scene,
    domElement: HTMLElement,
    config: IBlockInteractionConfig = {}
  ) {
    this.camera = camera
    this.worldManager = worldManager
    this.playerState = playerState
    this.domElement = domElement

    this.maxReachDistance = config.maxReachDistance ?? MAX_REACH_DISTANCE
    this.onItemsCollected = config.onItemsCollected

    this.raycaster = new BlockRaycaster(worldManager)
    this.miningOverlay = new MiningOverlay(scene)

    this.setupEventListeners()
  }

  /**
   * Update mining progress. Call this every frame.
   * @param deltaTime - Time since last frame in seconds
   */
  update(deltaTime: number): void {
    if (!this.isMouseDown) {
      return
    }

    // Only process when pointer is locked (in-game)
    if (document.pointerLockElement !== this.domElement) {
      this.cancelMining()
      return
    }

    // Perform raycast to find target block
    const hit = this.raycaster.castFromCamera(this.camera, this.maxReachDistance)

    if (!hit) {
      // No block in range
      this.cancelMining()
      return
    }

    // Check if we're still targeting the same block
    if (this.currentMining) {
      if (
        hit.worldX !== this.currentMining.worldX ||
        hit.worldY !== this.currentMining.worldY ||
        hit.worldZ !== this.currentMining.worldZ
      ) {
        // Target changed, restart mining
        this.startMining(hit)
        return
      }
    } else {
      // Start mining new block
      this.startMining(hit)
      return
    }

    // Continue mining
    this.updateMining(deltaTime)
  }

  /**
   * Check if the player is performing a mining action (left mouse down).
   * Returns true when left mouse is down and pointer is locked,
   * regardless of whether a block is being targeted.
   */
  isMining(): boolean {
    return this.isMouseDown && document.pointerLockElement === this.domElement
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    this.removeEventListeners()
    this.miningOverlay.dispose()
  }

  private setupEventListeners(): void {
    this.domElement.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('mouseup', this.onMouseUp)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
  }

  private removeEventListeners(): void {
    this.domElement.removeEventListener('mousedown', this.onMouseDown)
    window.removeEventListener('mouseup', this.onMouseUp)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
  }

  private onMouseDown = (event: MouseEvent): void => {
    // Only handle left mouse button
    if (event.button !== 0) return

    // Only handle when pointer is locked
    if (document.pointerLockElement !== this.domElement) return

    this.isMouseDown = true
  }

  private onMouseUp = (event: MouseEvent): void => {
    // Only handle left mouse button
    if (event.button !== 0) return

    this.isMouseDown = false
    this.cancelMining()
  }

  private onPointerLockChange = (): void => {
    // Cancel mining if pointer lock is released
    if (document.pointerLockElement !== this.domElement) {
      this.isMouseDown = false
      this.cancelMining()
    }
  }

  private startMining(hit: IBlockRaycastHit): void {
    // Get currently held item's tool stats
    const selectedIndex = this.playerState.inventory.toolbar.selectedIndex
    const heldItem = this.playerState.inventory.toolbar.getItem(selectedIndex)
    const toolStats = heldItem && hasToolStats(heldItem) ? heldItem.toolStats : HAND_STATS

    // Calculate mining result based on tool vs block
    const miningResult = calculateMiningDamage(hit.block, toolStats)

    // Cannot mine this block with current tool
    if (!miningResult.canMine) {
      this.currentMining = null
      return
    }

    this.currentMining = {
      worldX: hit.worldX,
      worldY: hit.worldY,
      worldZ: hit.worldZ,
      blockId: hit.blockId,
      progress: 0,
      requiredTime: miningResult.miningTime,
    }

    // Show overlay at block position
    this.miningOverlay.show(
      Number(hit.worldX),
      Number(hit.worldY),
      Number(hit.worldZ),
      0
    )
  }

  private updateMining(deltaTime: number): void {
    if (!this.currentMining) return

    // Increase progress based on time
    this.currentMining.progress += deltaTime / this.currentMining.requiredTime

    // Update visual overlay
    this.miningOverlay.show(
      Number(this.currentMining.worldX),
      Number(this.currentMining.worldY),
      Number(this.currentMining.worldZ),
      this.currentMining.progress
    )

    // Check if mining is complete
    if (this.currentMining.progress >= 1.0) {
      this.completeMining()
    }
  }

  private completeMining(): void {
    if (!this.currentMining) return

    const { worldX, worldY, worldZ } = this.currentMining
    const block = this.worldManager.getBlock(worldX, worldY, worldZ)

    // Get drops from block and add to inventory
    const drops = block.getDrops?.() ?? []
    for (const item of drops) {
      this.playerState.addItem(item)
    }

    // Notify listeners that items were collected
    if (drops.length > 0) {
      this.onItemsCollected?.()
    }

    // Set block to air (automatically queues affected sub-chunk for remeshing)
    this.worldManager.setBlock(worldX, worldY, worldZ, BlockIds.AIR)

    // Hide overlay and reset state
    this.miningOverlay.hide()
    this.currentMining = null
  }

  private cancelMining(): void {
    if (this.currentMining) {
      this.miningOverlay.hide()
      this.currentMining = null
    }
  }
}
