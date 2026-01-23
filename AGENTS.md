# Agents Guide

This document provides guidelines for AI coding agents working in this codebase.

## Build & Development Commands

```bash
pnpm install        # Install dependencies
pnpm dev            # Start development server (hot reload)
pnpm build          # Production build (runs tsc && vite build)
pnpm preview        # Preview production build
```

**Type checking only:**
```bash
npx tsc --noEmit    # Check types without emitting
```

> **Note:** This project has no test framework or linter configured. Verify changes by running `pnpm build` which performs TypeScript type checking.

---

## Code Style Guidelines

### Imports

- **Always use explicit `.ts` extensions** in import paths:
  ```typescript
  // Correct
  import { Block } from './blocks/Block.ts'
  import type { IBlock } from '../interfaces/IBlock.ts'

  // Wrong
  import { Block } from './blocks/Block'
  ```

- **Use `type` keyword for type-only imports:**
  ```typescript
  import type { IBlock, BlockId } from './interfaces/IBlock.ts'
  import { BlockFace } from './interfaces/IBlock.ts'  // enum - not type-only
  ```

- **Organize imports in groups** (separated by blank lines):
  1. External packages (`three`, etc.)
  2. Type-only imports
  3. Internal modules (sorted by path depth)

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Interfaces | `I` prefix + PascalCase | `IBlock`, `IPhysicsBody` |
| Classes | PascalCase | `WorldManager`, `PhysicsEngine` |
| Types/Enums | PascalCase | `BlockFace`, `TaskPriority` |
| Constants | UPPER_SNAKE_CASE | `CHUNK_SIZE_X`, `GRAVITY` |
| Functions/Methods | camelCase | `getBlock()`, `worldToChunk()` |
| Private members | camelCase (no prefix) | `private readonly bodies: Set<>` |
| Files | PascalCase for classes | `WorldManager.ts`, `IBlock.ts` |

### TypeScript Patterns

- **Prefer `readonly` for immutable properties:**
  ```typescript
  export class PhysicsEngine {
    private readonly gravity: number
    private readonly bodies: Set<IPhysicsBody> = new Set()
  }
  ```

- **Use strict typing** - the project uses `"strict": true`

- **Define interfaces for module boundaries** in `interfaces/` subdirectories

- **Use config objects for constructors with multiple options:**
  ```typescript
  export interface PhysicsEngineConfig {
    gravity?: number
    terminalVelocity?: number
  }

  constructor(world: IPhysicsWorld, config: PhysicsEngineConfig = {}) {
    this.gravity = config.gravity ?? GRAVITY
  }
  ```

### File Organization

- **One class/concept per file** - match filename to primary export
- **Group related files** in directories with `index.ts` barrel exports
- **Barrel exports** should separate types and classes:
  ```typescript
  // index.ts
  // Interfaces
  export type { IPhysicsBody } from './interfaces/IPhysicsBody.ts'

  // Classes
  export { PhysicsEngine } from './PhysicsEngine.ts'

  // Constants
  export * from './constants.ts'
  ```

### Documentation

- **Use JSDoc comments** for public APIs:
  ```typescript
  /**
   * Update all physics bodies for this frame.
   * @param deltaTime Time elapsed in seconds
   */
  update(deltaTime: number): void { }
  ```

- **Keep comments concise** - explain "why", not "what"

### Error Handling

- **Cap input values** to prevent cascading failures:
  ```typescript
  // Cap deltaTime to prevent physics explosion on lag spikes
  const dt = Math.min(deltaTime, 0.1)
  ```

- **Use early returns** for validation
- **Fail gracefully** - return safe defaults rather than throwing when possible

### Performance Patterns

- **Pre-allocate objects** to avoid GC pressure:
  ```typescript
  // Pre-allocated result to avoid per-frame GC pressure
  private readonly result: ITaskResult = { completed: true, elapsedMs: 0 }
  ```

- **Use object pools** for frequently created/destroyed objects
- **Transfer ArrayBuffer ownership** between main thread and workers

---

## Architecture Patterns

### Module Structure

```
src/
├── core/           # Game loop, task scheduler
├── physics/        # AABB collision, physics engine
├── player/         # Input, controls, interactions
├── renderer/       # Three.js rendering, meshes
├── world/          # Voxel data, chunks, blocks
│   ├── blocks/     # Block definitions
│   │   ├── types/  # Individual block types
│   │   └── interfaces/
│   ├── chunks/     # Chunk data structures
│   └── generate/   # World generation
├── items/          # Inventory items
├── workers/        # Web workers
└── ui/             # DOM overlays
```

### Creating New Blocks

1. Create directory: `src/world/blocks/types/{block_name}/`
2. Add texture: `assets/texture.webp`
3. Create block class extending `SolidBlock` or `TransparentBlock`
4. Register in `src/world/blocks/registerDefaultBlocks.ts`
5. Add to `BlockIds` enum in `src/world/blocks/BlockIds.ts`

**Block Structure:**
```
types/{block_name}/
├── assets/
│   └── texture.webp
└── BlockNameBlock.ts
```

**Creating Texture Assets with AI:**

When generating textures using AI image generation tools, transparent blocks (flowers, crops, plants) require special handling:

1. **Request transparent backgrounds explicitly** in your prompt:
   - Include phrases like "on a transparent background", "PNG with alpha transparency"
   - Example: "Pixel art yellow flower with green stem, cut out on transparent background, 32x32 pixels"

2. **Post-process generated images** to remove backgrounds:
   ```bash
   # Remove white/light backgrounds and convert to webp with transparency
   convert input.png -fuzz 10% -transparent white -quality 90 output.webp
   
   # For complex backgrounds, use flood fill from corners
   convert input.png -fuzz 15% -fill none -draw "alpha 0,0 floodfill" -quality 90 output.webp
   ```

3. **Verify transparency** before committing - test in-game to ensure cross-billboard geometry displays correctly

### Creating New Items

1. Create item class extending `Item` in appropriate `src/items/` subdirectory
2. **CRITICAL:** Register in `src/persistence/ItemRegistry.ts`

**Registration Example:**
```typescript
// At the top - import the item
import { MyNewBlockItem } from '../items/blocks/my_new/MyNewBlockItem.ts'

// In initializeItemRegistry() - register the factory
registerItemFactory('my_new_block', () => new MyNewBlockItem())
```

The item ID passed to `registerItemFactory()` must exactly match the `id` property of the item class.

### Creating New Features (World Generation)

Register in TWO places for worker communication:
1. `src/world/generate/WorldGenerator.ts` - serialization
2. `src/workers/ChunkGenerationWorker.ts` - deserialization

**Example for a new `MyFeature`:**
```typescript
// WorldGenerator.ts - add serialization case
if (feature instanceof MyFeature) {
  return { type: 'myFeature', settings: (feature as any).config }
}

// ChunkGenerationWorker.ts - add to FeatureConfig type
| { type: 'myFeature'; settings: MyFeatureConfig }

// ChunkGenerationWorker.ts - add reconstruction case
case 'myFeature':
  return new MyFeature(config.settings)
```

Failure to register in both places causes: `Error: Unknown feature type: MyFeature`

### Biome Layer System

Biomes are assigned to vertical layers:
- **Layer 0**: Underground biomes (Y=0-127, sub-chunks 0-1)
- **Layer 1**: Surface biomes (Y=128-1023, sub-chunks 2-15)

When creating a new biome:
1. Set `layer: 0` or `layer: 1` in `BiomeProperties`
2. Register in `BiomeRegistry.ts` with the correct layer
3. Add biome type to `BiomeType` union in `GenerationConfig.ts`

---

## Web Workers

Workers can import TypeScript files - Vite handles bundling automatically.

**Initialize workers with module syntax:**
```typescript
const worker = new Worker(
  new URL('../workers/MyWorker.ts', import.meta.url),
  { type: 'module' }
)
```

**Worker constraints:**
- No DOM/WebGL access
- Must re-register blocks independently
- Use shared interfaces (`IChunkData`, `ISubChunkData`)

**Transfer ArrayBuffer ownership** for zero-copy performance:
```typescript
// Main thread sends buffers, transfers ownership
postMessage(request, { transfer: [blocks.buffer, light.buffer] })

// Worker processes, returns with transfer
self.postMessage(result, { transfer: [result.blocks.buffer] })
```

---

## Common Gotchas

1. **Missing item registry** - Items not registered in `ItemRegistry.ts` will be lost on save/load
2. **Missing feature registration** - New features need registration in both WorldGenerator and ChunkGenerationWorker
3. **Forgetting .ts extension** - All imports must include `.ts` extension
4. **Type-only imports** - Use `import type` to avoid runtime import of types
5. **Coordinates use bigint** - World coordinates (`IWorldCoordinate`) use `bigint`, local coordinates use `number`
