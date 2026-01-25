/**
 * Global accessor for the persistence manager.
 * Allows block classes to delete block states without direct dependency injection.
 *
 * The persistence manager is set once during initialization in main.ts.
 */

import type { PersistenceManager } from './PersistenceManager.ts'

let globalPersistenceManager: PersistenceManager | null = null

/**
 * Set the global persistence manager reference.
 * Call this once during game initialization.
 */
export function setGlobalPersistenceManager(manager: PersistenceManager): void {
  globalPersistenceManager = manager
}

/**
 * Get the global persistence manager.
 * Returns null if not yet initialized.
 */
export function getPersistenceManager(): PersistenceManager | null {
  return globalPersistenceManager
}

/**
 * Delete a block state from persistence.
 * Fire-and-forget - doesn't wait for completion.
 * Safe to call even if persistence manager isn't initialized.
 */
export function deleteBlockStateFromPersistence(x: bigint, y: bigint, z: bigint): void {
  if (globalPersistenceManager) {
    globalPersistenceManager.deleteBlockState(x, y, z)
  }
}
