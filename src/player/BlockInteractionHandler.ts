import type * as THREE from 'three'
import type { WorldManager } from '../world/WorldManager.ts'
import type { BlockRaycaster, IBlockRaycastHit } from './BlockRaycaster.ts'
import type { IBlockUI } from '../ui/blockui/interfaces/IBlockUI.ts'
import type { InventoryUI } from '../ui/Inventory.ts'
import type { InventoryInput } from './InventoryInput.ts'
import type { CameraControls } from './FirstPersonCameraControls.ts'
import type { IPlayerState, IInventoryGridState, IToolbarState, IItemStack } from './PlayerState.ts'
import type { ToolbarUI } from '../ui/Toolbar.ts'
import { blockUIRegistry } from '../ui/blockui/BlockUIRegistry.ts'
import { BlockStateManager } from '../world/blockstate/BlockStateManager.ts'
import { createDragDropHandler, type DragDropHandler } from '../ui/DragDropHandler.ts'

const MAX_INTERACTION_DISTANCE = 5

/**
 * Handles E-key interaction with blocks.
 * Opens appropriate UI for interactable blocks.
 */
export class BlockInteractionHandler {
  private readonly domElement: HTMLElement
  private readonly camera: THREE.PerspectiveCamera
  private readonly worldManager: WorldManager
  private readonly raycaster: BlockRaycaster
  private readonly inventoryUI: InventoryUI
  private readonly inventoryInputHandler: InventoryInput
  private readonly toolbarUI: ToolbarUI
  private readonly cameraControls: CameraControls
  private readonly playerState: IPlayerState
  private readonly inventoryState: IInventoryGridState
  private readonly toolbarState: IToolbarState

  // Current block UI state
  private currentBlockUI: IBlockUI | null = null
  private currentHit: IBlockRaycastHit | null = null
  private isBlockUIOpen = false
  private blockUIDragDrop: DragDropHandler | null = null

  // Callback to sync UI after drag-drop
  private onStateChanged: (() => void) | null = null

  private pointerLocked = false

  constructor(options: {
    domElement: HTMLElement
    camera: THREE.PerspectiveCamera
    worldManager: WorldManager
    raycaster: BlockRaycaster
    inventoryUI: InventoryUI
    inventoryInputHandler: InventoryInput
    toolbarUI: ToolbarUI
    cameraControls: CameraControls
    playerState: IPlayerState
    inventoryState: IInventoryGridState
    toolbarState: IToolbarState
    onStateChanged?: () => void
  }) {
    this.domElement = options.domElement
    this.camera = options.camera
    this.worldManager = options.worldManager
    this.raycaster = options.raycaster
    this.inventoryUI = options.inventoryUI
    this.inventoryInputHandler = options.inventoryInputHandler
    this.toolbarUI = options.toolbarUI
    this.cameraControls = options.cameraControls
    this.playerState = options.playerState
    this.inventoryState = options.inventoryState
    this.toolbarState = options.toolbarState
    this.onStateChanged = options.onStateChanged ?? null

    this.setupEventListeners()
  }

  private setupEventListeners(): void {
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    window.addEventListener('keydown', this.onKeyDown)
  }

  private onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.domElement
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    // Only handle E key
    if (event.code !== 'KeyE') return

    // Avoid conflicting with browser/system shortcuts
    if (event.altKey || event.ctrlKey || event.metaKey) return

    // If block UI is open, close it
    if (this.isBlockUIOpen) {
      event.preventDefault()
      this.closeBlockUI()
      return
    }

    // Only open when pointer locked (in game)
    if (!this.pointerLocked) return

    event.preventDefault()
    this.tryOpenBlockUI()
  }

  private tryOpenBlockUI(): void {
    // Raycast to find targeted block
    const hit = this.raycaster.castFromCamera(this.camera, MAX_INTERACTION_DISTANCE)
    if (!hit) return

    // Check if block has a registered UI
    if (!blockUIRegistry.hasUI(hit.blockId)) return

    // Get the block state
    const position = { x: hit.worldX, y: hit.worldY, z: hit.worldZ }
    const state = BlockStateManager.getInstance().getState(position)
    if (!state) return

    // Create the block UI
    const blockUI = blockUIRegistry.createUI(hit.blockId, state)
    if (!blockUI) return

    this.currentBlockUI = blockUI
    this.currentHit = hit
    this.showBlockUI()
  }

  private showBlockUI(): void {
    if (!this.currentBlockUI) return

    this.isBlockUIOpen = true

    // Notify inventory input handler that block UI is taking over
    this.inventoryInputHandler.setBlockUIActive(true)

    // Hide crafting panel
    this.inventoryInputHandler.craftingPanelRoot.style.display = 'none'

    // Add block UI to inventory content wrapper
    this.inventoryUI.contentWrapper.appendChild(this.currentBlockUI.root)

    // Open inventory overlay
    this.inventoryUI.open()
    this.cameraControls.setInputEnabled(false)

    // Open the block UI
    this.currentBlockUI.open()

    // Create drag-drop handler for block UI
    this.blockUIDragDrop = createDragDropHandler({
      toolbarState: this.toolbarState,
      inventoryState: this.inventoryState,
      toolbarRoot: this.toolbarUI.root,
      toolbarSlots: this.toolbarUI.slots,
      inventoryRoot: this.inventoryUI.panel,
      inventorySlots: this.inventoryUI.slots,
      craftingRoot: this.currentBlockUI.root,
      craftingSlots: this.currentBlockUI.slots,
      // Use custom state accessor for block UI
      craftingState: {
        slots: [],
        getStack: (index: number) => this.currentBlockUI?.getStack(index) ?? null,
        setStack: (index: number, stack: IItemStack | null) => this.currentBlockUI?.setStack(index, stack),
        clearSlot: (index: number) => this.currentBlockUI?.setStack(index, null),
      } as any,
      onStateChanged: () => {
        this.syncUI()
        this.onStateChanged?.()
      },
    })
    this.blockUIDragDrop.enable()

    // Sync UI state
    this.syncUI()

    // Release pointer lock
    if (document.pointerLockElement === this.domElement) {
      document.exitPointerLock()
    }
  }

  private syncUI(): void {
    // Sync inventory and toolbar
    this.inventoryUI.syncFromState(this.inventoryState.slots)
    this.toolbarUI.syncFromState(this.toolbarState.slots)

    // Sync block UI
    this.currentBlockUI?.syncFromState()
  }

  closeBlockUI(): void {
    if (!this.isBlockUIOpen) return

    this.isBlockUIOpen = false

    // Disable and dispose drag-drop
    if (this.blockUIDragDrop) {
      this.blockUIDragDrop.disable()
      this.blockUIDragDrop.dispose()
      this.blockUIDragDrop = null
    }

    // Close and destroy block UI
    if (this.currentBlockUI) {
      this.currentBlockUI.close()
      this.currentBlockUI.destroy()
      this.currentBlockUI = null
    }
    this.currentHit = null

    // Show crafting panel
    this.inventoryInputHandler.craftingPanelRoot.style.display = ''

    // Release control back to inventory input handler
    this.inventoryInputHandler.setBlockUIActive(false)

    // Close inventory overlay
    this.inventoryUI.close()
    this.cameraControls.setInputEnabled(true)

    // Re-acquire pointer lock
    if (document.pointerLockElement !== this.domElement) {
      this.domElement.requestPointerLock()
    }
  }

  /**
   * Check if the block UI is currently open.
   */
  get isOpen(): boolean {
    return this.isBlockUIOpen
  }

  /**
   * Update the block UI (call each frame while open).
   */
  update(): void {
    if (this.isBlockUIOpen && this.currentBlockUI) {
      this.currentBlockUI.syncFromState()
    }
  }

  dispose(): void {
    if (this.isBlockUIOpen) {
      this.closeBlockUI()
    }

    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    window.removeEventListener('keydown', this.onKeyDown)
  }
}
