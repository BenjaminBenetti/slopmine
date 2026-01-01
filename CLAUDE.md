# Slopmine

A Minecraft-like voxel game built with modern web technologies.

## Tech Stack

- **Runtime**: TypeScript
- **Package Manager**: pnpm
- **Rendering**: three.js
- **Build Tool**: Vite

## Commands

```bash
pnpm install    # Install dependencies
pnpm dev        # Start development server
pnpm build      # Production build
pnpm preview    # Preview production build
```

## Architecture

This project follows a modular design with minimal coupling between modules. Each system should be self-contained and communicate through well-defined interfaces.

### Design Principles

- **Loose coupling**: Modules should not depend on internal implementation details of other modules
- **Single responsibility**: Each module handles one concern
- **Interface-driven**: Define clear contracts between systems
- **Composition over inheritance**: Prefer composing behaviors from smaller pieces

### Core Modules

- `src/core/` - Engine fundamentals (game loop, frame budget)
- `src/renderer/` - three.js rendering, camera, lighting, mesh building
- `src/world/` - Chunk management, terrain generation, voxel data, lighting
- `src/world/blocks/` - Block definitions with `types/` subdirectory for each block
- `src/world/generate/` - World generation (biomes, caves, features, structures)
- `src/world/interfaces/` - Shared interfaces (IChunk, IBlock, ICoordinates, etc.)
- `src/workers/` - Web Workers for off-main-thread computation
- `src/physics/` - Collision detection, physics bodies, AABB
- `src/player/` - Player state, controls, input handling
- `src/items/` - Items and tools with subdirectories mirroring block structure
- `src/ui/` - HUD, menus, overlays, debug displays
- `src/settings/` - User-configurable settings (graphics, etc.)

## Web Workers

Workers are used to offload expensive computation from the main thread (chunk generation, mesh building, occlusion culling).

### Worker Imports

**Workers CAN import other TypeScript files from the codebase.** Vite handles bundling worker dependencies automatically. Workers commonly import:

- Shared interfaces from `src/world/interfaces/`
- Utility functions from `src/world/coordinates/`
- Generation code from `src/world/generate/`
- Constants and type definitions

Example from `ChunkGenerationWorker.ts`:
```typescript
import { WorkerChunk } from './WorkerChunk.ts'
import { SimplexNoise } from '../world/generate/SimplexNoise.ts'
import { CaveCarver } from '../world/generate/caves/CaveCarver.ts'
import type { IGenerationConfig } from '../world/generate/GenerationConfig.ts'
```

### Worker Initialization

Use Vite's module worker syntax for proper bundling:
```typescript
// Method 1: Vite's ?worker import (preferred for simple cases)
import ChunkMeshWorker from '../workers/ChunkMeshWorker.ts?worker'
const worker = new ChunkMeshWorker()

// Method 2: URL constructor (for module workers needing imports)
const worker = new Worker(
  new URL('../workers/ChunkGenerationWorker.ts', import.meta.url),
  { type: 'module' }
)
```

### Worker Constraints

Workers run in an isolated context without access to:
- DOM APIs (document, window)
- three.js rendering (WebGL context)
- Main thread singletons

Use lightweight data classes in workers (e.g., `WorkerChunk` instead of `Chunk`) that implement shared interfaces like `IChunkData`.

## Code Quality Standards

### TypeScript

- Use explicit `.ts` extensions in imports
- Define interfaces for module boundaries in `interfaces/` directories
- Use `type` imports for type-only imports: `import type { Foo } from './Foo.ts'`
- Prefer `readonly` for properties that shouldn't change after construction

### File Organization

- One class/major concept per file
- Group related files in directories with an `index.ts` barrel export
- Block types: `src/world/blocks/types/{block_name}/` with `assets/` subdirectory
- Items: `src/items/` mirrors the structure of blocks

### Patterns

- Use ES modules
- Prefer functional patterns where practical
- Keep files focused and small
- Export types/interfaces for module boundaries
- Use async/await for asynchronous operations (especially in workers)
- Transfer ArrayBuffer ownership between main thread and workers for zero-copy performance
