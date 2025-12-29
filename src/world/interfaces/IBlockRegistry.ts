import type { BlockId, IBlock, IBlockProperties } from './IBlock.ts'

/**
 * Block registration entry with factory function.
 */
export interface IBlockRegistration {
  readonly properties: IBlockProperties
  readonly factory: () => IBlock
}

/**
 * Registry for mapping block IDs to block instances.
 * Uses flyweight pattern - blocks are stateless singletons.
 */
export interface IBlockRegistry {
  /**
   * Register a block type with the registry.
   */
  register(registration: IBlockRegistration): void

  /**
   * Get the block instance for a given ID.
   * Returns AIR block for unknown IDs.
   */
  getBlock(id: BlockId): IBlock

  /**
   * Get block by name.
   */
  getBlockByName(name: string): IBlock | undefined

  /**
   * Check if a block ID is registered.
   */
  isRegistered(id: BlockId): boolean

  /**
   * Get all registered block IDs.
   */
  getAllBlockIds(): BlockId[]
}
