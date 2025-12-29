import type { InventoryUI } from '../ui/Inventory.ts'
import type { IInventoryGridState } from './PlayerState.ts'
import type { CameraControls } from './FirstPersonCameraControls.ts'

export interface InventoryInput {
  dispose(): void
}

  /**
   * Handles input for the full inventory UI:
   * - Press 'I' (while pointer locked) to toggle open/closed
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
  private readonly cameraControls: CameraControls

  private pointerLocked = false

  constructor(
    domElement: HTMLElement,
    inventoryUI: InventoryUI,
    inventoryState: IInventoryGridState,
    cameraControls: CameraControls,
  ) {
    this.domElement = domElement
    this.inventoryUI = inventoryUI
    this.inventoryState = inventoryState
    this.cameraControls = cameraControls

    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    window.addEventListener('keydown', this.onKeyDown)
  }

  private onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.domElement
  }

  private onKeyDown = (event: KeyboardEvent): void => {
	    // Ignore input completely when the game is not focused on the canvas
	    // and the inventory is not open. Once the inventory is open we still
	    // want ESC / 'I' to work even though pointer lock has been released.
	    if (!this.pointerLocked && !this.inventoryUI.isOpen) return

    // Avoid conflicting with browser/system shortcuts
    if (event.altKey || event.ctrlKey || event.metaKey) return

    if (event.code === 'KeyI') {
      event.preventDefault()
      this.toggleInventory()
    } else if (event.code === 'Escape' && this.inventoryUI.isOpen) {
      event.preventDefault()
      this.closeInventory()
    }
  }

  private toggleInventory(): void {
    if (this.inventoryUI.isOpen) {
      this.closeInventory()
    } else {
      this.openInventory()
    }
  }

  private openInventory(): void {
    this.inventoryUI.open()
    this.cameraControls.setInputEnabled(false)
	
	    // Release pointer lock so the mouse becomes visible while
	    // the inventory is open.
	    if (document.pointerLockElement === this.domElement) {
	      document.exitPointerLock()
	    }
  }

  private closeInventory(): void {
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
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    window.removeEventListener('keydown', this.onKeyDown)
  }
}

