import type { ITickableBlockState } from '../../../blockstate/interfaces/ITickableBlockState.ts'
import type { IItemStack } from '../../../../player/PlayerState.ts'
import type { IWorldCoordinate } from '../../../interfaces/ICoordinates.ts'
import type { IWoodworkingRecipe } from '../../../../woodworking/interfaces/IWoodworkingRecipe.ts'
import type { SerializedSlot } from '../../../../persistence/PersistenceTypes.ts'
import { woodworkingRegistry } from '../../../../woodworking/index.ts'
import { serializeSlot, deserializeSlot } from '../../../../persistence/BlockStateSerializer.ts'

/** Number of ingredient slots on the bench */
export const BENCH_SLOT_COUNT = 3

/**
 * Runtime state for a placed woodworking bench block.
 *
 * Works like the hand-crafting grid, just smaller and with woodworking
 * recipes: 3 shapeless ingredient slots, recipes match against the
 * aggregated slot contents, and crafting consumes ingredients directly.
 * Results go straight to the player inventory (handled by the UI), and the
 * UI returns leftover ingredients to the player on close, so persisted
 * state is normally empty.
 */
export class WoodworkingBenchState implements ITickableBlockState {
  readonly position: IWorldCoordinate
  readonly stateType = 'woodworking_bench'

  private readonly slots: (IItemStack | null)[] = new Array(BENCH_SLOT_COUNT).fill(null)

  constructor(position: IWorldCoordinate) {
    this.position = position
  }

  get isActive(): boolean {
    // Crafting is instant - no ticking needed
    return false
  }

  tick(_deltaTime: number): boolean {
    return this.isActive
  }

  // ============================================================================
  // Slot accessors (indices 0-2, wired to drag-drop by the UI)
  // ============================================================================

  getSlotCount(): number {
    return BENCH_SLOT_COUNT
  }

  getStack(index: number): IItemStack | null {
    if (index < 0 || index >= BENCH_SLOT_COUNT) return null
    return this.slots[index]
  }

  setStack(index: number, stack: IItemStack | null): void {
    if (index < 0 || index >= BENCH_SLOT_COUNT) return
    this.slots[index] = stack
  }

  // ============================================================================
  // Crafting
  // ============================================================================

  /** Total item counts across all slots, keyed by item id. */
  getIngredientCounts(): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const stack of this.slots) {
      if (stack) {
        counts[stack.item.id] = (counts[stack.item.id] ?? 0) + stack.count
      }
    }
    return counts
  }

  /** Recipes craftable with the current slot contents. */
  getCraftableRecipes(): IWoodworkingRecipe[] {
    return woodworkingRegistry.findCraftableRecipes(this.getIngredientCounts())
  }

  /**
   * Consume a recipe's ingredients from the slots (left to right).
   * Returns true if crafting succeeded; the caller gives the result
   * to the player.
   */
  craft(recipe: IWoodworkingRecipe): boolean {
    const available = this.getIngredientCounts()[recipe.inputItemId] ?? 0
    if (available < recipe.inputCount) return false

    let remaining = recipe.inputCount
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      const stack = this.slots[i]
      if (!stack || stack.item.id !== recipe.inputItemId) continue
      const take = Math.min(stack.count, remaining)
      stack.count -= take
      remaining -= take
      if (stack.count <= 0) {
        this.slots[i] = null
      }
    }
    return true
  }

  // ============================================================================
  // Content transfer (break / close)
  // ============================================================================

  /**
   * Remove empty (count <= 0) stacks after a partial content transfer.
   */
  compactSlots(): void {
    for (let i = 0; i < this.slots.length; i++) {
      const stack = this.slots[i]
      if (stack && stack.count <= 0) {
        this.slots[i] = null
      }
    }
  }

  /**
   * Get all items to return when the bench is broken (live stacks).
   */
  getAllItems(): IItemStack[] {
    const items: IItemStack[] = []
    for (const stack of this.slots) {
      if (stack) items.push(stack)
    }
    return items
  }

  // ============================================================================
  // Persistence
  // ============================================================================

  hasData(): boolean {
    return this.slots.some((slot) => slot !== null)
  }

  serialize(): SerializedWoodworkingBenchState | undefined {
    if (!this.hasData()) {
      return undefined
    }
    return { slots: this.slots.map(serializeSlot) }
  }

  deserialize(data: unknown): void {
    const saved = data as Partial<SerializedWoodworkingBenchState> & {
      // Legacy shape from the 1-input/3-output bench
      inputSlot?: SerializedSlot | null
      outputSlots?: (SerializedSlot | null)[]
    }
    if (!saved) return

    if (saved.slots) {
      for (let i = 0; i < BENCH_SLOT_COUNT && i < saved.slots.length; i++) {
        this.slots[i] = deserializeSlot(saved.slots[i])
      }
      return
    }

    // Migrate legacy saves: fold input + outputs into the ingredient slots
    const legacy = [saved.inputSlot ?? null, ...(saved.outputSlots ?? [])]
      .map(deserializeSlot)
      .filter((stack): stack is IItemStack => stack !== null)
    for (let i = 0; i < BENCH_SLOT_COUNT && i < legacy.length; i++) {
      this.slots[i] = legacy[i]
    }
  }

  onDestroy(): void {
    // Items are returned via getStateDrops - handled by caller
  }
}

/**
 * Serialized woodworking bench state.
 */
interface SerializedWoodworkingBenchState {
  slots: (SerializedSlot | null)[]
}
