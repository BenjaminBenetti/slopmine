import type { ITickableBlockState } from '../../../blockstate/interfaces/ITickableBlockState.ts'
import type { IItemStack } from '../../../../player/PlayerState.ts'
import type { IWorldCoordinate } from '../../../interfaces/ICoordinates.ts'
import type { IItem } from '../../../../items/Item.ts'
import type { IBrewingRecipe } from '../../../../brewing/interfaces/IBrewingRecipe.ts'
import type { SerializedApothecaryState, SerializedSlot } from '../../../../persistence/PersistenceTypes.ts'
import { brewingRegistry } from '../../../../brewing/index.ts'
import { getFuelValue, isFuel } from '../../../../brewing/BrewingConfig.ts'
import { createItemFromId } from '../../../../persistence/ItemRegistry.ts'

// Local serialization helpers to avoid circular dependency with BlockStateSerializer
function serializeSlotLocal(stack: IItemStack | null): SerializedSlot | null {
  if (!stack) return null
  return { itemId: stack.item.id, count: stack.count }
}

function deserializeSlotLocal(slot: SerializedSlot | null): IItemStack | null {
  if (!slot) return null
  const item = createItemFromId(slot.itemId)
  if (!item) return null
  return { item, count: slot.count }
}

/**
 * Runtime state for a placed apothecary workbench block.
 * Manages ingredient slots (2x2), fuel slot, and output slot.
 * Processes brewing recipes in background.
 */
export class ApothecaryWorkbenchState implements ITickableBlockState {
  readonly position: IWorldCoordinate
  readonly stateType = 'apothecary_workbench'

  // Inventory: 4 ingredient slots (2x2) + 1 fuel slot + 1 output slot
  private readonly ingredientSlots: (IItemStack | null)[] = [null, null, null, null]
  private fuelSlot: IItemStack | null = null
  private outputSlot: IItemStack | null = null

  // Brewing progress (0 to brewTime)
  private currentBrewProgress = 0
  private currentBrewTime = 0

  // Fuel progress (remaining items that can be brewed with current fuel)
  private currentFuelRemaining = 0 // How many more items current fuel can brew
  private currentFuelTotal = 0 // Total items the current fuel could brew (for progress bar)

  // Current recipe being brewed
  private currentRecipe: IBrewingRecipe | null = null

  constructor(position: IWorldCoordinate) {
    this.position = position
  }

  get isActive(): boolean {
    // Always stay active while the workbench exists - we need to check for new items
    // The tick method will early-return if there's nothing to do
    return true
  }

  /**
   * Called each game tick to progress brewing.
   */
  tick(deltaTime: number): boolean {
    // Early exit if no fuel and nothing to brew
    const hasFuel = this.fuelSlot !== null || this.currentFuelRemaining > 0
    const hasIngredients = this.ingredientSlots.some(s => s !== null)
    if (!hasFuel && !hasIngredients) {
      return true // Stay registered but do nothing
    }

    // If fuel is burning but no active brew, try to start one
    if (this.currentFuelRemaining > 0 && !this.currentRecipe) {
      this.tryStartBrewing()
    }

    // If no fuel burning, try to consume fuel
    if (this.currentFuelRemaining <= 0 && this.canStartBrewing()) {
      this.tryConsumeFuel()
      if (this.currentFuelRemaining > 0) {
        this.tryStartBrewing()
      }
    }

    // Progress active brewing
    if (this.currentRecipe && this.currentFuelRemaining > 0) {
      // Check if ANY recipe is still possible - cancel if no ingredients left
      const bestRecipe = this.findMatchingRecipe()
      if (!bestRecipe) {
        // No valid recipe possible - cancel brewing
        this.currentBrewProgress = 0
        this.currentBrewTime = 0
        this.currentRecipe = null
        return this.isActive
      }

      this.currentBrewProgress += deltaTime

      // Check if brewing is complete
      if (this.currentBrewProgress >= this.currentBrewTime) {
        const success = this.completeBrewing()
        this.currentBrewProgress = 0
        this.currentBrewTime = 0
        this.currentRecipe = null

        // Only consume fuel if brewing actually completed
        if (success) {
          this.currentFuelRemaining -= 1
        }

        // Try to start next brew
        if (this.canStartBrewing()) {
          if (this.currentFuelRemaining <= 0) {
            this.tryConsumeFuel()
          }
          if (this.currentFuelRemaining > 0) {
            this.tryStartBrewing()
          }
        }
      }
    }

    return this.isActive
  }

  /**
   * Check if we can start brewing (have valid recipe and space for output).
   */
  private canStartBrewing(): boolean {
    const recipe = this.findMatchingRecipe()
    if (!recipe) {
      return false
    }

    // Check if output has space
    return this.canAddToOutput(recipe.createResult(), recipe.resultCount)
  }

  /**
   * Get a count of each ingredient item ID in the slots.
   */
  private getIngredientCounts(): Map<string, number> {
    const counts = new Map<string, number>()
    for (const stack of this.ingredientSlots) {
      if (stack) {
        counts.set(stack.item.id, (counts.get(stack.item.id) || 0) + stack.count)
      }
    }
    return counts
  }

  /**
   * Find a recipe that can be made with current ingredients.
   * Prioritizes recipes with the most ingredients (most specific match).
   */
  private findMatchingRecipe(): IBrewingRecipe | null {
    const available = this.getIngredientCounts()
    if (available.size === 0) {
      return null
    }

    let bestRecipe: IBrewingRecipe | null = null
    let bestIngredientCount = 0

    for (const recipe of brewingRegistry.getAllRecipes()) {
      if (this.hasEnoughIngredients(recipe, available)) {
        // Count total ingredients required by this recipe
        const ingredientCount = recipe.ingredients.reduce((sum, ing) => sum + ing.count, 0)
        if (ingredientCount > bestIngredientCount) {
          bestRecipe = recipe
          bestIngredientCount = ingredientCount
        }
      }
    }

    return bestRecipe
  }

  /**
   * Check if we have enough of each ingredient for a recipe.
   */
  private hasEnoughIngredients(recipe: IBrewingRecipe, available: Map<string, number>): boolean {
    for (const ingredient of recipe.ingredients) {
      const have = available.get(ingredient.itemId) || 0
      if (have < ingredient.count) {
        return false
      }
    }
    return true
  }

  /**
   * Check if we can add an item to the output slot.
   */
  private canAddToOutput(item: IItem, count: number): boolean {
    if (!this.outputSlot) {
      return count <= item.maxStackSize
    }

    if (this.outputSlot.item.id !== item.id) {
      return false
    }

    const space = this.outputSlot.item.maxStackSize - this.outputSlot.count
    return count <= space
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
   * Try to start brewing with current ingredients.
   */
  private tryStartBrewing(): void {
    const recipe = this.findMatchingRecipe()
    if (!recipe) {
      return
    }

    // Check if output has space
    if (!this.canAddToOutput(recipe.createResult(), recipe.resultCount)) {
      return
    }

    // Start brewing this recipe
    this.currentRecipe = recipe
    this.currentBrewTime = recipe.brewTime
    this.currentBrewProgress = 0
  }

  /**
   * Complete the current brewing operation.
   * Finds the BEST matching recipe at completion time (not the one from start).
   * Returns true if brewing completed successfully, false if no valid recipe.
   */
  private completeBrewing(): boolean {
    // Find the best recipe with current ingredients (may have changed since start)
    const recipe = this.findMatchingRecipe()
    if (!recipe) {
      // No valid recipe - shouldn't happen if tick() checks properly
      return false
    }

    // Check if output has space for this recipe's result
    if (!this.canAddToOutput(recipe.createResult(), recipe.resultCount)) {
      return false
    }

    // Consume ingredients according to the best recipe
    this.consumeIngredients(recipe)

    // Add result to output
    const result = recipe.createResult()
    const resultCount = recipe.resultCount

    if (!this.outputSlot) {
      this.outputSlot = { item: result, count: resultCount }
    } else if (this.outputSlot.item.id === result.id) {
      this.outputSlot.count += resultCount
    }

    return true
  }

  /**
   * Consume ingredients from slots according to recipe requirements.
   */
  private consumeIngredients(recipe: IBrewingRecipe): void {
    // Build a map of what we need to consume
    const toConsume = new Map<string, number>()
    for (const ingredient of recipe.ingredients) {
      toConsume.set(ingredient.itemId, (toConsume.get(ingredient.itemId) || 0) + ingredient.count)
    }

    // Consume from ingredient slots
    for (let i = 0; i < this.ingredientSlots.length; i++) {
      const stack = this.ingredientSlots[i]
      if (!stack) continue

      const needed = toConsume.get(stack.item.id) || 0
      if (needed > 0) {
        const toTake = Math.min(needed, stack.count)
        stack.count -= toTake
        toConsume.set(stack.item.id, needed - toTake)

        if (stack.count <= 0) {
          this.ingredientSlots[i] = null
        }
      }
    }
  }

  // Slot accessors for UI (slot indices: 0-3 = ingredients, 4 = fuel, 5 = output)

  getSlotCount(): number {
    return 6 // 4 ingredients + 1 fuel + 1 output
  }

  getStack(index: number): IItemStack | null {
    if (index < 4) return this.ingredientSlots[index]
    if (index === 4) return this.fuelSlot
    if (index === 5) return this.outputSlot
    return null
  }

  setStack(index: number, stack: IItemStack | null): void {
    if (index < 4) {
      this.ingredientSlots[index] = stack
    } else if (index === 4) {
      this.fuelSlot = stack
    } else if (index === 5) {
      this.outputSlot = stack
    }
  }

  getIngredientStack(index: number): IItemStack | null {
    if (index < 0 || index >= 4) return null
    return this.ingredientSlots[index]
  }

  setIngredientStack(index: number, stack: IItemStack | null): void {
    if (index >= 0 && index < 4) {
      this.ingredientSlots[index] = stack
    }
  }

  getFuelStack(): IItemStack | null {
    return this.fuelSlot
  }

  setFuelStack(stack: IItemStack | null): void {
    this.fuelSlot = stack
  }

  getOutputStack(): IItemStack | null {
    return this.outputSlot
  }

  setOutputStack(stack: IItemStack | null): void {
    this.outputSlot = stack
  }

  // Progress getters for UI (returns 0-1)
  getBrewProgress(): number {
    if (this.currentBrewTime <= 0) return 0
    return Math.min(1, this.currentBrewProgress / this.currentBrewTime)
  }

  getFuelProgress(): number {
    if (this.currentFuelTotal <= 0) return 0
    return Math.min(1, this.currentFuelRemaining / this.currentFuelTotal)
  }

  /**
   * Get all items to drop when the workbench is broken.
   */
  getAllItems(): IItemStack[] {
    const items: IItemStack[] = []
    for (const stack of this.ingredientSlots) {
      if (stack) items.push(stack)
    }
    if (this.fuelSlot) items.push(this.fuelSlot)
    if (this.outputSlot) items.push(this.outputSlot)
    return items
  }

  // ============================================================================
  // Persistence Methods
  // ============================================================================

  /**
   * Check if this state has meaningful data to persist.
   * Returns true if any slots have items or brewing is in progress.
   */
  hasData(): boolean {
    // Check if any slots have items
    for (const slot of this.ingredientSlots) {
      if (slot) return true
    }
    if (this.fuelSlot) return true
    if (this.outputSlot) return true
    // Check if brewing is in progress
    if (this.currentFuelRemaining > 0) return true
    if (this.currentBrewProgress > 0) return true
    return false
  }

  /**
   * Serialize state to a plain object for persistence.
   */
  serialize(): SerializedApothecaryState | undefined {
    if (!this.hasData()) {
      return undefined
    }

    return {
      ingredientSlots: this.ingredientSlots.map(serializeSlotLocal),
      fuelSlot: serializeSlotLocal(this.fuelSlot),
      outputSlot: serializeSlotLocal(this.outputSlot),
      brewProgress: this.currentBrewProgress,
      brewTime: this.currentBrewTime,
      fuelRemaining: this.currentFuelRemaining,
      fuelTotal: this.currentFuelTotal,
    }
  }

  /**
   * Restore state from saved data.
   */
  deserialize(data: unknown): void {
    const saved = data as SerializedApothecaryState
    if (!saved) return

    // Restore slots
    if (saved.ingredientSlots) {
      for (let i = 0; i < this.ingredientSlots.length && i < saved.ingredientSlots.length; i++) {
        this.ingredientSlots[i] = deserializeSlotLocal(saved.ingredientSlots[i])
      }
    }
    if (saved.fuelSlot !== undefined) {
      this.fuelSlot = deserializeSlotLocal(saved.fuelSlot)
    }
    if (saved.outputSlot !== undefined) {
      this.outputSlot = deserializeSlotLocal(saved.outputSlot)
    }

    // Restore brewing progress
    if (typeof saved.brewProgress === 'number') {
      this.currentBrewProgress = saved.brewProgress
    }
    if (typeof saved.brewTime === 'number') {
      this.currentBrewTime = saved.brewTime
    }
    if (typeof saved.fuelRemaining === 'number') {
      this.currentFuelRemaining = saved.fuelRemaining
    }
    if (typeof saved.fuelTotal === 'number') {
      this.currentFuelTotal = saved.fuelTotal
    }
  }

  onDestroy(): void {
    // Items would be dropped here - handled by caller
  }
}
