import type { ITickableBlockState } from '../../../blockstate/interfaces/ITickableBlockState.ts'
import type { IItemStack } from '../../../../player/PlayerState.ts'
import type { IWorldCoordinate } from '../../../interfaces/ICoordinates.ts'
import type { IItem } from '../../../../items/Item.ts'
import { smeltingRegistry } from '../../../../smelting/index.ts'
import { getFuelValue, isFuel } from '../../../../smelting/SmeltingConfig.ts'

/**
 * Runtime state for a placed forge block.
 * Manages ore input slots, fuel slot, and output slots.
 * Processes smelting in background.
 */
export class ForgeBlockState implements ITickableBlockState {
  readonly position: IWorldCoordinate

  // Inventory: 3 ore input slots + 1 fuel slot + 3 output slots
  private readonly oreSlots: (IItemStack | null)[] = [null, null, null]
  private fuelSlot: IItemStack | null = null
  private readonly outputSlots: (IItemStack | null)[] = [null, null, null]

  // Smelting progress (0 to smeltTime)
  private currentSmeltProgress = 0
  private currentSmeltTime = 0

  // Fuel progress (remaining items that can be smelted with current fuel)
  private currentFuelRemaining = 0 // How many more items current fuel can smelt
  private currentFuelTotal = 0 // Total items the current fuel could smelt (for progress bar)

  // Track which ore slot is being smelted
  private activeOreSlot = -1

  constructor(position: IWorldCoordinate) {
    this.position = position
  }

  get isActive(): boolean {
    // Always stay active while the forge exists - we need to check for new items
    // The tick method will early-return if there's nothing to do
    return true
  }

  /**
   * Called each game tick to progress smelting.
   */
  tick(deltaTime: number): boolean {
    // Early exit if no fuel and nothing to smelt
    const hasFuel = this.fuelSlot !== null || this.currentFuelRemaining > 0
    const hasOre = this.oreSlots.some(s => s !== null)
    if (!hasFuel && !hasOre) {
      return true // Stay registered but do nothing
    }

    // If fuel is burning but no active smelt, try to start one
    if (this.currentFuelRemaining > 0 && this.activeOreSlot < 0) {
      this.tryStartSmelting()
    }

    // If no fuel burning, try to consume fuel
    if (this.currentFuelRemaining <= 0 && this.canStartSmelting()) {
      this.tryConsumeFuel()
      if (this.currentFuelRemaining > 0) {
        this.tryStartSmelting()
      }
    }

    // Progress active smelting
    if (this.activeOreSlot >= 0 && this.currentFuelRemaining > 0) {
      this.currentSmeltProgress += deltaTime

      // Check if smelting is complete
      if (this.currentSmeltProgress >= this.currentSmeltTime) {
        this.completeSmelting()
        this.currentSmeltProgress = 0
        this.currentSmeltTime = 0
        this.activeOreSlot = -1

        // Consume fuel for this smelt
        this.currentFuelRemaining -= 1

        // Try to start next smelt
        if (this.canStartSmelting()) {
          if (this.currentFuelRemaining <= 0) {
            this.tryConsumeFuel()
          }
          if (this.currentFuelRemaining > 0) {
            this.tryStartSmelting()
          }
        }
      }
    }

    return this.isActive
  }

  /**
   * Check if we can start smelting (have smeltable ore and space for output).
   */
  private canStartSmelting(): boolean {
    for (let i = 0; i < this.oreSlots.length; i++) {
      const oreStack = this.oreSlots[i]
      if (!oreStack) continue

      const recipe = smeltingRegistry.getRecipeForInput(oreStack.item.id)
      if (!recipe) continue

      // Check if output has space
      if (this.canAddToOutput(recipe.createResult(), recipe.resultCount)) {
        return true
      }
    }
    return false
  }

  /**
   * Check if we can add an item to output slots.
   */
  private canAddToOutput(item: IItem, count: number): boolean {
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

  /**
   * Try to consume fuel from the fuel slot.
   */
  private tryConsumeFuel(): void {
    if (!this.fuelSlot) return
    if (!isFuel(this.fuelSlot.item.id)) return

    const fuelValue = getFuelValue(this.fuelSlot.item.id)
    if (fuelValue <= 0) return

    // Consume one fuel item
    this.fuelSlot.count -= 1
    if (this.fuelSlot.count <= 0) {
      this.fuelSlot = null
    }

    this.currentFuelRemaining = fuelValue
    this.currentFuelTotal = fuelValue
  }

  /**
   * Try to start smelting an ore.
   */
  private tryStartSmelting(): void {
    for (let i = 0; i < this.oreSlots.length; i++) {
      const oreStack = this.oreSlots[i]
      if (!oreStack) continue

      const recipe = smeltingRegistry.getRecipeForInput(oreStack.item.id)
      if (!recipe) continue

      // Check if output has space
      if (!this.canAddToOutput(recipe.createResult(), recipe.resultCount)) continue

      // Start smelting this ore
      this.activeOreSlot = i
      this.currentSmeltTime = recipe.smeltTime
      this.currentSmeltProgress = 0
      return
    }
  }

  /**
   * Complete the current smelting operation.
   */
  private completeSmelting(): void {
    if (this.activeOreSlot < 0) return

    const oreStack = this.oreSlots[this.activeOreSlot]
    if (!oreStack) return

    const recipe = smeltingRegistry.getRecipeForInput(oreStack.item.id)
    if (!recipe) return

    // Remove one ore
    oreStack.count -= 1
    if (oreStack.count <= 0) {
      this.oreSlots[this.activeOreSlot] = null
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
        this.outputSlots[i] = { item: result, count: toAdd }
        remaining -= toAdd
      }
    }
  }

  // Slot accessors for UI (slot indices: 0-2 = ore, 3 = fuel, 4-6 = output)

  getSlotCount(): number {
    return 7 // 3 ore + 1 fuel + 3 output
  }

  getStack(index: number): IItemStack | null {
    if (index < 3) return this.oreSlots[index]
    if (index === 3) return this.fuelSlot
    if (index < 7) return this.outputSlots[index - 4]
    return null
  }

  setStack(index: number, stack: IItemStack | null): void {
    if (index < 3) {
      this.oreSlots[index] = stack
    } else if (index === 3) {
      this.fuelSlot = stack
    } else if (index < 7) {
      this.outputSlots[index - 4] = stack
    }
  }

  getOreStack(index: number): IItemStack | null {
    if (index < 0 || index >= 3) return null
    return this.oreSlots[index]
  }

  setOreStack(index: number, stack: IItemStack | null): void {
    if (index >= 0 && index < 3) {
      this.oreSlots[index] = stack
    }
  }

  getFuelStack(): IItemStack | null {
    return this.fuelSlot
  }

  setFuelStack(stack: IItemStack | null): void {
    this.fuelSlot = stack
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

  // Progress getters for UI (returns 0-1)
  getSmeltProgress(): number {
    if (this.currentSmeltTime <= 0) return 0
    return Math.min(1, this.currentSmeltProgress / this.currentSmeltTime)
  }

  getFuelProgress(): number {
    if (this.currentFuelTotal <= 0) return 0
    return Math.min(1, this.currentFuelRemaining / this.currentFuelTotal)
  }

  /**
   * Get all items to drop when the forge is broken.
   */
  getAllItems(): IItemStack[] {
    const items: IItemStack[] = []
    for (const stack of this.oreSlots) {
      if (stack) items.push(stack)
    }
    if (this.fuelSlot) items.push(this.fuelSlot)
    for (const stack of this.outputSlots) {
      if (stack) items.push(stack)
    }
    return items
  }

  onDestroy(): void {
    // Items would be dropped here - handled by caller
  }
}
