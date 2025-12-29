// Interfaces
export type { IBlock, IBlockProperties, BlockId, IWorld } from './interfaces/IBlock.ts'
export type { IChunk } from './interfaces/IChunk.ts'
export type { IWorldCoordinate, IChunkCoordinate, ILocalCoordinate, ChunkKey } from './interfaces/ICoordinates.ts'
export type { IBlockRegistry, IBlockRegistration } from './interfaces/IBlockRegistry.ts'

// Constants and Enums
export { AIR_BLOCK_ID, BlockFace } from './interfaces/IBlock.ts'
export { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT, CHUNK_VOLUME, ChunkState } from './interfaces/IChunk.ts'

// Coordinate utilities
export {
  worldToChunk,
  worldToLocal,
  localToWorld,
  localToIndex,
  indexToLocal,
  isValidLocal,
  getNeighborChunk,
} from './coordinates/CoordinateUtils.ts'
export { createChunkKey, parseChunkKey } from './interfaces/ICoordinates.ts'

// Core classes
export { Block, AirBlock, SolidBlock, TransparentBlock, SharedGeometry } from './blocks/Block.ts'
export { BlockRegistry, registerBlock, getBlock } from './blocks/BlockRegistry.ts'
export { Chunk } from './chunks/Chunk.ts'
export { ChunkManager, type ChunkManagerConfig } from './chunks/ChunkManager.ts'
export { WorldManager } from './WorldManager.ts'

// Block types
export { StoneBlock, STONE_BLOCK_ID } from './blocks/types/StoneBlock.ts'
export { DirtBlock, DIRT_BLOCK_ID } from './blocks/types/DirtBlock.ts'
export { GrassBlock, GRASS_BLOCK_ID } from './blocks/types/GrassBlock.ts'

// Block registration
export { registerDefaultBlocks } from './blocks/registerDefaultBlocks.ts'
