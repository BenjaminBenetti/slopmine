import type { IItem } from '../items/Item.ts'

export interface IToolbarState {
  readonly size: number
  readonly slots: ReadonlyArray<IItem | null>
  readonly selectedIndex: number

  getItem(index: number): IItem | null
  selectSlot(index: number): void
  setItem(index: number, item: IItem | null): void
  clearSlot(index: number): void
  moveItem(fromIndex: number, toIndex: number): void
}

/**
 * Simple toolbar implementation for a fixed number of slots.
 * Handles add/remove/move operations and a currently selected slot.
 */
export class ToolbarState implements IToolbarState {
  private readonly sizeInternal: number
  private readonly slotsInternal: (IItem | null)[]
  private selectedIndexInternal = 0

  constructor(size = 10) {
    if (size <= 0) {
      throw new Error('Toolbar size must be positive')
    }
    this.sizeInternal = size
    this.slotsInternal = new Array<IItem | null>(size).fill(null)
  }

  get size(): number {
    return this.sizeInternal
  }

  get slots(): ReadonlyArray<IItem | null> {
    return this.slotsInternal
  }

  get selectedIndex(): number {
    return this.selectedIndexInternal
  }

  private assertIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.sizeInternal) {
      throw new Error(`Toolbar index out of range: ${index}`)
    }
  }

  getItem(index: number): IItem | null {
    this.assertIndex(index)
    return this.slotsInternal[index]
  }

  selectSlot(index: number): void {
    this.assertIndex(index)
    this.selectedIndexInternal = index
  }

  setItem(index: number, item: IItem | null): void {
    this.assertIndex(index)
    this.slotsInternal[index] = item
  }

  clearSlot(index: number): void {
    this.setItem(index, null)
  }

  moveItem(fromIndex: number, toIndex: number): void {
    this.assertIndex(fromIndex)
    this.assertIndex(toIndex)
    if (fromIndex === toIndex) return

    const fromItem = this.slotsInternal[fromIndex]
    const toItem = this.slotsInternal[toIndex]
    this.slotsInternal[toIndex] = fromItem
    this.slotsInternal[fromIndex] = toItem
  }
}

export interface IInventoryGridState {
  readonly width: number
  readonly height: number
  readonly slots: ReadonlyArray<IItem | null>

  getItem(index: number): IItem | null
  setItem(index: number, item: IItem | null): void
  clearSlot(index: number): void
  moveItem(fromIndex: number, toIndex: number): void
}

export class InventoryGridState implements IInventoryGridState {
  private readonly widthInternal: number
  private readonly heightInternal: number
  private readonly slotsInternal: (IItem | null)[]

  constructor(width: number, height: number) {
    if (width <= 0 || height <= 0) {
      throw new Error('Inventory dimensions must be positive')
    }
    this.widthInternal = width
    this.heightInternal = height
    this.slotsInternal = new Array<IItem | null>(width * height).fill(null)
  }

  get width(): number {
    return this.widthInternal
  }

  get height(): number {
    return this.heightInternal
  }

  get slots(): ReadonlyArray<IItem | null> {
    return this.slotsInternal
  }

  private assertIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.slotsInternal.length) {
      throw new Error(`Inventory index out of range: ${index}`)
    }
  }

  getItem(index: number): IItem | null {
    this.assertIndex(index)
    return this.slotsInternal[index]
  }

  setItem(index: number, item: IItem | null): void {
    this.assertIndex(index)
    this.slotsInternal[index] = item
  }

  clearSlot(index: number): void {
    this.setItem(index, null)
  }

  moveItem(fromIndex: number, toIndex: number): void {
    this.assertIndex(fromIndex)
    this.assertIndex(toIndex)
    if (fromIndex === toIndex) return

    const fromItem = this.slotsInternal[fromIndex]
    const toItem = this.slotsInternal[toIndex]
    this.slotsInternal[toIndex] = fromItem
    this.slotsInternal[fromIndex] = toItem
  }
}

export interface PlayerInventoryState {
  toolbar: IToolbarState
  inventory: IInventoryGridState
}

export interface IPlayerState {
  readonly inventory: PlayerInventoryState

  /**
   * Try to add an item to the player's inventory.
   * Tries toolbar first, then main inventory.
   * @returns true if item was added, false if inventory is full
   */
  addItem(item: IItem): boolean
}

/**
 * Basic player state container. Extend with health, position, etc. as needed.
 */
export class PlayerState implements IPlayerState {
  readonly inventory: PlayerInventoryState

  constructor(toolbarSize = 10, inventoryWidth = 10, inventoryHeight = 8) {
    this.inventory = {
      toolbar: new ToolbarState(toolbarSize),
      inventory: new InventoryGridState(inventoryWidth, inventoryHeight),
    }
  }

  /**
   * Try to add an item to the player's inventory.
   * Tries toolbar first, then main inventory.
   * @returns true if item was added, false if inventory is full
   */
  addItem(item: IItem): boolean {
    // Try toolbar first
    for (let i = 0; i < this.inventory.toolbar.size; i++) {
      if (this.inventory.toolbar.getItem(i) === null) {
        this.inventory.toolbar.setItem(i, item)
        return true
      }
    }

    // Try main inventory
    const invSize = this.inventory.inventory.slots.length
    for (let i = 0; i < invSize; i++) {
      if (this.inventory.inventory.getItem(i) === null) {
        this.inventory.inventory.setItem(i, item)
        return true
      }
    }

    return false
  }
}

