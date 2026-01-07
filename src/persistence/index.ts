/**
 * Persistence system barrel exports.
 */

export { PersistenceManager } from './PersistenceManager.ts'
export type { IModifiedChunkProvider } from './PersistenceManager.ts'

export {
  initializeItemRegistry,
  createItemFromId,
  registerItemFactory,
  isItemRegistered,
  getRegisteredItemIds,
} from './ItemRegistry.ts'

export {
  serializeInventory,
  deserializeInventory,
  validateSerializedInventory,
} from './InventorySerializer.ts'

export type {
  SerializedInventory,
  SerializedSlot,
  WorldMetadata,
  PersistedSubChunkData,
} from './PersistenceTypes.ts'

export {
  MAGIC_NUMBER,
  PERSISTENCE_VERSION,
} from './PersistenceTypes.ts'
