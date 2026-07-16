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

---

## System Overview

### Initialization Flow

The game initializes in `src/main.ts` in a carefully ordered sequence:

1. **Registry Setup**: Block registry, recipes, item registry
2. **Rendering**: Renderer, graphics settings, texture atlas
3. **Player Systems**: PlayerState, UI elements, camera controls, input handlers
4. **World System**: WorldManager, WorldGenerator, PersistenceManager
5. **Physics**: WorldPhysicsAdapter, PhysicsEngine, player body
6. **Environment**: WorldLighting, Skybox, HeldItemRenderer
7. **Interactions**: BlockInteraction, BlockPlacement, BlockInteractionHandler
8. **Game Loop**: TaskScheduler with priority-based task execution

### System Interaction Diagram

```
┌─────────────────────────────────────────────────────┐
│              Game Loop (60 UPS / Variable FPS)      │
└──────────────────┬──────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
    UPDATE                  RENDER
    (TaskScheduler)         (Renderer)
        │                     │
        │                     ├─► Frustum Culling
        │                     ├─► Occlusion Culling (Worker)
        │                     ├─► Shadow Mapping
        │                     └─► Held Item Overlay
        │
        ├─► CRITICAL: Camera, Physics, Mining
        ├─► NORMAL: World Gen, Lighting, Liquid Physics
        └─► LOW: Background processing

WORLD PIPELINE:
WorldGenerator ──► ChunkGenerationWorker ──► WorldManager
                                                  │
                        ┌─────────────────────────┤
                        │                         │
                GreedyMeshWorker          LightingWorker
                        │                         │
                        └─────────┬───────────────┘
                                  │
                             Renderer
```

---

## Core Modules

### `src/core/` - Engine Fundamentals

The core module provides the game loop infrastructure and frame budget management.

**Key Files:**
- `GameLoop.ts` - Fixed-timestep game loop (60 UPS) with accumulator pattern
- `TaskScheduler.ts` - Adaptive priority-based task scheduling with dynamic budgeting
- `FrameBudget.ts` - Time-slicing utility for yielding long operations
- `BudgetAwareTask.ts` - Iterative tasks that measure and adapt to available budget

**Task Priority Levels:**
- `CRITICAL` (0): Always runs - physics, input, controls
- `HIGH` (1): Can defer briefly - rendering prep
- `NORMAL` (2): Background work - world generation
- `LOW` (3): Lowest priority - lighting polish, liquid physics

**Frame Budget Algorithm:**
- Rolling average frame time with 10% adaptation rate
- Budget = avgFrameTime × 0.25 (25% of frame)
- Clamped between 1ms and 8ms
- CRITICAL tasks bypass budget; others skip when exhausted

---

### `src/renderer/` - Rendering System

Three.js-based rendering with optimized voxel mesh handling.

**Key Files:**
- `Renderer.ts` - WebGL renderer, scene, camera (100° FOV), resolution presets
- `GreedyChunkMesh.ts` - Greedy meshing algorithm for face merging (~10x fewer vertices)
- `ChunkMesh.ts` - InstancedMesh-based rendering (one draw call per block type)
- `FrustumCuller.ts` - First-pass visibility culling via AABB-frustum intersection
- `SoftwareOcclusionCuller.ts` - Second-pass CPU depth buffer occlusion (256×128)
- `TextureAtlas.ts` - Single atlas texture for all blocks (reduces state changes)
- `WorldLighting.ts` - Directional light (sun), shadows (PCF soft, 8192px map)
- `Skybox.ts` - Sky dome with gradient shader, sun disc, clouds
- `HeldItemRenderer.ts` - First-person held item with bob/swing animations
- `MiningOverlay.ts` - Block mining progress visualization

**Rendering Pipeline:**
1. Frustum culling (hide chunks outside view)
2. Software occlusion culling (hide chunks behind opaque geometry)
3. Render opaque meshes
4. Render transparent meshes (alpha-tested, then blended)
5. Render held item overlay
6. Update debug wireframes (if enabled)

**Performance Optimizations:**
- Greedy meshing merges adjacent faces into larger quads
- Instanced rendering for non-greedy blocks
- Pre-allocated object pools to avoid GC pressure
- Manual GPU memory cleanup on chunk unload
- Texture atlas with mipmap padding to prevent bleeding

---

### `src/world/` - World Management

Core voxel data storage, chunk lifecycle, and world coordination.

**Key Files:**
- `WorldManager.ts` - Central coordinator for chunks, meshing, lighting, liquid physics
- `chunks/ChunkColumn.ts` - 32×32×1024 column containing 16 sub-chunks
- `chunks/SubChunk.ts` - 32×32×64 voxel grid with block and light data
- `chunks/ChunkManager.ts` - Chunk storage and lifecycle management
- `coordinates/CoordinateUtils.ts` - World↔Chunk↔Local coordinate conversions
- `lighting/BackgroundLightingManager.ts` - Continuous lighting correction
- `lighting/SkylightPropagator.ts` - Top-down skylight propagation
- `lighting/BlocklightPropagator.ts` - Light source propagation (torches, lava)
- `liquid/LiquidPhysicsManager.ts` - Water/lava flow simulation
- `blockstate/BlockStateManager.ts` - Per-block persistent state (chests, forges)
- `blockstate/BlockTickManager.ts` - Frame-based block state updates

**Chunk Architecture:**
```
ChunkColumn (32×32×1024)
├── SubChunk 0  (Y: 0-63)
├── SubChunk 1  (Y: 64-127)
├── ...
└── SubChunk 15 (Y: 960-1023)
```

**Memory Layout:** Y-major indexing for cache-friendly horizontal iteration:
```
index = y * SIZE_X * SIZE_Z + z * SIZE_X + x
```

**Light Data Packing:**
```
Uint8: High nibble = Skylight (0-15), Low nibble = Blocklight (0-15)
```

**Data Flow (Block Placement):**
1. `setBlock()` → Update sub-chunk
2. Mark player-modified for persistence
3. Queue lighting update
4. Mark neighbor chunks dirty (for edge meshing)
5. Queue liquid physics (if water/lava)
6. Worker builds greedy mesh
7. Mesh applied to GPU

---

### `src/world/blocks/` - Block System

Block type definitions using flyweight pattern (stateless singletons).

**Key Files:**
- `Block.ts` - Abstract base classes: `Block`, `SolidBlock`, `TransparentBlock`
- `BlockIds.ts` - Enum of all block IDs (0=AIR, 1-28 for blocks)
- `BlockRegistry.ts` - Singleton registry mapping IDs to block instances
- `FaceTextureRegistry.ts` - Maps block+face to TextureId for greedy meshing
- `registerDefaultBlocks.ts` - Registers all 29 default blocks at startup

**Block Structure:**
```
types/{block_name}/
├── assets/
│   └── texture.webp
└── BlockNameBlock.ts
```

**Creating Texture Assets with AI:**

When generating textures using AI image generation tools (like the `generate_image` MCP tool), transparent blocks (flowers, crops, plants, etc.) require special handling:

1. **Request transparent/alpha backgrounds explicitly** in your prompt:
   - Include phrases like "on a transparent background", "PNG with alpha transparency", "cut out with no background"
   - Example prompt: "Pixel art yellow flower with green stem, cut out on transparent background, 32x32 pixels"

2. **Post-process generated images** to remove backgrounds:
   - AI tools often generate images with solid backgrounds even when transparency is requested
   - Use ImageMagick to remove backgrounds before converting to webp:
   ```bash
   # Remove white/light backgrounds and convert to webp with transparency
   convert input.png -fuzz 10% -transparent white -quality 90 output.webp

   # For more complex backgrounds, use flood fill from corners
   convert input.png -fuzz 15% -fill none -draw "alpha 0,0 floodfill" -quality 90 output.webp
   ```

3. **Verify transparency** before committing:
   - Open the webp file and confirm the background is transparent, not white/gray
   - Test in-game to ensure cross-billboard geometry displays correctly

**Block Types:**
- **Solid**: Stone, Dirt, Grass, Oak Log, Ore blocks
- **Transparent**: Glass, Water (8 levels), Lava (8 levels)
- **Special**: Torch (custom geometry, light emission), Forge (stateful, UI)

**Key Methods:**
- `getTextureForFace(face)` - Returns TextureId for atlas lookup
- `shouldRenderFace(neighbor)` - Face culling logic
- `getDrops()` - Items dropped when mined
- `onPlace()`, `onBreak()`, `onNeighborChange()` - Lifecycle hooks

---

### `src/world/generate/` - World Generation

Procedural terrain generation with biomes, caves, and features.

**Key Files:**
- `WorldGenerator.ts` - Main coordinator, generation queue, priority management
- `BiomeGenerator.ts` - Abstract biome with full generation pipeline
- `BiomeRegistry.ts` - Biome selection (16×16 chunk regions)
- `TerrainGenerator.ts` - Height-based terrain filling
- `SimplexNoise.ts` - Seeded noise for deterministic generation
- `caves/CaveCarver.ts` - Noise-density cave carver (lattice-sampled 3D fields)
- `caves/CaveConfig.ts` - Per-biome cave config + blendable flat parameters
- `features/OreFeature.ts` - Gaussian Y-distribution ore veins
- `features/WaterFeature.ts` - Depression-based water pools
- `features/CliffFeature.ts` - Noise-based cliff formations
- `structures/OakTree.ts` - Procedural tree placement

**Generation Pipeline:**
1. Select biome for region (16×16 chunks)
2. Generate base terrain with biome blending
3. Carve caves from the density field (cheese caverns + spaghetti tunnels + ravines)
4. Fill water depressions
5. Propagate initial skylight
6. Apply features (ores, cliffs)
7. Place decorations (trees) on main thread

**Cave System (noise-density carving):**

Caves are carved from continuous noise fields evaluated per block — no worm
tracing, so carving is purely local and seamless across chunk borders.
Three layers combine (see `caves/CaveConfig.ts` for all parameters):
- **Cheese**: 3D fractal noise above a threshold → large open caverns
- **Spaghetti**: two 3D noises both near zero → winding tunnels that swell/pinch
- **Ravines**: 2D ridge noise → deep tapered canyons open to the sky

Near the surface, caves pinch closed over `surfaceFalloffDepth` blocks —
except inside *entrance zone cores* (2D noise above `entrance.threshold`),
where the falloff is cancelled and cheese carving is boosted (the boost
shares the falloff's depth curve, keeping the threshold monotone toward the
surface — different decay rates would carve bowls sealed under a lid). Each
strong core also carves a guaranteed **entrance ramp**: the entrance field is
sampled at coordinates sheared by world Y, producing a constant-cross-section
tube at ~45° that runs from a surface mouth down `entrance.depth` blocks into
the cave band. The requirement is depth-constant, so ramps always reach full
depth (a depth-narrowing cone pinches out early unless the noise peak is
improbably strong — that bug produced blind stub entrances). Ravines are additionally gated by a
low-frequency density mask (`ravine.density`, ~0.3 keeps a quarter of the
lines) that culls whole ravines rather than thinning them. Carved blocks
below `floodLevel` become `floodBlockId` (lava, swamp water). Columns whose
surface is below `liquidSurfaceGuardY` suppress entrance mouths (ravines are
allowed through pools — draining waterfalls are a feature).

Each biome sets its own `caves: CaveConfig` in `BiomeProperties`; all numeric
parameters are blended per-column across biome borders in the worker (same
bilinear machinery as terrain height). Performance: the 3D fields are sampled
on a 4-block lattice and trilinearly interpolated (~50× fewer noise calls).
NOTE: entrance/ravine/spaghetti thresholds are calibrated against this
codebase's SimplexNoise output distribution (2D raw > 0.5 covers ~18% of
area, `norm() > 0.87` ≈ 5%) — tune with that in mind, not assuming a
narrow bell curve.

**Biomes:**
- **Layer 1 (Surface, Y=128-511)**: Plains, Grassy Hills, Desert, Volcanic, Jungle, Swamp
- **Layer 0 (Underground, Y=0-127)**: Hell

**Biome Layer System:**
Biomes are assigned to vertical layers:
- **Layer 0**: Underground biomes (Y=0-127, sub-chunks 0-3)
- **Layer 1**: Surface biomes (Y=128-511, sub-chunks 4-15)

When creating a new biome:
1. Set `layer: 0` or `layer: 1` in `BiomeProperties`
2. Register in `BiomeRegistry.ts` with the correct layer
3. Add biome type to `BiomeType` union in `GenerationConfig.ts`

The biome mini-map HUD automatically shows biomes for the player's current layer.

**CRITICAL: Feature Registration for Workers**

When creating a new Feature class (extends `Feature`), you **MUST** register it in TWO places for worker communication:

1. **`src/world/generate/WorldGenerator.ts`** - Serialization (main thread → worker)
   - Import the feature class
   - Add a case in `createWorkerBiomeConfig()` to serialize the feature to a plain object

2. **`src/workers/ChunkGenerationWorker.ts`** - Deserialization (worker reconstruction)
   - Import the feature class and its config type
   - Add the feature type to the `FeatureConfig` type union
   - Add a case in the feature reconstruction switch to instantiate the feature

Example for a new `MyFeature`:
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

---

### `src/workers/` - Web Workers

Off-main-thread computation for heavy operations.

**Worker Files:**
- `ChunkGenerationWorker.ts` - Terrain, caves, features, initial lighting
- `GreedyMeshWorker.ts` - Face merging, atlas UV mapping, vertex generation
- `ChunkMeshWorker.ts` - Visible block detection (legacy)
- `LightingWorker.ts` - Skylight/blocklight propagation
- `SoftwareOcclusionWorker.ts` - CPU depth buffer rasterization
- `PersistenceWorker.ts` - IndexedDB save/load operations
- `WorkerChunk.ts` / `WorkerSubChunk.ts` - Lightweight chunk data for workers

**Communication Pattern:**
```typescript
// Main thread sends buffers, transfers ownership
postMessage(request, { transfer: [blocks.buffer, light.buffer] })

// Worker processes, returns with transfer
self.postMessage(result, { transfer: [result.blocks.buffer] })
```

**Worker Constraints:**
- No DOM/WebGL access
- Must register blocks independently
- Use shared interfaces (IChunkData, ISubChunkData)
- Pre-allocated objects to avoid GC in hot paths

---

### `src/physics/` - Physics System

AABB-based collision detection with swept volume resolution.

**Key Files:**
- `PhysicsEngine.ts` - Main simulation engine (gravity, collision, grounding)
- `PhysicsBody.ts` - Entity with position, velocity, compound hitbox
- `WorldPhysicsAdapter.ts` - Adapts WorldManager for collision queries
- `collision/AABB.ts` - Axis-aligned bounding box implementation
- `collision/CollisionDetector.ts` - Swept AABB collision resolution
- `constants.ts` - Physics constants (gravity, velocities, player dimensions)

**Physics Constants:**
| Constant | Value | Purpose |
|----------|-------|---------|
| GRAVITY | -28.0 | Blocks/s² |
| TERMINAL_VELOCITY | -78.4 | Max fall speed |
| JUMP_VELOCITY | 9.0 | ~1.25 block jump |
| PLAYER_WIDTH/DEPTH | 0.6 | Hitbox dimensions |
| PLAYER_HEIGHT | 1.8 | Hitbox height |
| EYE_HEIGHT | 1.62 | Camera offset |

**Collision Resolution:**
1. Calculate desired movement: `velocity × deltaTime`
2. Expand AABB by velocity (swept volume)
3. Query solid blocks in swept region
4. Resolve Y-axis first (gravity + grounding)
5. Resolve X-axis, then Z-axis
6. Update position and zero velocity on collision axes

**Compound Hitbox:**
Player uses cross/plus-shaped dual AABB to reduce corner-catching:
- X-aligned box: full width, reduced depth
- Z-aligned box: reduced width, full depth

---

### `src/player/` - Player Systems

Player state, controls, and block interactions.

**Key Files:**
- `PlayerState.ts` - Inventory (toolbar + grid), item management
- `FirstPersonCameraControls.ts` - WASD movement, mouse look, flying mode
- `BlockRaycaster.ts` - DDA voxel raycasting for block targeting
- `BlockInteraction.ts` - Left-click mining with progress tracking
- `BlockPlacement.ts` - Right-click block placement with collision check
- `BlockInteractionHandler.ts` - E-key block UI interaction (forge, etc.)
- `MiningDamage.ts` - Tool effectiveness calculations
- `ToolbarInput.ts` - Hotbar selection (1-9, 0, mouse wheel)
- `InventoryInput.ts` - Inventory toggle (I/Q key)

**Controls:**
| Key | Action |
|-----|--------|
| WASD | Move (camera-relative) |
| Space | Jump / Fly up |
| Shift | Fly down |
| Ctrl+Alt+P | Toggle flying |
| 1-9, 0 | Select hotbar slot |
| Mouse Wheel | Cycle hotbar |
| I / Q | Toggle inventory |
| E | Interact with block |
| Left Click | Mine block (hold) |
| Right Click | Place block |

**Mining Formula:**
```
blockHP = hardness × 5.0
miningTime = blockHP / (toolDamage × tagMultiplier)
```

---

### `src/items/` - Item System

Items and tools with tag-based classification.

**Structure:**
```
items/
├── Item.ts                 # Base class (IItem interface)
├── interfaces/IToolStats.ts
├── tags/ItemTags.ts        # WOOD, STONE, METAL, ORE, FUEL, BAR
├── blocks/                 # Block drop items
├── ores/                   # Raw ore items
├── bars/                   # Smelted metal bars
└── tools/
    ├── ToolItem.ts         # Base tool class (maxStackSize=1)
    ├── pickaxe/            # 5 tiers
    ├── shovel/             # 5 tiers
    └── axe/                # 5 tiers
```

**Tool Tiers:** Wood → Stone → Iron → Steel → Diamond

**Tool Stats:**
- `demolitionForce` - Minimum force to mine blocks
- `damage` - Base damage per second
- `damageMultipliers` - Tag-based bonuses (pickaxe → stone, axe → wood)

**CRITICAL: Item Registry**

When creating a new item, you **MUST** register it in `src/persistence/ItemRegistry.ts`. This is essential for inventory persistence - items that are not registered will be lost when the game is saved and loaded.

To register an item:
1. Import the item class at the top of `ItemRegistry.ts`
2. Add a `registerItemFactory()` call in `initializeItemRegistry()` with the item's ID

Example:
```typescript
// At the top - import the item
import { MyNewBlockItem } from '../items/blocks/my_new/MyNewBlockItem.ts'

// In initializeItemRegistry() - register the factory
registerItemFactory('my_new_block', () => new MyNewBlockItem())
```

The item ID passed to `registerItemFactory()` must exactly match the `id` property of the item class.

---

### `src/ui/` - User Interface

DOM-based overlays rendered above the WebGL canvas.

**Key Files:**
- `Toolbar.ts` - Bottom hotbar (10 slots)
- `Inventory.ts` - Grid inventory overlay (10×8)
- `CraftingPanel.ts` - 3×2 crafting grid + recipe list
- `FpsCounter.ts` - Performance stats overlay
- `SettingsMenu.ts` - Pause menu with settings pages
- `LoadingScreen.ts` - World generation progress
- `Crosshair.ts` - Center screen crosshair
- `DragDropHandler.ts` - Inventory drag-drop system
- `SlotRenderer.ts` - Item icon/count rendering
- `DebugManager.ts` - Debug mode cycling (Ctrl+Shift+P)
- `blockui/` - Block-specific UIs (ForgeUI)

**Z-Index Layers:**
- 25: Toolbar (normal)
- 30: Crosshair, FPS counter
- 35: Inventory overlay
- 40: Toolbar (raised during inventory)
- 1000: Loading screen, drag ghost

---

### `src/settings/` - Settings System

User-configurable graphics options with localStorage persistence.

**GraphicsSettings:**
| Setting | Type | Default | Options |
|---------|------|---------|---------|
| cullingEnabled | boolean | false | Toggle |
| resolutionPreset | string | 'native' | 720p, 1080p, 1440p, 4k, native |
| framerateLimit | number | 9999 | 30, 60, 80, 120, 240, unlimited |
| shadowsEnabled | boolean | false | Toggle |
| shadowMapSize | number | 4096 | 1024, 2048, 4096, 8192 |

**Persistence:** Auto-saves to `localStorage['slopmine:graphicsSettings']` on every change.

---

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

---

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

### Performance Patterns

- **Object Pooling**: Pre-allocate vectors, AABBs, and result objects to avoid GC
- **Adaptive Budgeting**: TaskScheduler dynamically allocates frame budget
- **Worker Offloading**: Heavy computation runs off-main-thread
- **Zero-Copy Transfers**: ArrayBuffer ownership transferred between threads
- **Greedy Meshing**: Merge adjacent faces to reduce vertex count
- **Two-Stage Culling**: Frustum then occlusion for minimal draw calls

---

## Key Interfaces

### World Interfaces (`src/world/interfaces/`)

```typescript
interface IWorldCoordinate { x: bigint; y: bigint; z: bigint }
interface IChunkCoordinate { x: bigint; z: bigint }
interface ILocalCoordinate { x: number; y: number; z: number }

interface IBlock {
  readonly properties: IBlockProperties
  getTextureForFace(face: BlockFace): TextureId
  shouldRenderFace(neighborBlock: IBlock, face: BlockFace): boolean
  getDrops?(): IItem[]
  onPlace?(world: IWorld, pos: IWorldCoordinate): void
  onBreak?(world: IWorld, pos: IWorldCoordinate): void
}

interface IChunkData {
  getBlockId(x: number, y: number, z: number): number
  setBlockId(x: number, y: number, z: number, id: number): void
  getSkylight(x: number, y: number, z: number): number
  getBlocklight(x: number, y: number, z: number): number
}
```

### Physics Interfaces (`src/physics/interfaces/`)

```typescript
interface IPhysicsBody {
  readonly position: Vector3
  readonly velocity: Vector3
  readonly isOnGround: boolean
  skipPhysics: boolean
  getAABBs(): AABB[]
}

interface IPhysicsWorld {
  getBlockCollisions(region: AABB): AABB[]
  isSolidBlock(x: number, y: number, z: number): boolean
}
```

### Task Interfaces (`src/core/interfaces/`)

```typescript
interface ITask {
  readonly id: string
  readonly priority: TaskPriority
  enabled: boolean
  execute(deltaTime: number, remainingBudgetMs: number): ITaskResult
}

interface ITaskResult {
  completed: boolean
  elapsedMs: number
  workUnits?: number
}
```
