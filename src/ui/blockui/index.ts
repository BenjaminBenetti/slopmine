// Block UI interfaces
export type { IBlockUI, BlockUIFactory } from './interfaces/IBlockUI.ts'

// Registry
export { BlockUIRegistry, blockUIRegistry } from './BlockUIRegistry.ts'
export { BlockActionRegistry, blockActionRegistry } from './BlockActionRegistry.ts'

// Specific block UIs
export { createForgeUI } from './ForgeUI.ts'
export { createApothecaryWorkbenchUI } from './ApothecaryWorkbenchUI.ts'
export { createWoodworkingBenchUI } from './WoodworkingBenchUI.ts'
export { createChestUI } from './ChestUI.ts'
