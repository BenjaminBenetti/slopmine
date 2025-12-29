# WorldManager

The WorldManager is the main coordinator for world state, providing a high-level API for block and chunk operations. It's designed to support external terrain generators.

## Quick Start

```typescript
import { WorldManager, BlockIds } from './world'

const world = new WorldManager()

// Set a block
world.setBlock(0n, 64n, 0n, BlockIds.STONE)

// Get a block
const blockId = world.getBlockId(0n, 64n, 0n)
```

## Block Operations

### Get/Set Individual Blocks

```typescript
// Get block ID at world coordinates (returns AIR if chunk not loaded)
const blockId = world.getBlockId(x, y, z)

// Get block object with properties
const block = world.getBlock(x, y, z)
console.log(block.properties.name, block.properties.isOpaque)

// Set a block (loads chunk if needed, returns true if changed)
const changed = world.setBlock(x, y, z, BlockIds.DIRT)
```

### Height Queries

```typescript
// Get highest non-air block Y at x,z (returns null if chunk not loaded)
const surfaceY = world.getHighestBlockAt(10n, 20n)
if (surfaceY !== null) {
  // Place something on the surface
  world.setBlock(10n, surfaceY + 1n, 20n, BlockIds.GRASS)
}
```

### Bulk Operations

```typescript
// Fill a region with a block type (coordinates are inclusive)
world.fillRegion(0n, 0n, 0n, 10n, 5n, 10n, BlockIds.STONE)

// Iterate over all blocks in a region
world.forEachBlockInRegion(0n, 0n, 0n, 10n, 10n, 10n, (x, y, z, blockId) => {
  if (blockId === BlockIds.DIRT) {
    world.setBlock(x, y, z, BlockIds.GRASS)
  }
})
```

## Chunk Operations

### Loading and Querying Chunks

```typescript
// Load or get a chunk (creates if doesn't exist)
const chunk = world.loadChunk({ x: 0n, z: 0n })

// Get chunk without loading (returns undefined if not loaded)
const maybeChunk = world.getChunk({ x: 0n, z: 0n })

// Check if chunk exists without loading it
if (world.hasChunk({ x: 1n, z: 1n })) {
  // Chunk is loaded
}

// Get chunk containing world coordinates
const chunkAtPos = world.getChunkAt(100n, 64n, 200n)
```

### Iterating Chunks

```typescript
// Get all loaded chunks
const chunks = world.getLoadedChunks()

// Get chunks that need re-meshing
const dirtyChunks = world.getDirtyChunks()

// Get count
const count = world.getLoadedChunkCount()
```

### Unloading

```typescript
world.unloadChunk({ x: 0n, z: 0n })
```

## Terrain Generation API

### Async Chunk Generation

Use `generateChunkAsync` to populate chunks with terrain. The generator function receives the chunk and world manager.

```typescript
async function generateTerrain(chunk: Chunk, world: WorldManager): Promise<void> {
  const { CHUNK_SIZE_X, CHUNK_SIZE_Z } = await import('./world')

  for (let x = 0; x < CHUNK_SIZE_X; x++) {
    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      // Simple flat terrain at y=64
      for (let y = 0; y < 64; y++) {
        if (y < 60) {
          chunk.setBlockId(x, y, z, BlockIds.STONE)
        } else if (y < 63) {
          chunk.setBlockId(x, y, z, BlockIds.DIRT)
        } else {
          chunk.setBlockId(x, y, z, BlockIds.GRASS)
        }
      }
    }
  }
}

// Generate a chunk
const chunk = await world.generateChunkAsync({ x: 0n, z: 0n }, generateTerrain)
```

### Generation Events

Subscribe to chunk generation completion:

```typescript
const unsubscribe = world.onChunkGenerated((chunk) => {
  console.log(`Chunk ${chunk.coordinate.x},${chunk.coordinate.z} generated`)
  // Trigger meshing, lighting, etc.
})

// Later, unsubscribe
unsubscribe()
```

### Chunk States

Chunks have a state property indicating their lifecycle:

```typescript
import { ChunkState } from './world'

// ChunkState.UNLOADED  - Not in memory
// ChunkState.LOADING   - Being loaded from storage
// ChunkState.LOADED    - In memory, ready for use
// ChunkState.GENERATING - Terrain generation in progress
// ChunkState.MESHING   - Mesh generation in progress
// ChunkState.READY     - Ready for rendering

const state = chunk.state
if (state === ChunkState.GENERATING) {
  // Wait for generation to complete
}
```

## Coordinate System

The world uses three coordinate systems:

### World Coordinates (bigint)

Absolute block positions in the world. Uses `bigint` for unlimited world size.

```typescript
interface IWorldCoordinate {
  x: bigint
  y: bigint
  z: bigint
}
```

### Chunk Coordinates (bigint)

Identifies chunks. Only x and z (chunks span full height).

```typescript
interface IChunkCoordinate {
  x: bigint
  z: bigint
}
```

### Local Coordinates (number)

Position within a chunk. Ranges: x: 0-31, y: 0-1023, z: 0-31

```typescript
interface ILocalCoordinate {
  x: number
  y: number
  z: number
}
```

### Conversion Utilities

```typescript
import { worldToChunk, worldToLocal, localToWorld } from './world'

const worldPos: IWorldCoordinate = { x: 100n, y: 64n, z: 200n }

// Get which chunk contains this position
const chunkCoord = worldToChunk(worldPos)  // { x: 3n, z: 6n }

// Get local position within the chunk
const localPos = worldToLocal(worldPos)  // { x: 4, y: 64, z: 8 }

// Convert back to world coordinates
const backToWorld = localToWorld(chunkCoord, localPos)
```

### Chunk Dimensions

```typescript
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT } from './world'

// CHUNK_SIZE_X = 32  (blocks wide)
// CHUNK_SIZE_Z = 32  (blocks deep)
// CHUNK_HEIGHT = 1024 (blocks tall)
```

## Block Registry

Access the block registry to get block information or register custom blocks:

```typescript
const registry = world.getBlockRegistry()

// Get a block type by ID
const stoneBlock = registry.get(BlockIds.STONE)
console.log(stoneBlock.properties.hardness)

// Check if a block is registered
if (registry.has(5)) {
  // Block ID 5 exists
}
```

## Example: Simple Terrain Generator

A complete example of a basic terrain generator with hills:

```typescript
import {
  WorldManager,
  BlockIds,
  CHUNK_SIZE_X,
  CHUNK_SIZE_Z,
  localToWorld,
  type Chunk
} from './world'

// Simple noise function (replace with proper Perlin/Simplex for production)
function noise2D(x: number, z: number, scale: number): number {
  const nx = x * scale
  const nz = z * scale
  return (Math.sin(nx) + Math.sin(nz)) * 0.5 + 0.5
}

async function generateHillyTerrain(chunk: Chunk, world: WorldManager): Promise<void> {
  const chunkWorldX = Number(chunk.coordinate.x) * CHUNK_SIZE_X
  const chunkWorldZ = Number(chunk.coordinate.z) * CHUNK_SIZE_Z

  for (let localX = 0; localX < CHUNK_SIZE_X; localX++) {
    for (let localZ = 0; localZ < CHUNK_SIZE_Z; localZ++) {
      const worldX = chunkWorldX + localX
      const worldZ = chunkWorldZ + localZ

      // Generate terrain height using noise
      const height = 64 + Math.floor(noise2D(worldX, worldZ, 0.05) * 20)

      for (let y = 0; y < height; y++) {
        let blockId: number
        if (y < height - 4) {
          blockId = BlockIds.STONE
        } else if (y < height - 1) {
          blockId = BlockIds.DIRT
        } else {
          blockId = BlockIds.GRASS
        }
        chunk.setBlockId(localX, y, localZ, blockId)
      }
    }
  }
}

// Usage
const world = new WorldManager()

// Generate chunks around origin
for (let cx = -2n; cx <= 2n; cx++) {
  for (let cz = -2n; cz <= 2n; cz++) {
    await world.generateChunkAsync({ x: cx, z: cz }, generateHillyTerrain)
  }
}
```

## Chunk Direct Access

For performance-critical code, work directly with chunks:

```typescript
const chunk = world.loadChunk({ x: 0n, z: 0n })

// Fill operations
chunk.fill(BlockIds.AIR)  // Clear entire chunk
chunk.fillLayer(0, BlockIds.STONE)  // Fill bottom layer

// Iterate all blocks
chunk.forEachBlock((x, y, z, blockId) => {
  if (blockId !== BlockIds.AIR) {
    console.log(`Block at ${x},${y},${z}: ${blockId}`)
  }
})

// Find surface at local position
const surfaceY = chunk.getHighestBlockAt(16, 16)

// Direct block access
const id = chunk.getBlockId(0, 64, 0)
chunk.setBlockId(0, 65, 0, BlockIds.DIRT)

// Raw data access for serialization
const data: Uint16Array = chunk.getBlockData()
```
