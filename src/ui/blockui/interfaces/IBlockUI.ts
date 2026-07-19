import type { IItem } from '../../../items/Item.ts'
import type { IItemStack } from '../../../player/PlayerState.ts'

/**
 * Interface for block-specific UI panels.
 * Displayed in place of the crafting panel when interacting with a block.
 */
export interface IBlockUI {
  /** Root DOM element */
  readonly root: HTMLDivElement

  /** UI slots for drag-drop integration */
  readonly slots: HTMLDivElement[]

  /** Open the UI and start updates */
  open(): void

  /** Close the UI and stop updates */
  close(): void

  /** Update UI from state (call each frame while open) */
  syncFromState(): void

  /** Clean up resources */
  destroy(): void

  /** Get stack at slot index (for drag-drop) */
  getStack(index: number): IItemStack | null

  /** Set stack at slot index (for drag-drop) */
  setStack(index: number, stack: IItemStack | null): void

  /**
   * Whether ctrl+click quick transfer may place the item into this slot.
   * Omit to accept everything; UIs with special slots (fuel, output) use
   * this to keep transfers out of them. Direct drag-drop is not affected.
   */
  acceptsQuickTransfer?(index: number, item: IItem): boolean
}

/**
 * Factory function type for creating block UIs.
 */
export type BlockUIFactory<TState> = (state: TState) => IBlockUI
