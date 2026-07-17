import type { InventoryUI } from '../ui/Inventory.ts'
import type { ToolbarUI } from '../ui/Toolbar.ts'
import type { IInventoryGridState, IPlayerState, IToolbarState } from './PlayerState.ts'
import type { CameraControls } from './FirstPersonCameraControls.ts'
import { createDragDropHandler, type DragDropHandler } from '../ui/DragDropHandler.ts'
import { CraftingState } from '../crafting/CraftingState.ts'
import { createCraftingPanelUI, type CraftingPanelUI } from '../ui/CraftingPanel.ts'
import { createRecipeBookUI, type RecipeBookUI } from '../ui/RecipeBookUI.ts'
import { createItemFromId } from '../persistence/ItemRegistry.ts'
import type { IRecipe } from '../crafting/RecipeRegistry.ts'

export interface InventoryInput {
  /** The crafting panel root element, for hiding when block UIs are open */
  readonly craftingPanelRoot: HTMLElement
  /** The recipe book UI instance */
  readonly recipeBookUI: RecipeBookUI
  /** Check if a block UI handler has control */
  readonly isBlockUIActive: boolean
  /** Set block UI active state (called by BlockInteractionHandler) */
  setBlockUIActive(active: boolean): void
  /** Whether the inventory overlay is currently open */
  readonly isOpen: boolean
  /** Toggle the inventory open/closed (called by BlockInteractionHandler on 'E') */
  toggleInventory(): void
  dispose(): void
}

  /**
   * Handles input for the full inventory UI:
   * - 'E' toggles it via BlockInteractionHandler (which owns the key
   *   and routes to a block UI instead when targeting an interactable)
   * - Press Escape to close when open
   *
   * When the inventory is open, pointer lock is released so the mouse
   * becomes visible. Closing the inventory acquires pointer lock again
   * so the mouse goes back to controlling the camera.
   */
export class InventoryInputHandler implements InventoryInput {
  private readonly domElement: HTMLElement
  private readonly inventoryUI: InventoryUI
  private readonly inventoryState: IInventoryGridState
  private readonly toolbarUI: ToolbarUI
  private readonly toolbarState: IToolbarState
  private readonly cameraControls: CameraControls
  private readonly playerState: IPlayerState
  private readonly dragDrop: DragDropHandler
  private readonly craftingState: CraftingState
  private readonly craftingPanel: CraftingPanelUI
  private readonly recipeBook: RecipeBookUI

  private pointerLocked = false
  private blockUIActive = false

  /** Expose crafting panel root for BlockInteractionHandler */
  get craftingPanelRoot(): HTMLElement {
    return this.craftingPanel.root
  }

  /** Expose recipe book UI for external access */
  get recipeBookUI(): RecipeBookUI {
    return this.recipeBook
  }

  /** Check if block UI has control of the inventory overlay */
  get isBlockUIActive(): boolean {
    return this.blockUIActive
  }

  /** Whether the inventory overlay is currently open */
  get isOpen(): boolean {
    return this.inventoryUI.isOpen
  }

  /** Set block UI active state */
  setBlockUIActive(active: boolean): void {
    this.blockUIActive = active
    if (active) {
      // Disable our drag-drop when block UI takes over
      this.dragDrop.disable()
      // Hide recipe book and restore inventory view when block UI is active
      this.recipeBook.hide()
      this.inventoryUI.gridContainer.style.display = ''
      this.craftingPanel.root.style.display = 'none' // Block UI replaces crafting panel
      this.inventoryUI.setRecipeBookOpen(false)
    }
  }

  constructor(
    domElement: HTMLElement,
    inventoryUI: InventoryUI,
    inventoryState: IInventoryGridState,
    toolbarUI: ToolbarUI,
    toolbarState: IToolbarState,
    cameraControls: CameraControls,
    playerState: IPlayerState,
  ) {
    this.domElement = domElement
    this.inventoryUI = inventoryUI
    this.inventoryState = inventoryState
    this.toolbarUI = toolbarUI
    this.toolbarState = toolbarState
    this.cameraControls = cameraControls
    this.playerState = playerState

    // Initialize crafting system
    this.craftingState = new CraftingState()
    this.craftingPanel = createCraftingPanelUI()

    // Initialize recipe book with dev mode item adding
    this.recipeBook = createRecipeBookUI({
      onAddItem: (itemId) => {
        const item = createItemFromId(itemId)
        if (item) {
          this.playerState.addItem(item, 1)
          this.syncUI()
        }
      },
    })

    // Append crafting panel to the end of the content wrapper (right side)
    inventoryUI.contentWrapper.appendChild(this.craftingPanel.root)

    // Append recipe book (hidden by default) to the content wrapper
    inventoryUI.contentWrapper.appendChild(this.recipeBook.root)

    // Set up crafting callback
    this.craftingPanel.onCraft((recipe) => this.handleCraft(recipe))

    // Wire up recipe book toggle - completely replace inventory view
    inventoryUI.onRecipeBookToggle((showRecipeBook) => {
      if (showRecipeBook) {
        // Hide inventory grid and crafting panel
        inventoryUI.gridContainer.style.display = 'none'
        this.craftingPanel.root.style.display = 'none'
        this.recipeBook.show()
      } else {
        // Show inventory grid and crafting panel
        this.recipeBook.hide()
        inventoryUI.gridContainer.style.display = ''
        this.craftingPanel.root.style.display = 'flex'
      }
    })

    this.dragDrop = createDragDropHandler({
      toolbarState,
      inventoryState,
      craftingState: this.craftingState,
      toolbarRoot: toolbarUI.root,
      toolbarSlots: toolbarUI.slots,
      inventoryRoot: inventoryUI.panel,
      inventorySlots: inventoryUI.slots,
      craftingRoot: this.craftingPanel.root,
      craftingSlots: this.craftingPanel.craftingSlots,
      onStateChanged: () => this.syncUI(),
    })

    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    window.addEventListener('keydown', this.onKeyDown)
  }

  private syncUI(): void {
    this.inventoryUI.syncFromState(this.inventoryState.slots)
    this.toolbarUI.syncFromState(this.toolbarState.slots)
    this.craftingPanel.syncFromState(this.craftingState.slots)

    // Update craftable recipes list
    const craftable = this.craftingState.getCraftableRecipes()
    this.craftingPanel.updateCraftableList(craftable)
  }

  private handleCraft(recipe: IRecipe): void {
    const result = this.craftingState.craft(recipe)
    if (result) {
      // Add crafted item to player inventory
      this.playerState.addItem(result.item, result.count)
      this.syncUI()
    }
  }

  private returnCraftingItems(): void {
    for (let i = 0; i < this.craftingState.slots.length; i++) {
      const stack = this.craftingState.getStack(i)
      if (stack) {
        this.playerState.addItem(stack.item, stack.count)
        this.craftingState.clearSlot(i)
      }
    }
  }

  private onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.domElement
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    // Don't handle input when block UI has control
    if (this.blockUIActive) return

    // Ignore input completely when the game is not focused on the canvas
    // and the inventory is not open. Once the inventory is open we still
    // want ESC to work even though pointer lock has been released.
    if (!this.pointerLocked && !this.inventoryUI.isOpen) return

    // Avoid conflicting with browser/system shortcuts
    if (event.altKey || event.ctrlKey || event.metaKey) return

    if (event.code === 'Escape' && this.inventoryUI.isOpen) {
      event.preventDefault()
      this.closeInventory()
    }
  }

  toggleInventory(): void {
    if (this.inventoryUI.isOpen) {
      this.closeInventory()
    } else {
      this.openInventory()
    }
  }

  private openInventory(): void {
    this.inventoryUI.open()
    this.cameraControls.setInputEnabled(false)

    // Sync UI state and enable drag-drop
    this.syncUI()
    this.dragDrop.enable()

    // Release pointer lock so the mouse becomes visible while
    // the inventory is open.
    if (document.pointerLockElement === this.domElement) {
      document.exitPointerLock()
    }
  }

  private closeInventory(): void {
    this.dragDrop.disable()

    // Return items from crafting slots to player inventory
    this.returnCraftingItems()
    this.syncUI()

    this.inventoryUI.close()
    this.cameraControls.setInputEnabled(true)

    // Re-acquire pointer lock so the mouse returns to controlling
    // the camera once the inventory is closed. This must be called
    // from an input event handler, which onKeyDown satisfies.
    if (document.pointerLockElement !== this.domElement) {
      this.domElement.requestPointerLock()
    }
  }

  dispose(): void {
    this.returnCraftingItems()
    this.craftingPanel.destroy()
    this.recipeBook.destroy()
    this.dragDrop.dispose()
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    window.removeEventListener('keydown', this.onKeyDown)
  }
}

