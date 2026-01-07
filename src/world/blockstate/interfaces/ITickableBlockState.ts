import type { IBlockState } from './IBlockState.ts'

/**
 * Block state that needs periodic updates.
 *
 * Used for blocks that process over time:
 * - Forges (smelting ores)
 * - Growing crops
 * - Machines with automation
 */
export interface ITickableBlockState extends IBlockState {
  /**
   * Called each game tick while active.
   * @param deltaTime Time since last tick in seconds
   * @returns true if still active, false if can be removed from tick list
   */
  tick(deltaTime: number): boolean

  /** Whether this state is currently active and needs ticking */
  readonly isActive: boolean
}

/**
 * Type guard to check if a block state is tickable.
 */
export function isTickableBlockState(state: IBlockState): state is ITickableBlockState {
  return 'tick' in state && typeof (state as ITickableBlockState).tick === 'function'
}
