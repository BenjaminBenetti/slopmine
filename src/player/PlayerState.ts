import type { IItem } from '../items/Item.ts'

/**
 * Represents a stack of items in an inventory slot.
 */
export interface IItemStack {
  readonly item: IItem
  count: number
}

export interface IToolbarState {
  readonly size: number
  readonly slots: ReadonlyArray<IItemStack | null>
  readonly selectedIndex: number

  getStack(index: number): IItemStack | null
  getItem(index: number): IItem | null
  getCount(index: number): number
  selectSlot(index: number): void
  setStack(index: number, stack: IItemStack | null): void
  clearSlot(index: number): void
  moveItem(fromIndex: number, toIndex: number): void
  /** Try to add item to existing stack at index. Returns amount actually added. */
  addToStack(index: number, item: IItem, amount?: number): number
}

/**
 * Simple toolbar implementation for a fixed number of slots.
 * Handles add/remove/move operations and a currently selected slot.
 */
export class ToolbarState implements IToolbarState {
  private readonly sizeInternal: number
  private readonly slotsInternal: (IItemStack | null)[]
  private selectedIndexInternal = 0

  constructor(size = 10) {
    if (size <= 0) {
      throw new Error('Toolbar size must be positive')
    }
    this.sizeInternal = size
    this.slotsInternal = new Array<IItemStack | null>(size).fill(null)
  }

  get size(): number {
    return this.sizeInternal
  }

  get slots(): ReadonlyArray<IItemStack | null> {
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

  getStack(index: number): IItemStack | null {
    this.assertIndex(index)
    return this.slotsInternal[index]
  }

  getItem(index: number): IItem | null {
    this.assertIndex(index)
    return this.slotsInternal[index]?.item ?? null
  }

  getCount(index: number): number {
    this.assertIndex(index)
    return this.slotsInternal[index]?.count ?? 0
  }

  selectSlot(index: number): void {
    this.assertIndex(index)
    this.selectedIndexInternal = index
  }

  setStack(index: number, stack: IItemStack | null): void {
    this.assertIndex(index)
    this.slotsInternal[index] = stack
  }

  clearSlot(index: number): void {
    this.setStack(index, null)
  }

  addToStack(index: number, item: IItem, amount = 1): number {
    this.assertIndex(index)
    const stack = this.slotsInternal[index]

    if (!stack) {
      // Empty slot - create new stack
      const toAdd = Math.min(amount, item.maxStackSize)
      this.slotsInternal[index] = { item, count: toAdd }
      return toAdd
    }

    // Check if items can stack
    if (stack.item.id !== item.id) {
      return 0
    }

    // Add to existing stack
    const spaceLeft = stack.item.maxStackSize - stack.count
    const toAdd = Math.min(amount, spaceLeft)
    stack.count += toAdd
    return toAdd
  }

  moveItem(fromIndex: number, toIndex: number): void {
    this.assertIndex(fromIndex)
    this.assertIndex(toIndex)
    if (fromIndex === toIndex) return

    const fromStack = this.slotsInternal[fromIndex]
    const toStack = this.slotsInternal[toIndex]
    this.slotsInternal[toIndex] = fromStack
    this.slotsInternal[fromIndex] = toStack
  }
}

export interface IInventoryGridState {
  readonly width: number
  readonly height: number
  readonly slots: ReadonlyArray<IItemStack | null>

  getStack(index: number): IItemStack | null
  getItem(index: number): IItem | null
  getCount(index: number): number
  setStack(index: number, stack: IItemStack | null): void
  clearSlot(index: number): void
  moveItem(fromIndex: number, toIndex: number): void
  /** Try to add item to existing stack at index. Returns amount actually added. */
  addToStack(index: number, item: IItem, amount?: number): number
}

export class InventoryGridState implements IInventoryGridState {
  private readonly widthInternal: number
  private readonly heightInternal: number
  private readonly slotsInternal: (IItemStack | null)[]

  constructor(width: number, height: number) {
    if (width <= 0 || height <= 0) {
      throw new Error('Inventory dimensions must be positive')
    }
    this.widthInternal = width
    this.heightInternal = height
    this.slotsInternal = new Array<IItemStack | null>(width * height).fill(null)
  }

  get width(): number {
    return this.widthInternal
  }

  get height(): number {
    return this.heightInternal
  }

  get slots(): ReadonlyArray<IItemStack | null> {
    return this.slotsInternal
  }

  private assertIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.slotsInternal.length) {
      throw new Error(`Inventory index out of range: ${index}`)
    }
  }

  getStack(index: number): IItemStack | null {
    this.assertIndex(index)
    return this.slotsInternal[index]
  }

  getItem(index: number): IItem | null {
    this.assertIndex(index)
    return this.slotsInternal[index]?.item ?? null
  }

  getCount(index: number): number {
    this.assertIndex(index)
    return this.slotsInternal[index]?.count ?? 0
  }

  setStack(index: number, stack: IItemStack | null): void {
    this.assertIndex(index)
    this.slotsInternal[index] = stack
  }

  clearSlot(index: number): void {
    this.setStack(index, null)
  }

  addToStack(index: number, item: IItem, amount = 1): number {
    this.assertIndex(index)
    const stack = this.slotsInternal[index]

    if (!stack) {
      // Empty slot - create new stack
      const toAdd = Math.min(amount, item.maxStackSize)
      this.slotsInternal[index] = { item, count: toAdd }
      return toAdd
    }

    // Check if items can stack
    if (stack.item.id !== item.id) {
      return 0
    }

    // Add to existing stack
    const spaceLeft = stack.item.maxStackSize - stack.count
    const toAdd = Math.min(amount, spaceLeft)
    stack.count += toAdd
    return toAdd
  }

  moveItem(fromIndex: number, toIndex: number): void {
    this.assertIndex(fromIndex)
    this.assertIndex(toIndex)
    if (fromIndex === toIndex) return

    const fromStack = this.slotsInternal[fromIndex]
    const toStack = this.slotsInternal[toIndex]
    this.slotsInternal[toIndex] = fromStack
    this.slotsInternal[fromIndex] = toStack
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
   * @param item The item to add
   * @param amount The number of items to add (default 1)
   * @returns true if all items were added, false if inventory is full
   */
  addItem(item: IItem, amount?: number): boolean
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
   * First tries to stack with existing items, then uses empty slots.
   * Tries toolbar first, then main inventory.
   * @returns true if item was added, false if inventory is full
   */
  addItem(item: IItem, amount = 1): boolean {
    let remaining = amount

    // First pass: try to stack with existing items in toolbar
    for (let i = 0; i < this.inventory.toolbar.size && remaining > 0; i++) {
      const stack = this.inventory.toolbar.getStack(i)
      if (stack && stack.item.id === item.id && stack.count < stack.item.maxStackSize) {
        const added = this.inventory.toolbar.addToStack(i, item, remaining)
        remaining -= added
      }
    }

    // Second pass: try to stack with existing items in main inventory
    const invSize = this.inventory.inventory.slots.length
    for (let i = 0; i < invSize && remaining > 0; i++) {
      const stack = this.inventory.inventory.getStack(i)
      if (stack && stack.item.id === item.id && stack.count < stack.item.maxStackSize) {
        const added = this.inventory.inventory.addToStack(i, item, remaining)
        remaining -= added
      }
    }

    // Third pass: find empty slots in toolbar
    for (let i = 0; i < this.inventory.toolbar.size && remaining > 0; i++) {
      if (this.inventory.toolbar.getStack(i) === null) {
        const added = this.inventory.toolbar.addToStack(i, item, remaining)
        remaining -= added
      }
    }

    // Fourth pass: find empty slots in main inventory
    for (let i = 0; i < invSize && remaining > 0; i++) {
      if (this.inventory.inventory.getStack(i) === null) {
        const added = this.inventory.inventory.addToStack(i, item, remaining)
        remaining -= added
      }
    }

    return remaining === 0
  }
}

