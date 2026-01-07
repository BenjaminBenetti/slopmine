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
}

/**
 * Factory function type for creating block UIs.
 */
export type BlockUIFactory<TState> = (state: TState) => IBlockUI
