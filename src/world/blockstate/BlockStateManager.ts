import type { IBlockState } from './interfaces/IBlockState.ts'
import { createBlockStateKey } from './interfaces/IBlockState.ts'
import type { IWorldCoordinate } from '../interfaces/ICoordinates.ts'

/**
 * Central registry for per-block runtime state.
 *
 * Stores state for blocks that need persistent data (forges, chests, etc.)
 * while keeping block classes stateless (flyweight pattern).
 *
 * Uses coordinate string keys for O(1) lookup.
 */
export class BlockStateManager {
  private static instance: BlockStateManager | null = null
  private readonly states: Map<string, IBlockState> = new Map()

  private constructor() {}

  /**
   * Get the singleton instance.
   */
  static getInstance(): BlockStateManager {
    if (!BlockStateManager.instance) {
      BlockStateManager.instance = new BlockStateManager()
    }
    return BlockStateManager.instance
  }

  /**
   * Reset the singleton (for testing).
   */
  static resetInstance(): void {
    if (BlockStateManager.instance) {
      BlockStateManager.instance.dispose()
      BlockStateManager.instance = null
    }
  }

  /**
   * Get the state at a world coordinate.
   */
  getState<T extends IBlockState>(coord: IWorldCoordinate): T | undefined {
    const key = createBlockStateKey(coord)
    return this.states.get(key) as T | undefined
  }

  /**
   * Set the state at a world coordinate.
   */
  setState(coord: IWorldCoordinate, state: IBlockState): void {
    const key = createBlockStateKey(coord)
    this.states.set(key, state)
  }

  /**
   * Remove and destroy the state at a world coordinate.
   * Calls onDestroy() if the state implements it.
   */
  removeState(coord: IWorldCoordinate): IBlockState | undefined {
    const key = createBlockStateKey(coord)
    const state = this.states.get(key)
    if (state) {
      state.onDestroy?.()
      this.states.delete(key)
    }
    return state
  }

  /**
   * Check if a state exists at a coordinate.
   */
  hasState(coord: IWorldCoordinate): boolean {
    const key = createBlockStateKey(coord)
    return this.states.has(key)
  }

  /**
   * Get all block states (for ticking, iteration).
   */
  getAllStates(): IterableIterator<IBlockState> {
    return this.states.values()
  }

  /**
   * Get the number of stored states.
   */
  get size(): number {
    return this.states.size
  }

  /**
   * Dispose all states.
   */
  dispose(): void {
    for (const state of this.states.values()) {
      state.onDestroy?.()
    }
    this.states.clear()
  }
}
