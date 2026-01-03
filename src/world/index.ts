// Interfaces
export type { IBlock, IBlockProperties, BlockId, IWorld } from './interfaces/IBlock.ts'
export type { IChunk } from './interfaces/IChunk.ts'
export type { IWorldCoordinate, IChunkCoordinate, ILocalCoordinate, ChunkKey } from './interfaces/ICoordinates.ts'
export type { IBlockRegistry, IBlockRegistration } from './interfaces/IBlockRegistry.ts'
export type { PathfindingPosition, PathfindingResult, PathfindingConfig } from './interfaces/IPathfinding.ts'

// Constants and Enums
export { BlockFace } from './interfaces/IBlock.ts'
export { BlockIds } from './blocks/BlockIds.ts'
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
export { ChunkManager } from './chunks/ChunkManager.ts'
export { WorldManager } from './WorldManager.ts'

// Block types
export { StoneBlock } from './blocks/types/stone/StoneBlock.ts'
export { DirtBlock } from './blocks/types/dirt/DirtBlock.ts'
export { GrassBlock } from './blocks/types/grass/GrassBlock.ts'
export { OakLogBlock } from './blocks/types/oak_log/OakLogBlock.ts'
export { OakLeavesBlock } from './blocks/types/oak_leaves/OakLeavesBlock.ts'

// Block registration
export { registerDefaultBlocks } from './blocks/registerDefaultBlocks.ts'

// Pathfinding
export { PathfindingService, type PathfindingCallback, type PathfindingServiceConfig } from './PathfindingService.ts'
