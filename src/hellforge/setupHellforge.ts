import { blockUIRegistry } from '../ui/blockui/BlockUIRegistry.ts'
import { BlockIds } from '../world/blocks/BlockIds.ts'
import type { HellforgeState } from '../world/blocks/types/hellforge/HellforgeState.ts'
import { createHellforgeUI, type HellforgeUIDeps } from './HellforgeUI.ts'

/**
 * Register the Hellforge's block UI (E on a placed Hellforge). Its recipes
 * are registered with the other recipes (registerDefaultRecipes).
 */
export function setupHellforge(deps: HellforgeUIDeps): void {
  blockUIRegistry.register(BlockIds.HELLFORGE, (state) => createHellforgeUI(state as HellforgeState, deps))
}
