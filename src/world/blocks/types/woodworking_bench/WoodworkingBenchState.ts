import type { ITickableBlockState } from '../../../blockstate/interfaces/ITickableBlockState.ts'
import type { IItemStack } from '../../../../player/PlayerState.ts'
import type { IWorldCoordinate } from '../../../interfaces/ICoordinates.ts'
import type { IWoodworkingRecipe } from '../../../../woodworking/interfaces/IWoodworkingRecipe.ts'
import { woodworkingRegistry } from '../../../../woodworking/index.ts'

/**
 * Runtime state for a placed woodworking bench block.
 * Manages input slot and output slots.
 * Crafting is instant when the player clicks the craft button.
 */
export class WoodworkingBenchState implements ITickableBlockState {
  readonly position: IWorldCoordinate

  // Inventory: 1 input slot + 3 output slots
  private inputSlot: IItemStack | null = null
  private readonly outputSlots: (IItemStack | null)[] = [null, null, null]

  constructor(position: IWorldCoordinate) {
    this.position = position
  }

  get isActive(): boolean {
    // Woodworking bench doesn't need ticking - crafting is instant
    return false
  }

  /**
   * Called each game tick - not used for woodworking bench.
   */
  tick(_deltaTime: number): boolean {
    return this.isActive
  }

  /**
   * Get available recipes based on current input.
   */
  getAvailableRecipes(): IWoodworkingRecipe[] {
    if (!this.inputSlot) return []
    return woodworkingRegistry.getRecipesForInput(this.inputSlot.item.id)
  }

  /**
   * Check if a recipe can be crafted with current input and output space.
   */
  canCraft(recipe: IWoodworkingRecipe): boolean {
    // Check if we have enough input
    if (!this.inputSlot) return false
    if (this.inputSlot.item.id !== recipe.inputItemId) return false
    if (this.inputSlot.count < recipe.inputCount) return false

    // Check if output has space
    return this.canAddToOutput(recipe.createResult(), recipe.resultCount)
  }

  /**
   * Execute a craft operation.
   * Returns true if crafting succeeded.
   */
  craft(recipe: IWoodworkingRecipe): boolean {
    if (!this.canCraft(recipe)) return false

    // Consume input
    this.inputSlot!.count -= recipe.inputCount
    if (this.inputSlot!.count <= 0) {
      this.inputSlot = null
    }

    // Add result to output
    const result = recipe.createResult()
    let remaining = recipe.resultCount

    // First try to add to existing stacks
    for (let i = 0; i < this.outputSlots.length && remaining > 0; i++) {
      const slot = this.outputSlots[i]
      if (slot && slot.item.id === result.id) {
        const space = slot.item.maxStackSize - slot.count
        const toAdd = Math.min(space, remaining)
        slot.count += toAdd
        remaining -= toAdd
      }
    }

    // Then add to empty slots
    for (let i = 0; i < this.outputSlots.length && remaining > 0; i++) {
      if (!this.outputSlots[i]) {
        const toAdd = Math.min(result.maxStackSize, remaining)
        this.outputSlots[i] = { item: recipe.createResult(), count: toAdd }
        remaining -= toAdd
      }
    }

    return true
  }

  /**
   * Check if we can add an item to output slots.
   */
  private canAddToOutput(item: { id: string; maxStackSize: number }, count: number): boolean {
    let remaining = count

    // First check for existing stacks
    for (const slot of this.outputSlots) {
      if (slot && slot.item.id === item.id) {
        const space = slot.item.maxStackSize - slot.count
        remaining -= space
        if (remaining <= 0) return true
      }
    }

    // Then check for empty slots
    for (const slot of this.outputSlots) {
      if (!slot) {
        remaining -= item.maxStackSize
        if (remaining <= 0) return true
      }
    }

    return remaining <= 0
  }

  // Slot accessors for UI (slot indices: 0 = input, 1-3 = output)

  getSlotCount(): number {
    return 4 // 1 input + 3 output
  }

  getStack(index: number): IItemStack | null {
    if (index === 0) return this.inputSlot
    if (index >= 1 && index <= 3) return this.outputSlots[index - 1]
    return null
  }

  setStack(index: number, stack: IItemStack | null): void {
    if (index === 0) {
      this.inputSlot = stack
    } else if (index >= 1 && index <= 3) {
      this.outputSlots[index - 1] = stack
    }
  }

  getInputStack(): IItemStack | null {
    return this.inputSlot
  }

  setInputStack(stack: IItemStack | null): void {
    this.inputSlot = stack
  }

  getOutputStack(index: number): IItemStack | null {
    if (index < 0 || index >= 3) return null
    return this.outputSlots[index]
  }

  setOutputStack(index: number, stack: IItemStack | null): void {
    if (index >= 0 && index < 3) {
      this.outputSlots[index] = stack
    }
  }

  /**
   * Get all items to drop when the workbench is broken.
   */
  getAllItems(): IItemStack[] {
    const items: IItemStack[] = []
    if (this.inputSlot) items.push(this.inputSlot)
    for (const stack of this.outputSlots) {
      if (stack) items.push(stack)
    }
    return items
  }

  onDestroy(): void {
    // Items would be dropped here - handled by caller
  }
}
