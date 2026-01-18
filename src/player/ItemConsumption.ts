import type { IPlayerState } from './PlayerState.ts'
import type { HeldItemRenderer } from '../renderer/helditem/HeldItemRenderer.ts'
import type { IPlayerHealth } from './PlayerHealth.ts'
import { isConsumable } from '../items/interfaces/IConsumable.ts'

/**
 * Configuration for item consumption.
 */
export interface IItemConsumptionConfig {
  /** Called after an item is consumed and inventory is updated */
  onItemConsumed?: () => void
}

/**
 * Handles player item consumption via right-click hold.
 * Consumable items (food, potions) can be eaten by holding right-click for the consume time.
 */
export class ItemConsumption {
  private readonly domElement: HTMLElement
  private readonly playerState: IPlayerState
  private readonly heldItemRenderer: HeldItemRenderer
  private readonly playerHealth: IPlayerHealth
  private readonly onItemConsumed?: () => void

  /** Whether right mouse button is currently held */
  private isMouseDown = false

  /** Current consumption progress (0.0 to 1.0) */
  private consumptionProgress = 0

  /** The item ID being consumed (to detect item switches) */
  private consumingItemId: string | null = null

  /** The toolbar index when consumption started (to detect slot switches) */
  private consumingSlotIndex = -1

  constructor(
    domElement: HTMLElement,
    playerState: IPlayerState,
    playerHealth: IPlayerHealth,
    heldItemRenderer: HeldItemRenderer,
    config: IItemConsumptionConfig = {}
  ) {
    this.domElement = domElement
    this.playerState = playerState
    this.playerHealth = playerHealth
    this.heldItemRenderer = heldItemRenderer
    this.onItemConsumed = config.onItemConsumed

    this.setupEventListeners()
  }

  /**
   * Update consumption progress. Call this every frame.
   * @param deltaTime - Time since last frame in seconds
   */
  update(deltaTime: number): void {
    if (!this.isMouseDown) {
      return
    }

    // Only process when pointer is locked (in-game)
    if (document.pointerLockElement !== this.domElement) {
      this.cancelConsumption()
      return
    }

    // Get currently held item
    const selectedIndex = this.playerState.inventory.toolbar.selectedIndex
    const stack = this.playerState.inventory.toolbar.getStack(selectedIndex)

    if (!stack) {
      this.cancelConsumption()
      return
    }

    const item = stack.item

    // Check if item is consumable
    if (!isConsumable(item)) {
      this.cancelConsumption()
      return
    }

    // Check if we switched items mid-consumption
    if (this.consumingItemId !== null && this.consumingItemId !== item.id) {
      this.cancelConsumption()
      return
    }

    // Check if we switched slots mid-consumption
    if (this.consumingSlotIndex !== -1 && this.consumingSlotIndex !== selectedIndex) {
      this.cancelConsumption()
      return
    }

    // Start consumption if not already
    if (this.consumingItemId === null) {
      this.consumingItemId = item.id
      this.consumingSlotIndex = selectedIndex
      this.consumptionProgress = 0
    }

    // Update progress
    const consumeTime = item.consumableStats.consumeTime
    this.consumptionProgress += deltaTime / consumeTime

    // Update eating animation
    this.heldItemRenderer.setEating(true)

    // Check if consumption is complete
    if (this.consumptionProgress >= 1.0) {
      this.completeConsumption()
    }
  }

  /**
   * Check if the player is currently consuming an item.
   */
  isConsuming(): boolean {
    return this.consumingItemId !== null && this.isMouseDown
  }

  /**
   * Get the current consumption progress (0.0 to 1.0).
   */
  getConsumptionProgress(): number {
    return this.consumptionProgress
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    this.removeEventListeners()
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
    // Only handle right mouse button (button 2)
    if (event.button !== 2) return

    // Only handle when pointer is locked
    if (document.pointerLockElement !== this.domElement) return

    this.isMouseDown = true
  }

  private onMouseUp = (event: MouseEvent): void => {
    // Only handle right mouse button
    if (event.button !== 2) return

    this.isMouseDown = false
    this.cancelConsumption()
  }

  private onPointerLockChange = (): void => {
    // Cancel consumption if pointer lock is released
    if (document.pointerLockElement !== this.domElement) {
      this.isMouseDown = false
      this.cancelConsumption()
    }
  }

  private completeConsumption(): void {
    const selectedIndex = this.playerState.inventory.toolbar.selectedIndex
    const stack = this.playerState.inventory.toolbar.getStack(selectedIndex)

    if (!stack) {
      this.cancelConsumption()
      return
    }

    const item = stack.item

    if (!isConsumable(item)) {
      this.cancelConsumption()
      return
    }

    // Call the item's onConsume hook with player health for healing
    item.onConsume(this.playerHealth)

    // Decrease stack count
    if (stack.count <= 1) {
      this.playerState.inventory.toolbar.clearSlot(selectedIndex)
    } else {
      stack.count -= 1
    }

    // Notify listeners
    this.onItemConsumed?.()

    // Reset state but keep mouse down for chained consumption
    this.consumingItemId = null
    this.consumingSlotIndex = -1
    this.consumptionProgress = 0
    this.heldItemRenderer.setEating(false)
  }

  private cancelConsumption(): void {
    if (this.consumingItemId !== null) {
      this.heldItemRenderer.setEating(false)
    }
    this.consumingItemId = null
    this.consumingSlotIndex = -1
    this.consumptionProgress = 0
  }
}
