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
2. **Rendering**: Renderer, graphics settings (texture filtering applied before any block texture uploads)
3. **Player Systems**: PlayerState, UI elements, camera controls, input handlers
4. **World System**: WorldManager, WorldGenerator, block texture array, LOD palette, PersistenceManager
5. **Physics**: WorldPhysicsAdapter, PhysicsEngine, player body, entities
6. **Far terrain + environment**: DistanceFog, LodRenderer/LodManager (+ `syncViewDistance()`),
   WorldLighting, BiomeAtmosphere → Skybox / BiomeSkyboxManager, HeldItemRenderer, LiquidOverlay
7. **Interactions**: BlockInteraction, BlockPlacement, BlockRaycaster + BlockOutline, BlockInteractionHandler
8. **Game Loop**: TaskScheduler with priority-based task execution. Loading ends once enough
   columns exist AND `warmUpWorldShaders` (ShaderWarmup.ts) has compiled the shared chunk
   (opaque, leaf cutout + its shadow depth) and liquid programs, so first sight of leaves or
   water never stalls on a program link; add new shared world materials to `worldWarmupMaterials`

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
        │                     ├─► LOD handoff (lodManager.updateVisibility) + syncViewDistance
        │                     ├─► Frustum Culling
        │                     ├─► Occlusion Culling (Worker)
        │                     ├─► LOD visibility filter (hide non-revealed full detail)
        │                     ├─► Scene: chunks, LOD regions, liquids, sky dome (renderOrder 500)
        │                     ├─► Held Item Overlay
        │                     └─► Liquid (underwater) Overlay
        │
        ├─► CRITICAL: Camera, Physics, Mining, Atmosphere ('skybox'), Block Outline, Liquid Overlay
        ├─► HIGH: Lighting (LightEngine queue)
        ├─► NORMAL: World Gen (+ feature work / sub-chunk unloads), LOD queue/apply, block systems
        └─► LOW: Liquid Physics

WORLD PIPELINE:
WorldGenerator ──► ChunkGenerationWorker ──► WorldManager ──► LightEngine
   (load rule,     (terrain, features,           │           (main thread: border
    surface band)   local light)                 │            merge, edits, unloads)
                                          GreedyMeshWorker
                                                  │
                                              Renderer ◄── LodRenderer ◄── LodManager ◄── LOD worker pool
                                                           (region meshes)  (tiles, handoff) (ChunkGenerationWorker
                                                                                              lod-* messages)
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
- `CRITICAL` (0): Always runs - physics, input, controls, and cheap per-frame visual state
  (atmosphere/sky/fog/daylight, block outline, underwater overlay - skipped frames showed stale sky)
- `HIGH` (1): Can defer briefly - the budgeted light queue ('lighting')
- `NORMAL` (2): Background work - world generation, LOD tiles/meshes, block systems
- `LOW` (3): Lowest priority - liquid physics

**Frame Budget Algorithm:**
- Rolling average frame time with 10% adaptation rate
- Budget = avgFrameTime × 0.25 (25% of frame)
- Clamped between 1ms and 8ms
- CRITICAL tasks bypass budget; others skip when exhausted

---

### `src/renderer/` - Rendering System

Three.js-based rendering with optimized voxel mesh handling.

**Key Files:**
- `Renderer.ts` - WebGLRenderer (sRGB output, NO tone mapping - three applies fog after tone
  mapping, so the fog would stop matching the sky; see the comment there), scene, camera (100° FOV),
  resolution presets; `setChunkVisibilityFilter()` (LOD handoff hides non-revealed full-detail
  chunks, applied after culling) and `setFarPlane()` (only called from main.ts `syncViewDistance()`)
- `GreedyChunkMesh.ts` - Builds a sub-chunk's meshes from the greedy mesh worker result (greedy quads + instanced non-greedy blocks + liquids)
- `ChunkMaterial.ts` / `ChunkVertexFormat.ts` - Chunk materials (Lambert + onBeforeCompile: texture array, smooth light, AO) and the 12-byte packed vertex format
- `lightCurve.ts` / `worldLightShader.ts` - THE light level → brightness curve (Minecraft-style, 1 level per block; block light uses a brighter `BLOCK_LIGHT_LIFT` and a warm `BLOCK_LIGHT_COLOR`) and its shader side, with the global `daylight` and `uLightFloor` (light where no sky/block light reaches) uniforms; every world-lit surface (chunks, instanced blocks, liquids, LOD, held item, entities) uses them
- `EmissiveTextures.ts` - Registry of glowing block textures (`registerEmissiveTexture(textureId, {strength, threshold})`, called next to `registerTextureUrl`): the chunk shader adds their hot texels as emissive light, so emitters (magma, ember veins, mushroom caps) glow in the dark instead of being lit only by their neighbours
- `InstancedBlockLight.ts` - World light for instanced blocks (instanceColor carries light levels, see Miniature block displays)
- `interfaces/IChunkMesh.ts` - `IChunkMesh`, the sub-chunk mesh as culling and debug wireframes see it
- `FrustumCuller.ts` - First-pass visibility culling via AABB-frustum intersection
- `SoftwareOcclusionCuller.ts` - Second-pass CPU depth buffer occlusion (256×128)
- `BlockTextureArray.ts` - One `DataArrayTexture` layer per greedy face texture (tiles across merged quads, no bleeding); minification follows the Texture Filtering setting (`TextureLoader.setTextureFiltering`: crisp `NearestMipmapLinear` default, or smooth trilinear), anisotropy 16. Magnification is LINEAR on the sampler and made pixel-crisp in the shader (`crispTexelSampling.ts`: sample at the texel centre with the true UV gradients) - never force anisotropy onto a NEAREST-magnified texture: ANGLE/D3D11 (Windows) and SwiftShader then interpolate magnified texels, which is why three.js skips it. `loadBlockTexture` textures (instanced blocks, held items) stay NEAREST-magnified and get anisotropy only where a startup probe (`anisotropyProbe.ts`) shows the backend keeps them crisp; liquid textures magnify linearly and sample through `slopCrispTexel` like the array
- `TextureAtlas.ts` - Texture URL registry (`registerTextureUrl` / `getTextureUrls`)
- `WorldLighting.ts` - Warm directional sun (fixed 10am, `getSunDirection()`), cool hemisphere/ambient fill, biome light tint (`setTint`), shadows (PCF soft)
- `skybox/Skybox.ts` - Colour-managed sky dome shader (gradient, sun disc/halo, drifting noise clouds); `fog: false`, pinned to the far plane, renderOrder 500 (drawn after world geometry); `getHorizonColor()` is the fog colour
- `skybox/BiomeAtmosphere.ts` / `BiomeSkyboxManager.ts` - Per-biome sky/fog/light state (`SkyboxSettings` in `BiomeProperties`: colours in sRGB, light multipliers linear), blended across biome borders and eased (see Atmosphere below)
- `DistanceFog.ts` - Owns the scene's ONE persistent `THREE.Fog` (never swapped - that recompiles every material): spherical edge fade + absolute aerial haze (1500 blocks in clear air ÷ biome `fogDensity`^1.5), so the long (LOD) view gets depth and hazy biomes tint rather than erase it; `setViewDistance(blocks)` (applies immediately), `setColor`, `setDensity`, `setOverride` (underwater: haze + far)
- `LiquidMaterials.ts` - One shared animated material per liquid family (water, swamp water, lava): liquid vertex colours carry light LEVELS `(sky/15, block/15, 1)` shaded with the world light model at render time (white = full light for icons), texture drift, sun glitter + Fresnel horizon reflection
- `LiquidOverlay.ts` - Full-screen tint while the camera is inside a liquid; underwater fog is a
  `DistanceFog.setOverride()` on the same fog object (never a fog swap). Water and swamp-water
  haze + tint are scaled every frame by the world light model at the brighter of the camera cell
  and the liquid's surface (dark in a flooded cave, unchanged in a daylit lake); lava is self-lit.
  While overridden the sky dome shows the fog colour (`Skybox.setFogOverride`)
- `BlockOutline.ts` - Dark 2 CSS-px outline (`LineSegments2`, one draw) around the targeted block's
  interaction box; its own `BlockRaycaster` in the CRITICAL 'block-outline' task, gated like
  mining (pointer locked and player alive - hidden while inventory/menus are open)
- `lod/LodRenderer.ts` / `lod/LodMaterial.ts` - Far-terrain region meshes (see LOD Far Terrain below)
- `helditem/HeldItemRenderer.ts` - First-person held item with bob/swing animations; lit by the world
  light model (`setWorldLight(packedLight)`) and the biome light tint (`setLightTint`)
- `MiningOverlay.ts` - Block mining progress visualization

**Rendering Pipeline (per frame, `render()` in main.ts):**
1. LOD handoff: `lodManager.updateVisibility()` (after this frame's mesh results were applied), then
   `syncViewDistance()` (fog far + camera far plane)
2. Frustum culling (hide sub-chunk meshes outside view), if culling is enabled
3. Software occlusion culling (hide sub-chunks behind opaque geometry)
4. LOD visibility filter (hide full detail of columns that are not revealed yet)
5. Render the scene: opaque chunks + leaf cutout (alpha-to-coverage, opaque pass), LOD regions,
   instanced blocks, then blended liquids/glass; the sky dome draws after opaque geometry
   (renderOrder 500) and only shades uncovered pixels
6. Render held item overlay, then the underwater liquid overlay
7. Update debug wireframes (if enabled)

**Performance Optimizations:**
- Greedy meshing merges adjacent faces into larger quads, but only where smooth light/AO interpolate
  identically (noisy cave walls stay 1×1); most of the memory win comes from the 12-byte vertex
- Instanced rendering for non-greedy blocks
- Pre-allocated object pools to avoid GC pressure
- Manual GPU memory cleanup on chunk unload
- Texture array layers repeat per block, so merged quads need no atlas padding
- Chunk, liquid and LOD vertex arrays are released after GPU upload - so on `webglcontextlost`
  every sub-chunk mesh and LOD region is dropped and rebuilt (`WorldManager.setRenderer`,
  `LodManager.onContextLost`); anything new that frees its arrays needs the same treatment
- LOD far terrain instead of more full-detail chunks for view distance (see `src/world/lod/`)

**World light model (every world-lit surface):** light levels (0-15 sky, 0-15 block) are turned into
brightness ONLY by `lightCurve.ts` / `worldLightShader.ts`: chunks (smooth per-corner light + AO in
the vertex), instanced blocks (`instanceColor` = light levels), liquids (vertex colour = levels),
LOD terrain (the chunk's biome skylight cap), the held item (`worldLightTerms`: rig lights × sky
term plus a π-intensity ambient carrying the non-directional term) and mobs (`ObjectWorldLight.ts`
shader patch on their registered materials, a per-material light-level uniform). Sky
light scales the scene lights (sun, hemisphere, ambient) times the global `daylight` uniform; block
light is a separate warm, non-directional term; `uLightFloor` is what remains where neither reaches.
Never fold the non-directional term into scene lights (Lambert's 1/π and N·L darken it 24-59%).
`daylight` and the floor come from the biome atmosphere every frame (`setWorldDaylight`,
`setWorldLightFloor` in the 'skybox' task). Level 15 sky in full daylight shades exactly like the
plain scene lights. Glowing blocks add emissive texels via `EmissiveTextures.ts`.

**Atmosphere (sky, fog, light rig):** one `BiomeAtmosphere` is the per-frame state; the CRITICAL
'skybox' task eases it toward the camera biome's `SkyboxSettings` (`BiomeSkyboxManager`, blended
across biome borders) and pushes it to the sky dome, `DistanceFog` (colour =
`skybox.getHorizonColor()`, density), `WorldLighting.setTint`, the held item, the liquid Fresnel
colour, and the daylight/light-floor uniforms.
- `SkyboxSettings` (in `BiomeProperties`). Authored in sRGB (perceptual): `brightness` and the
  colours `tint`, `fogColor`, `undergroundFogColor`, `lightTint`, `clouds.color`. Linear: `minimumLight`
  (light floor as an RGB multiplier of albedo, e.g. Hell's red ember glow (0.32, 0.15, 0.11)) and
  `daylight` (0-1 overcast dimming - swamp 0.62, coastal rainforest 0.82). Scalars: `fogDensity` (≥ 1,
  shortens the absolute haze distance), `clouds.coverage` (default 0.42) and `clouds.opacity` (swamp
  grey overcast 0.65, volcanic dark ash 0.6, desert 0.2). Use `daylight` for a biome's gloom, NOT a
  `skylightValue` cap (caps are baked per sub-chunk and draw hard 32-block light steps at region
  borders; Hell uses cap 0).
- `DistanceFog` owns THE fog; `setViewDistance` is called only by `syncViewDistance()` (the drawn
  LOD ring's reach × 32 while LOD is drawn, else `chunkDistance` × 32), so fog and far plane always agree.
  The global `fog_vertex` override makes fog spherical (true distance, not view depth - no fog-free
  screen edges at 100° FOV); the `fog_fragment` override reinterprets `THREE.Fog`: `far` = edge
  fade (0.6·far → far), `near` = exponential aerial haze distance. Every fogged material shares
  these patches; keep `fog: true` on world materials.
- Sky materials have `fog: false`; the dome is pinned to the far plane, dithered against banding,
  and includes three's colour-space chunk (colour-managed). Any future opaque object that does not
  write depth must draw after it (renderOrder > 500).
- `WorldLighting`: warm sun (fixed 10am, `getSunDirection()` also drives the sky's sun disc),
  hemisphere + ambient fill, optional PCF soft shadows.

**Liquids:** each family (water, swamp water, lava) has ONE shared animated `MeshPhongMaterial`
(`LiquidMaterials.ts`) and one texture for all its levels; its sun glitter is gated by the texel
luminance range `glitterLuma`, tuned per family to its texture (regenerated textures need a retune). Chunk liquid geometry is built in
`GreedyChunkMesh.buildLiquidMesh` (faces inset only along their normal; TOP/BOTTOM winding
reversed) with vertex colours = light levels. Face rules (GreedyMeshWorker): a partial block's
(level < 8) TOP is always drawn (its surface sits below the cell top, so nothing above is flush);
otherwise no face against an opaque block or a liquid of another family; TOP/BOTTOM hidden inside
the same family; side faces within one family only on the taller block of a height step, and
only above the lower block's surface (the worker packs that clip height into the face-visibility
value, `LIQUID_SIDE_CLIP_SHIFT` in ChunkVertexFormat.ts). Falling liquids (ids 77-79) mesh as
liquid faces of their family. Which blocks are liquids, and their family and level, come from
the block properties (`isLiquid`, `liquidFamily`, `liquidLevel`): `buildLiquidMeshEntries`
(`src/world/meshing/LiquidMeshTable.ts`) builds the worker's table, sent with each mesh worker's
first job, and `GreedyChunkMesh` checks `isLiquid` - a new liquid needs no id list. Non-chunk geometry drawn with these materials (icons) must carry WHITE vertex colours
(`withWhiteVertexColors`, `liquidCubeGeometry`).

---

### `src/world/` - World Management

Core voxel data storage, chunk lifecycle, and world coordination.

**Key Files:**
- `WorldManager.ts` - Central coordinator for chunks, meshing, lighting, liquid physics
- `chunks/ChunkColumn.ts` - 32×32×512 column (world height 512, Y 0-511) holding up to 16 sub-chunks (loaded individually)
- `chunks/SubChunk.ts` - 32×32×32 voxel grid: blocks `Uint16Array`, light `Uint8Array`, metadata `Uint8Array`, plus light/mesh version counters
- `chunks/ChunkManager.ts` - Chunk storage and lifecycle management
- `coordinates/CoordinateUtils.ts` - World↔Chunk↔Local coordinate conversions
- `lighting/LightEngine.ts` - Main-thread light engine: sub-chunk load integration, block edits, column and single sub-chunk unloads, budgeted queue, mesh invalidation (padded 34³ volume)
- `lighting/ColumnSkyState.ts` - Per-column sky floor / sky proof (unknown data = dark)
- `lighting/SubChunkLight.ts` - Isolated sub-chunk light pass (generation worker; saved sub-chunks via the worker's light-only job, `WorldManager.lightSavedSubChunkInWorker`)
- `lighting/LightTables.ts` - Per-block opacity class (opaque / diffuse / clear), closed slab/stair faces (`verticalStop`, `closedLightFaces`) and emission
- `liquid/BackgroundLiquidPhysicsManager.ts` - Water/lava flow simulation in `LiquidPhysicsWorker`s (flow rules in `LiquidPhysicsAlgorithm.ts`); `LiquidRegistry.ts` - liquid families and levels. Jobs get only light-ready data; the worker reads anything else as unknown (solid) and leaves liquid next to it alone. Results apply compare-and-set (`BlockChange.oldBlockId`: a cell changed since the snapshot keeps its block and its column is recomputed). Follow-up passes only after applied changes; a column whose pass changed nothing is *settled* and skipped by the 30 s scan until something changes around it (edit, liquid flowing in, sub-chunk load/unload - `onColumnDataChanged`)
- `meshing/MeshNeighborShell.ts` - Layout of the 1-block neighbour shell (6 slabs, 12 edges, 8 corners of block ids + light) sent with every mesh job; `WorldManager.getMeshNeighborShell()` builds it and only counts `lightReady` neighbours as present
- `lod/` - Far-terrain LOD (see below)
- `blockstate/BlockStateManager.ts` - Per-block persistent state (chests, forges)
- `blockstate/BlockTickManager.ts` - Frame-based block state updates
- `blocktick/ScheduledBlockTicks.ts` - Slow interval-based block ticks (leaf decay)

**Chunk Architecture:**
```
ChunkColumn (32×32×512)
├── SubChunk 0  (Y: 0-31)      ┐ layer 0 (Hell): sub-chunks 0-3, Y 0-127
├── SubChunk 1  (Y: 32-63)     ┘
├── ...                          layer 1 (surface): sub-chunks 4-15, Y 128-511 (sea level 240)
└── SubChunk 15 (Y: 480-511)
```

**Memory Layout:** Y-major indexing for cache-friendly horizontal iteration:
```
index = y * SIZE_X * SIZE_Z + z * SIZE_X + x   // = y * 1024 + z * 32 + x
```

**Light Data Packing:**
```
Uint8: High nibble = Skylight (0-15), Low nibble = Blocklight (0-15)
```

**Light Semantics (Minecraft-style):** direct skylight (column sky-clear up to the
world top, as far as loaded/proven) holds the sub-chunk's biome cap and travels
straight down undiminished; every other step costs 1 (opaque blocks block, leaves
and liquids stop direct sky). Slabs and stairs (`blocksVerticalLight`) pass no light through
their full horizontal face - the bottom one, or the top one when placed upside down (metadata
flip bit); through their other faces they act like leaves. Trapdoors, doors and fences are clear.
Emitters hold their `lightLevel`. Unloaded data is
dark; light is never persisted (recomputed on load).

**Data Flow (Block Placement):**
1. `setBlock()` → Update sub-chunk
2. Mark player-modified for persistence
3. LightEngine relights synchronously within a 1.5 ms per-frame budget (large relights, bulk edits
   and batched writes - liquid flushes, decoration writers - run in the budgeted lighting task)
4. Every sub-chunk whose padded mesh volume changed is remeshed once its light settled
5. Queue liquid physics (if water/lava)
6. Worker builds greedy mesh
7. Mesh applied to GPU

**Streaming & persistence invariants:**
- Generation requests carry a `requestId` that `ChunkGenerationWorker` echoes; replies are paired by
  id, never by sub-chunk (several requests for one sub-chunk can be in flight). A column's
  sub-chunks go to one generation worker (its `ColumnHeights` cache). A worker error fails its
  in-flight requests; `WorldGenerator` retries a failed sub-chunk (3x, growing delay).
- A generation job whose column unloads while it runs (including during its decorations, which
  yield) is cancelled: its result is discarded even if the column is wanted again when it lands,
  and the sub-chunk is requested afresh. Results never re-create an unloaded column.
- `WorldManager.unloadSubChunk()` unloads ONE sub-chunk while its column stays: saves it, takes its
  light out (`LightEngine.onSubChunkUnloaded` - face decreases plus its column's sky floor/proof),
  drops its mesh, queued and in-flight mesh work (discarded by job id, like a column's) and its entities.
  `WorldGenerator` unloads resident sub-chunks of in-range columns that left the retained set
  (surface band, or the ellipsoids widened by the unload hysteresis + 1 sub-chunk) - Hell after
  returning to the surface, sky layers after flying - up to 8 per frame from `processFeatureWork()`.
  A sub-chunk unloaded ABOVE its column's sky proof keeps its sky-stopping cells as a placeholder
  (unloaded sub-chunks above the proof count as open sky; a player's sky platform must keep its
  shadow). A column is never unloaded while a decoration pass of one of its sub-chunks is suspended
  (`decoratingColumns`; the unload waits in `deferredColumnUnloads`).
- Persistence (`src/persistence/`): every worker request carries a `requestId` echoed in the
  response (a save and a load of the same sub-chunk are routinely in flight together - unload,
  then the player turns back); saves stay readable in memory until the worker confirms them and
  `loadSubChunk` answers from there first (read-your-writes); a failed read THROWS (it is not "no
  saved data" - regenerating would overwrite the save); `PersistenceWorker` handles messages
  strictly in order. Sub-chunk records are written as format version 2 (the version older builds
  read) with new information only in flags they ignore (no stored light; `FLAG_HAS_SKY_PROOF` +
  `FLAG_SKY_OPEN_ABOVE`) - never bump the written version for an additive change: an older build
  treats an unknown version as "never saved" and overwrites the record. Saves (unloads, autosave)
  skip sub-chunks the store already holds unchanged: `SubChunk.dataVersion` counts block/metadata
  changes (direct array writes must call `markDataChanged()`), `persistedDataVersion` +
  `persistedSkyOpenAbove` record what the store holds (a confirmed load, or a confirmed save).
  Generated data is always saved once - it only regenerates identically while the generator code
  is unchanged, and it changes between builds. Placeholder cells (a neighbour's decorations written before a sub-chunk
  loaded) only fill air when it loads from persistence. `setBlockRaw` (liquid physics) writes only
  into loaded sub-chunks; liquid results for an unloaded column are dropped.
- Mesh jobs: a sub-chunk is remeshed whenever any cell of its padded 34³ volume (itself + the
  1-block shell) changes block id or light, and when any of its 26 neighbours loads or unloads.
  `queueSubChunkForMeshing` never drops a request (a request during an in-flight job is kept) and
  skips sub-chunks that are not `lightReady`; jobs go out once no light work is queued in the 3×3×3
  neighbourhood, stamped with `meshJobVersion` - a stale result is discarded and requeued. Every job
  carries a `jobId` (echoed by the worker); a result or error counts only if it is its sub-chunk's
  pending job, so an unloaded (and reloaded) sub-chunk never shows an old job's result. Failed jobs
  are retried (input changed, or up to 2x for the same input); a crashed worker's jobs are requeued.
  `processPendingMeshResults()` applies ≤16 results within 2 ms and must run exactly once
  per frame in both the loading and gameplay branches (it also resets setBlock's 1.5 ms light budget).
- Mesh currency: `SubChunk.meshDataVersion` is bumped when data arrives for a sub-chunk or any of
  its 26 neighbours and stamped on each mesh job; `onSubChunkMeshAdded(coord, current)` and
  `onSubChunkMeshStale(coord)` tell the LOD handoff whether the displayed mesh was built from
  current data (a job in flight while a neighbour loaded culled its faces toward it).

---

### `src/world/blocks/` - Block System

Block type definitions using flyweight pattern (stateless singletons).

**Key Files:**
- `Block.ts` - Abstract base classes: `Block`, `SolidBlock`, `TransparentBlock`
- `BlockIds.ts` - Enum of all block IDs (0=AIR, 1-162 for blocks)
- `BlockRegistry.ts` - Singleton registry mapping IDs to block instances
- `FaceTextureRegistry.ts` - Maps block+face to TextureId for greedy meshing. Greedy side faces
  read un-mirrored from outside, like three's `BoxGeometry` used by item displays; faces listed in
  `QUARTER_TURN_FACES` get their texture turned a quarter (e.g. bark grain along a fallen log) -
  give the block's display geometry the same turn (`QuarterTurnedCube.ts`)
- `registerDefaultBlocks.ts` - Registers every default block at startup (main thread and each worker)

**Block Structure:**
```
types/{block_name}/
├── assets/
│   └── texture.webp
└── BlockNameBlock.ts
```

**Creating Texture Assets with AI:**

Use the `generate-texture` skill (`.claude/skills/generate-texture/SKILL.md`): it holds the binding
terrain style statement (palette, luma/saturation targets, wood families anchored to their log),
the generation workflow (art-gen MCP, or the Codex CLI when art-gen isn't connected), and the
post-processing pitfalls. Rules that bite most often:

1. **Transparent blocks** (flowers, plants, leaves): request a cut-out/transparent background and
   remove any background the generator still paints; sprite families share one scale (64×64).
2. **Encode lossless WebP with `cwebp`, not ImageMagick:**
   ```bash
   cwebp -quiet -lossless -exact -z 9 -metadata none in.png -o out.webp
   ```
   Lossy WebP smears pixel-art colour edges, and ImageMagick 6 ignores `webp:exact`, writing black
   under alpha-0 texels (leaf holes then mip to black at distance). Keep the leaf average colour
   under the holes.
3. **Check tiling**: seamless on both axes (liquids scroll) and no hidden 2×2 repeat (shift by half
   the tile and compare); verify in game, including cross-billboard geometry for plants.

**Block Types:**
- **Solid**: Stone, Dirt, Grass, Oak Log, Ore blocks
- **Transparent**: Glass, leaves (alpha cutout), Water / Lava / Swamp Water (8 levels each + a falling variant; see Liquids under `src/renderer/`)
- **Special**: Torch (custom geometry, light emission), Forge (stateful, UI)

**Light emitters:** `lightLevel` lights the cells AROUND a block (Minecraft rules, −1 per step);
the block's own faces are lit by its neighbours' lower light. A block that should visibly glow
(magma, ember veins, bioluminescent caps) also registers its face texture with
`registerEmissiveTexture()` (`src/renderer/EmissiveTextures.ts`): hot texels above the threshold
become emissive in the chunk shader. Torch 13, campfire 14, resin torch 15; magma/hell magma 8.

**Key Methods:**
- `getTextureForFace(face)` - Returns TextureId (texture-array layer lookup for greedy blocks)
- `shouldRenderFace(neighbor)` - Face culling logic
- `getDrops()` - Items dropped when mined
- `onPlace()`, `onBreak()`, `onNeighborChange()` - Lifecycle hooks
- `onScheduledTick()` + `properties.tickInterval` - Slow interval ticks (see below)

**Miniature block displays (`src/renderer/itemdisplay/`):**

Every surface that shows a block OUTSIDE the voxel grid — held item in hand,
dropped item entities, block icons, shelf contents — must build its mesh from
`block.getInstanceGeometry()` / `block.getInstanceMaterial()`, the same pair
the world's instanced renderer uses. `src/renderer/itemdisplay/` is the
canonical helper module: `isBlockShapedItem()` / `getBlockForItem()` (item-id
`<name>_block` → registry block, with deliberate icon overrides),
`createBlockDisplayMesh()` (mesh in centered unit block space, shared
resources), and `disposeItemDisplayObject()` (flag-aware disposal that skips
shared geometry/materials). Rules:

- Never build a display mesh from `SharedGeometry.cube` directly — custom
  geometry blocks (torch, flowers, slabs, ladders) would wrongly render as
  cubes. A block that looks right in the world must look right everywhere.
- Never dispose display meshes with naive recursive disposal — use
  `disposeItemDisplayObject()`, which respects the `sharedDisplayResources`
  flag. Disposing the shared singletons corrupts world rendering state.
- A surface that must MUTATE materials (e.g. shelf dimming) takes ownership:
  clone geometry/materials, clear `userData.sharedDisplayResources`, and
  dispose its clones itself (see `ShelfBlockEntity`).
- In chunk InstancedMeshes, `instanceColor` is NOT a tint: it carries the
  instance's (sky, block) light levels, and `InstancedBlockLight.ts` patches
  the shared material for instanced variants only (so displays are
  untouched). Don't use `instanceColor` as a colour with block materials.

**Scheduled Block Ticks (`src/world/blocktick/ScheduledBlockTicks.ts`):**

Reactive, interval-based block logic — distinct from `BlockTickManager` (per-frame
updates for active stateful blocks like a smelting forge). A block type opts in by
declaring `tickInterval` (seconds) in its properties plus an `onScheduledTick()`
hook (return `true` to reschedule, `false` to go dormant). Whenever `setBlock`
changes a block at runtime, the scheduler queues a jittered tick (0.75–1.5×
interval) for that position and its 6 neighbors — only for opted-in block types.
Worldgen and decoration-writer writes (`WorldManager.createDecorationWriter()`, one per decoration pass - never a global mode) bypass `setBlock` side effects, so generated
chunks schedule nothing until disturbed. Ticks drain in a budget-aware NORMAL task.

Used for **leaf decay** (`src/world/blocks/types/leaf_shared/LeafBlock.ts`, the
abstract base class all leaf blocks extend): a leaf with no
log reachable through connected leaves within 6 steps removes itself; each removal
re-queues its neighbors, cascading the melt across a felled tree's canopy.
Any log sustains any leaf type; the 6-step reach
is sized for the widest canopies (pine cone radius 4, redwood cluster radius 5) —
keep it in sync if tree shapes grow.

Also used for **tree felling** (`src/world/blocks/types/log_shared/LogBlock.ts`,
the abstract base class all log blocks extend): a log whose entire connected log
cluster touches nothing but logs, leaves, and non-solid blocks is unsupported —
the whole cluster breaks at once, scattering each log's drops as
`DroppedItemEntity` items (via `WorldManager.setDropSpawner`, wired in main.ts).
Chopping the bottom of a trunk drops the whole tree, then leaf decay eats the
orphaned canopy. Cluster search is capped at 1024 logs (treated as supported
beyond that).

Both rules exempt player builds: `onPlace` stamps metadata bit 7
(`PERSISTENT_PLACED_METADATA_BIT` in `BlockFacing.ts`) on player-placed leaves
and logs — persistent leaves never decay, and a cluster containing any
persistent log never collapses. New leaf/log variants must be added to the
`LEAF_BLOCK_IDS`/`LOG_BLOCK_IDS` sets in BOTH shared base files.

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

**Load rule (streaming):** `WorldGenerator.isSubChunkWanted()` is the single rule for queueing,
applying results and unloading: horizontal radius `chunkDistance` (max 16), vertical ellipsoid
radius `min(ceil(d/2), 4)` sub-chunks around the camera, PLUS every in-range column's *surface
band* (the sub-chunks holding its surface, from the LOD tile or a biome-height estimate; lowered by
one sub-chunk while an applied sub-chunk has an open column - ravines, cave mouths, flooded cuts).
While the camera is above the ground under it, a half-ellipsoid of depth 3 sub-chunks also hangs
below that ground (`LoadCenter.groundSubY`), so pits and cave mouths near a flying player load.
A band's top reaches the sub-chunk holding the air cell above the highest block of the column AND
of its four neighbours (including decorations seen in loaded top rows) - the mesher culls faces
toward missing sub-chunks, so cliff sides and top faces at band edges need them.
Columns unload at `d + 1.5` (hysteresis); single sub-chunks as described under Streaming &
persistence invariants. Results that arrive after the sub-chunk stopped being wanted are dropped.
`processFeatureWork()` (individual sub-chunk unloads) runs every frame, in gameplay too (the
'world-generation-queue' task). There is NO main-thread water pass: the worker's `WaterFeature` fills
every column whose blended base height lies below the biome water level, independently of its
neighbours, so lakes are already continuous across chunk borders. (A former cross-chunk "water
reprocess" filled every air cell above the highest solid block of each neighbour sub-chunk and
flooded caves up to the sub-chunk top; never reintroduce it - runtime liquid physics handles real
flow.) Listeners: `onSubChunkApplied` fires
right after `applySubChunkData` (from the private `onSubChunkDataApplied(coord, blocks)`, which also
records open columns for the band floor) and before decorations; `onColumnUnloaded` right after
`unloadChunk`; `onSubChunkUnloaded` after a single sub-chunk unload. LOD readiness depends on that order.

**Generation stage options:** `generateSubChunk(request, options)` in the worker takes
`SubChunkGenerationOptions` (`caves`, `ores`, `lining`, `skylight` = the local light pass,
`opacity`). Full detail runs everything; LOD tiles run `SURFACE_ONLY_GENERATION` (no light pass, so
they omit `skyOpenAbove`/`lightSeed`). Surface-layer sub-chunks above every column's blended height
skip terrain fill and carving (all-air early-out) but still run water, features and the light pass.

**Generation Pipeline:**
1. Select biome for region (16×16 chunks)
2. Generate base terrain with biome blending
3. Carve caves from the density field (cheese caverns + spaghetti tunnels + ravines)
4. Fill water depressions
5. Apply features (ores, cliffs)
6. Compute local light (after all block writes; merged with neighbours by the LightEngine)
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
surface is at or below `liquidSurfaceGuardY` (set to the biome's
`waterLevel + 2`, so it covers lake/pool beds *and* their shore ring) are
lake/pool beds: they fully suppress entrance mouths and pipes so caves don't
tear open water beds that then drain at runtime. Ravines under such columns
are only *partially* culled — the density mask is tightened by
`ravine.poolCrossDensity` (~0.25), and because the mask is low-frequency
(whole-line) this seals the under-pool segment of ~75% of pool-crossing
ravines while the strongest-mask quarter still cross fully, leaving the
occasional intentional draining waterfall. (Desert `OasisFeature` runs the
same guard the other way: it probes its footprint with `isSurfaceCarvedAt`
and skips any oasis whose bed a cave already breached.)

Each biome sets its own `caves: CaveConfig` in `BiomeProperties`; all numeric
parameters are blended per-column across biome borders in the worker (same
bilinear machinery as terrain height). Performance: the 3D fields are sampled
on a 4-block lattice and trilinearly interpolated (~50× fewer noise calls).
NOTE: entrance/ravine/spaghetti thresholds are calibrated against this
codebase's SimplexNoise output distribution (2D raw > 0.5 covers ~18% of
area, `norm() > 0.87` ≈ 5%) — tune with that in mind, not assuming a
narrow bell curve.

**Biomes:**
- **Layer 1 (Surface, Y=128-511)**: Plains, Grassy Hills, Desert, Volcanic, Jungle, Swamp, Pine Forest, Coastal Rainforest
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

### `src/world/lod/` - LOD Far Terrain

Low-detail surface terrain drawn from the edge of the full-detail disk out to the LOD distance
(default 24 chunks = 768 blocks, about 3× the full-detail radius; Settings > Far Terrain; the
effective distance is at least `chunkDistance + 2`). One mesh (one draw call) per visible 8×8-chunk
*region*: 37 regions and ~1.1M triangles for d=8 + LOD 24.

**Modules:**
- `LodTypes.ts` - constants, `LodTileSummary`, worker message types, slot/region helpers
  (chunk slot = its index 0-63 inside the region).
- `LodTileBuilder.ts` / `LodWorkerService.ts` (worker side): `ChunkGenerationWorker` routes `lod-*`
  messages (`lod-init` palette, `lod-tile`, `lod-mesh-region`, `lod-evict`) to a lazily created
  service. A *tile* per chunk runs the real generation pipeline with `SURFACE_ONLY_GENERATION` (no
  caves/ores/lining/light), walking sub-chunks from the terrain max up until empty (overhanging
  canopies) and down while columns are unresolved; it keeps per-column top, top block and lake-bed
  floor (~8 KB).
- `LodWorkerPool.ts` - 2-3 extra `ChunkGenerationWorker`s (never the full-detail pool), sticky
  region → worker routing. A worker that errors, loses a reply, or has work in flight without
  replying for 20 s is replaced (≤5 times per slot); `LodManager.onWorkerLost` releases its tile
  slots, re-requests its in-flight tiles and re-fetches its built ones (metadata stays valid; the
  region is not remeshed until they are back).
- `LodMesher.ts` (pure, in the worker): region heightfield with a cell size PER CHUNK (chosen by
  `LodManager.cellSizeFor` from the distance to the ring centre: 1 in the handoff annulus
  `chunkDistance - 3 .. chunkDistance + 3`, 2 inside it and out to 16 chunks, 4 beyond, 1 chunk of
  hysteresis; `chunkCellSizes` in the mesh request). Mixed regions are meshed on a 1-block grid in which coarse cells are
  replicated, so size changes are ordinary chunk seams (~35% fewer vertices than one size per
  region). Greedy tops (never across chunks), walls down to lower neighbours, chunk-seam and
  region-border skirts that reach below both sides' lake beds and at least 48 blocks below the cell
  top (ravine ends), T-junction-free. 10-byte vertices: Uint16 xyz in half blocks + sRGB colour +
  chunk slot.
- `LodPalette.ts` - per-block top/side colours averaged from the `getTextureUrls()` images (via
  `FaceTextureRegistry`, not the texture array), carrying the average look of full detail: walls
  ×0.82 (AO), tops ×0.98, leaves per leaf block (`LEAF_SHADES`: oak 1.04, pine 1.0, redwood 1.1,
  snowy pine 1.07), water desaturated/brightened (translucency + reflection), lava brightened
  (glow) - factors matched by rendering the same views with full detail vs LOD forced on and
  comparing, per block, the pixels whose full-detail ray hits it (at 100-180+ blocks).
- `LodManager.ts` (main thread): desired set (every chunk within the LOD distance of the RING
  CENTRE, kept to +1; the ring is re-centred only once the player is 2 chunks from it, so a flight
  rebuilds it every other crossing), nearest-first tile requests (2 per worker, 1 while full-detail
  generation has a queue), region remeshes at most every 250 ms and ≤1/5 of a worker's time (2 s
  beyond 16 chunks, 1 s while a displayed region still has tiles building), and one region mesh
  applied per frame ('lod-apply' task, also during loading so the ring exists at spawn), oldest
  first; a region whose result is still queued isn't remeshed. Tiles leaving the ring are hidden
  through the slot mask, not remeshed away (the region drops them at its next remesh, or after
  4 s); an edge tile dirties the neighbour region only if its floor differs from the neighbour's
  last request. Hides below camera Y 180 (shows again at 184). The worker pool and palette start
  the first time LOD is enabled. `getCoveredDistance()`: how far the ring reaches without gaps.
- `LodColumnReadiness.ts` - per-column band bookkeeping for the handoff.
- `src/renderer/lod/LodRenderer.ts` / `LodMaterial.ts` - one `THREE.Mesh` per region; all region
  materials share one program (Lambert, flat shading, `fog: true`), a per-region `uvec2`
  hidden-slot mask, and the world light model at each chunk slot's open-sky level
  (`LodRenderer.setSkyLightProvider` → the biome's `skylightValue`, 15 unless capped) plus the
  daylight/light-floor uniforms. JS arrays are released after upload (context loss → rebuild).
  Each applied region uploads in that frame: hiding (LOD off-screen underground, handed-off
  regions) clears the region MATERIAL's `visible` (never the mesh's or group's - three uploads only
  traversed meshes), and a new mesh skips frustum culling until uploaded, so turning around or
  surfacing never uploads a backlog in one frame.
- `interfaces/ILodWorldSource.ts` (implemented by `WorldGenerator`: config, blend data, surface band
  provider/refresh/floor, applied/unloaded events) and `interfaces/ILodRegionRenderer.ts`.

**Surface band:** tile `minTop`/`maxTop` feed `WorldGenerator.setSurfaceBandProvider()` (and
`refreshSurfaceBand` on each tile), so every full-detail column loads exactly the sub-chunks
holding its real surface; without a tile the band is a biome-height estimate.

**Handoff (full detail ↔ LOD), evaluated once per frame in `lodManager.updateVisibility()` before
rendering and after `processPendingMeshResults()`:**
- A column is *ready* once every sub-chunk of its surface band (lake bed up to the air above its
  top) has a mesh built after its data arrived (`LodColumnReadiness`, fed by
  `WorldManager.onSubChunkMeshAdded/Removed/Stale` and the WorldGenerator events). A column's FIRST
  reveal also requires the meshes to be current (see Mesh currency); an already revealed column
  tolerates a remesh in flight rather than flipping back to LOD.
- Ready columns are revealed from the player outward (a column is revealed when its neighbours
  toward the player are not LOD), so any remaining full-detail/LOD seam faces away from the camera.
  Revealed columns hide their LOD chunk slot (`hiddenMask`); columns that are not revealed hide
  their partial full detail through `Renderer.setChunkVisibilityFilter`, except within 2 chunks
  of the player (always full detail).
- Remesh must stay removed-then-added in the same frame, and unload must fire removed for every mesh.
- `main.ts` `syncViewDistance()` is the ONLY caller of `distanceFog.setViewDistance` /
  `renderer.setFarPlane` (far = max(1000, R·1.15 + 64)): R = min(LOD distance, covered distance)
  × 32 while LOD is drawn (a ring still loading fades into the fog), else `chunkDistance` × 32.
- Columns revealed once stay revealed through a spell below Y 180; a column leaves the shown set
  when it or one of its sub-chunks unloads. Readiness reports a change only when a column's
  present/complete/current bits differ (a remesh of a shown column recomputes nothing).

**Not in LOD (pop in at the handoff):** main-thread decorations (oak trees, cacti, mushrooms), cave
mouths/ravines, ores and cave lining, and player edits.

**Stats:** the FPS overlay's `LOD:` line (tiles ready/desired, regions drawn, triangles, handed-off
chunks, held-back columns).

### `src/workers/` - Web Workers

Off-main-thread computation for heavy operations.

**Worker Files:**
- `ChunkGenerationWorker.ts` - Terrain, caves, features, local sub-chunk light (`generateSubChunk(request, options)`; replies echo `requestId` and the `lightSeed` used); also hosts the LOD service (`lod-*` messages) on the separate LOD pool
- `ColumnHeights.ts` - Per-worker LRU of blended column heights (a column's sub-chunks are routed to one worker so it hits)
- `GreedyMeshWorker.ts` - Padded 34³ volume (sub-chunk + neighbour shell), greedy faces with smooth light + AO, packed 12-byte vertices, liquid faces (`greedymesh/`); faces toward a missing neighbour are culled, never lit with invented light
- `LiquidPhysicsWorker.ts` - Liquid flow simulation (via `BackgroundLiquidPhysicsManager`)
- `SoftwareOcclusionWorker.ts` - CPU depth buffer rasterization
- `PersistenceWorker.ts` - IndexedDB save/load operations (every message carries an echoed `requestId`, handled strictly in order)
- `WorkerSubChunk.ts` - Lightweight sub-chunk data for workers

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
- `InventoryInput.ts` - Inventory overlay open/close mechanics (toggled via E in BlockInteractionHandler)

**Controls:**
| Key | Action |
|-----|--------|
| WASD | Move (camera-relative) |
| Space | Jump / Fly up |
| Shift | Fly down |
| Ctrl+Alt+P | Toggle flying |
| 1-9, 0 | Select hotbar slot |
| Mouse Wheel | Cycle hotbar |
| E | Interact with targeted block, else toggle inventory; closes any open overlay |
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
- `FpsCounter.ts` - Performance stats overlay (incl. light queue and the `LOD:` far-terrain line)
- `SettingsMenu.ts` - Pause menu with settings pages (Render Distance, Far Terrain, Texture Filtering, shadows, ...)
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
| lodEnabled | boolean | true | Toggle (Far Terrain: Off) |
| lodDistance | number | 24 | 12, 16, 20, 24, 32 chunks (only ≥ chunkDistance + 2 offered) |
| textureFiltering | string | 'crisp' | crisp (`NearestMipmapLinear`, pixel art), smooth (trilinear); applied live via `setTextureFiltering` |

**Persistence:** Auto-saves to `localStorage['slopmine:graphicsSettings']` on every change.

Render Distance (`chunkDistance`, 1-16 in the config, the slider offers 2-16; default 8) lives in the world config
(`localStorage['slopmine:worldConfig']`, `GenerationConfig`), not in GraphicsSettings; the Far Terrain
dropdown only offers LOD distances of at least `chunkDistance + 2`. Changing either goes through
`syncViewDistance()`.

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
import { WorkerSubChunk } from './WorkerSubChunk.ts'
import { SimplexNoise } from '../world/generate/SimplexNoise.ts'
import { CaveCarver } from '../world/generate/caves/CaveCarver.ts'
import type { IGenerationConfig } from '../world/generate/GenerationConfig.ts'
```

### Worker Initialization

Use Vite's module worker syntax for proper bundling:
```typescript
// Method 1: Vite's ?worker import (preferred for simple cases)
import GreedyMeshWorker from '../workers/GreedyMeshWorker.ts?worker'
const worker = new GreedyMeshWorker()

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

Use lightweight data classes in workers (e.g., `WorkerSubChunk` instead of `SubChunk`) that implement shared interfaces like `ISubChunkData`.

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
- **Greedy Meshing**: Merge adjacent faces to reduce vertex count (only where light/AO match)
- **Two-Stage Culling**: Frustum then occlusion for minimal draw calls
- **LOD Far Terrain**: view distance comes from cheap region heightfields, not more full-detail chunks
- **Request ids, not keys**: pair worker replies by an echoed id - several requests for one sub-chunk can be in flight

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
