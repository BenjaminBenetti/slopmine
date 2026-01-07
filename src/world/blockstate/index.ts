// Block state interfaces
export type { IBlockState } from './interfaces/IBlockState.ts'
export { createBlockStateKey, parseBlockStateKey } from './interfaces/IBlockState.ts'
export type { ITickableBlockState } from './interfaces/ITickableBlockState.ts'
export { isTickableBlockState } from './interfaces/ITickableBlockState.ts'

// Block state management
export { BlockStateManager } from './BlockStateManager.ts'
export { BlockTickManager } from './BlockTickManager.ts'
