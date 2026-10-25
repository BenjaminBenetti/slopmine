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
9. **Gameplay wiring** (the "Depth expansion wiring" block near the end of main.ts, after the core
   tasks): chest loot tables, the 'status-effects' and 'biome-entry-events' tasks, then
   `setupProgression`, `setupBoneMeal`/`setupFarming`/`setupSlimeBounce`, `setupPlayerCombat`, `setupHellforge`,
   `setupArmorSystem`, `setupWeather` (each biome's weathers, sky/fog/light modifiers, particles,
   lightning, weather creatures - see Weather), `setupAlchemy` (must come after 'skybox': ember sight post-adjusts the light
   floor it sets), `setupDungeons`, one `setup<Biome>()` per Hell biome (castle tier loot tables,
   garrisons, guardian, procedural locator), `setupDayNight` + `setupNightfall` + `setupFireflies` +
   `setupButterflies` (the overworld clock, night creatures, beds, fireflies, daytime insects - see
   `src/daynight/`), `setupCaves` (cave creatures, cave-biome events, mineshaft loot - see Caves),
   `setupPointsOfInterest` (discovery, Delver's Compass, their loot - see Underground points of interest), and last
   `setupAudio` (sound - see `src/audio/`).
   A new system exposes a `setupX(deps)` in its own module; keep main.ts edits to the call

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
        ├─► CRITICAL: Camera, Physics, Mining, Atmosphere ('skybox'), Block Outline, Liquid Overlay,
        │             status effects + behaviours, combat cooldown, journal, biome-entry events,
        │             boss bar / Sigil Compass / dungeon-entered probe ('dungeons-hud'),
        │             guardian + garrison spawners ('dungeons'), clock ('world-clock'), sound ('audio')
        ├─► HIGH: Lighting (LightEngine queue)
        ├─► NORMAL: World Gen (+ feature work / sub-chunk unloads), LOD queue/apply, block systems,
        │           entities (EntityManager)
        └─► LOW: Liquid Physics, entity spawning (EntitySpawner)

GAMEPLAY: systems talk through gameEvents (src/events/) - emitters never know the journal,
dungeon tracker or other listeners; player damage flows through applyDamageModifiers().
SOUND: gameEvents listeners + SoundHooks calls ──► SoundBank (AudioSynthWorker renders every
sound - no audio files) ──► AudioEngine buses; MusicDirector / AmbienceController in 'audio'.

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
  (atmosphere/sky/fog/daylight, block outline, underwater overlay - skipped frames showed stale sky),
  plus cheap gameplay clocks/polls: 'status-effects', 'alchemy-effects', 'player-combat',
  'progression', 'slime-bounce', 'biome-entry-events', 'dungeons-hud', 'dungeons' (spawners),
  'world-clock' (time of day), 'fireflies', 'butterflies', 'farming-input', 'caves', 'points-of-interest', 'weather' (the live weather, sky/fog/light modifiers, particles, lightning), 'audio' (listener, footsteps, ambience, music, creature calls). NORMAL
  tasks registered late starve for long stretches while the world streams, so anything the player must see promptly
  (a timer, a toast, a boss bar) goes here - and stays cheap (poll at 1-2 Hz inside the task)
- `HIGH` (1): Can defer briefly - the budgeted light queue ('lighting')
- `NORMAL` (2): Background work - world generation, LOD tiles/meshes, block systems (incl. 'random-block-ticks'), entities
- `LOW` (3): Lowest priority - liquid physics, mob spawning (`EntitySpawner`)

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
- `EmissiveTextures.ts` - Registry of glowing block textures (`registerEmissiveTexture(textureId, {strength, threshold, map?, darkOnly?, pulse?})`, called next to `registerTextureUrl`): the chunk shader adds their hot texels as emissive light, so emitters (magma, ember veins, mushroom caps) glow in the dark instead of being lit only by their neighbours. `map` (a glow map URL: per-texel glow colour, black = none; loaded into `BlockTextureArray.glowMaps`) replaces the threshold and the texel colour, so a surface can look plain by day and glow in another colour; `darkOnly` (bioluminescence) fades the glow out wherever sky light × daylight is bright (`DARK_GLOW_GLSL`: none in the open by day, full at night, in shade and underground) - glowmoss is muddy grass by day. `pulse: { amount, grain }` makes the glow live: `speck` twinkles every texel on its own clock (glowmoss spores), `wave` drifts slow waves of light across the surface (the swamp's glowing mushroom caps); the clock is `glowTimeUniform` (`glowClock.ts`, `advanceGlowTime` in the 'skybox' task; swaying water plants share it). Emissive textures only glow on greedy faces; an instanced (non-greedy) glowing block uses a Lambert `emissiveMap` instead (glowcap, glimmercap, lumen fern, glowkelp, lanternweed: a separate `*_glow.webp` holds only the parts that glow, in their glow colour), made dark-only with `makeGlowDarkOnly` (`BioluminescentMaterial.ts`, instanced draws only). Material patches like it test `shader.instancing` / `shader.instancingColor` in JS, never `#ifdef USE_INSTANCING_COLOR` in a fragment shader (three defines that in the vertex shader only), and compose `customProgramCacheKey` with the one already set (two blocks with equal material parameters but different patches would otherwise share one program); GLSL `smoothstep` needs edge0 < edge1 (write `1.0 - smoothstep(a, b, x)` for a falling edge - reversed edges are undefined)
- `weather/` - `PrecipitationRenderer.ts` (all weather particles + splashes, one draw each), `ShelterMap.ts` (where weather
  stops: per-column floor texture), `WeatherFieldShader.ts` (weather far off along every view ray: rain walls, storm
  towers, sandstorms - the dome and every fogged material), `LightningRenderer.ts` (bolts, falling stars),
  `AuroraCurtains.ts` (Hell's prism lights); `WindUniform.ts` - the shared wind (foliage sway, weathervane); see Weather
- `GlowHaloMaterial.ts` - `createGlowHalo({ color, radius, lift })`: soft additive spheres of light around glowing water plants (see Liquids, glow halos)
- `FlameMaterial.ts` - `createFlameMaterial(planes)` + `buildFlamePlanes`: animated pixel-art fire (procedural, no texture) on crossed cutout planes - licking tongues, a red-to-pale-yellow ramp, sparks; `glowTimeUniform` clock, seeded per instance by position; the campfire's flames. Its mesh part sets `castShadow: false` (`IBlockMeshPart`: a multi-mesh block's part may also carry a material array)
- `FlickerLights.ts` - firelight (campfires: `properties.lightFlicker`): the chunk mesh drawing such a block registers it (`setFlickerLights`, dropped on dispose); each frame `updateFlickerLights` (the 'skybox' task) gives the 6 nearest the camera a slot with their own slow swing (±11% - Ben found ±22% at twice the speed flashy), and the world light shader multiplies the block-light colour by `slopFlicker(world position)` (the swing fading out over 14 blocks, times `FIRE_TINT`, oranger than the shared `BLOCK_LIGHT_COLOR`) on chunk faces, instanced blocks and foliage - no light work. Mobs and the held item keep steady light
- `SwayingPlantMaterial.ts` - `makeSwayInCurrent(material, { amplitude, speed })`: instanced water plants wave in the current, by world height and column, so stacked kelp segments bend as one strand
- `InstancedBlockLight.ts` - World light for instanced blocks (instanceColor carries light levels, see Miniature block displays)
- `foliage/FoliageRenderer.ts` - The batched foliage renderer: every foliage block (`FoliageSpec` - grass, flowers, bushes,
  crops, ground doodads) in a sub-chunk is ONE instanced draw (`FoliageBatch`, built in `GreedyChunkMesh` from the
  worker's non-greedy lists), so plant variety and density cost no draw calls. Sprites in their own DataArrayTexture
  (`buildFoliageTextures`, after the block array - no texture-array layers), glow maps in a second; 3 base quads (two
  crossed planes + one flat) where each instance collapses the shape it doesn't use; per instance, hashed from the
  cell: sprite variant, yaw, offset, size. World light levels per instance (normal straight up: a tuft shades like its
  ground), wind sway at the tips (`glowTimeUniform`), faded out by its view distance in the vertex shader;
  `updateFoliageVisibility` (Renderer.render) hides whole meshes beyond reach
- `interfaces/IChunkMesh.ts` - `IChunkMesh`, the sub-chunk mesh as culling and debug wireframes see it
- `FrustumCuller.ts` - First-pass visibility culling via AABB-frustum intersection
- `SoftwareOcclusionCuller.ts` - Second-pass CPU depth buffer occlusion (256×128)
- `BlockTextureArray.ts` - One `DataArrayTexture` layer per greedy face texture (tiles across merged quads, no bleeding); minification follows the Texture Filtering setting (`TextureLoader.setTextureFiltering`: crisp `NearestMipmapLinear` default, or smooth trilinear), anisotropy 16. Magnification is LINEAR on the sampler and made pixel-crisp in the shader (`crispTexelSampling.ts`: sample at the texel centre with the true UV gradients) - never force anisotropy onto a NEAREST-magnified texture: ANGLE/D3D11 (Windows) and SwiftShader then interpolate magnified texels, which is why three.js skips it. `loadBlockTexture` textures (instanced blocks, held items) stay NEAREST-magnified and get anisotropy only where a startup probe (`anisotropyProbe.ts`) shows the backend keeps them crisp; liquid textures magnify linearly and sample through `slopCrispTexel` like the array
- `TextureAtlas.ts` - Texture URL registry (`registerTextureUrl` / `getTextureUrls`)
- `WorldLighting.ts` - Directional light (the sun by day, the moon by night: `setLightDirection(dir, strength)`, `getSunDirection()`), cool hemisphere/ambient fill, light tint (`setTint`: biome × time of day), shadows (PCF soft)
- `skybox/Skybox.ts` - Colour-managed sky dome shader (gradient, sun disc/halo, moon, stars, twilight glow, and the volumetric clouds composited on the sky pixels); `fog: false`, pinned to the far plane, renderOrder 500 (drawn after world geometry); `getHorizonColor()` is the fog colour (time of day included). Its `onBeforeRender` renders the clouds' passes (a nested render, frame stats and shadow-map updates kept as they are)
- `clouds/VolumetricClouds.ts` - The sky's clouds in 3D (see Weather): ray-marched at a fraction of the screen into a half-float target with temporal accumulation (`setCloudQuality`: Settings > Clouds, fancy = half resolution / 72 steps, fast = a third / 44), shaped by the weather map's cloud channel, plus the cloud shadow map; noise volume from `cloudNoise3D.ts` (64³ tileable Perlin-Worley + Worley fBm, built in `cloudNoiseWorker.ts`)
- `skybox/DayNightSky.ts` - Hour of day → sun/moon directions, the directional light (follows the sun, then the moon; elevation clamped), daylight and light-tint multipliers, the sky's night palette and twilight; eased to "no change" off the surface layer (Hell has no day or night)
- `skybox/BiomeAtmosphere.ts` / `BiomeSkyboxManager.ts` - Per-biome sky/fog/light state (`SkyboxSettings` in `BiomeProperties`: colours in sRGB, light multipliers linear), blended across biome borders and eased (see Atmosphere below)
- `DistanceFog.ts` - Owns the scene's ONE persistent `THREE.Fog` (never swapped - that recompiles every material): spherical edge fade + absolute aerial haze (1500 blocks in clear air ÷ biome `fogDensity`^1.5), so the long (LOD) view gets depth and hazy biomes tint rather than erase it, + the cavern ceiling haze (smoke under the Hell ceiling, density 0.12/block at Y 140 falling off over 8 blocks, none above it - shader constants, integrated along each view ray; the ceiling straight up is ~62% haze); `setViewDistance(blocks)` (applies immediately), `setColor`, `setDensity`, `setOverride` (underwater: haze + far)
- `LiquidMaterials.ts` - One shared animated material per liquid family (water, swamp water, lava): liquid vertex colours carry light LEVELS `(sky/15, block/15, 1)` shaded with the world light model at render time (white = full light for icons), texture drift, sun glitter + Fresnel horizon reflection
- `LiquidOverlay.ts` - Full-screen tint while the camera is inside a liquid; underwater fog is a
  `DistanceFog.setOverride()` on the same fog object (never a fog swap). Water and swamp-water
  haze + tint are scaled every frame by the world light model at the brighter of the camera cell
  and the liquid's surface (dark in a flooded cave, unchanged in a daylit lake); lava is self-lit.
  While overridden the sky dome shows the fog colour (`Skybox.setFogOverride`)
- `BlockOutline.ts` - Dark 2 CSS-px outline (`LineSegments2`, one draw) around the targeted block's
  interaction box; its own `BlockRaycaster` in the CRITICAL 'block-outline' task, gated like
  mining (`hasGameplayPointer()` and player alive - hidden while inventory/menus are open)
- `lod/LodRenderer.ts` / `lod/LodMaterial.ts` - Far-terrain region meshes (see LOD Far Terrain below)
- `helditem/HeldItemRenderer.ts` - First-person held item with bob/swing animations (`playAttackSwing()`:
  one full swing per melee hit); lit by the world light model (`setWorldLight(packedLight)`) and the
  biome light tint (`setLightTint`)
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
The direct (sun/moon) term is also dimmed by cloud shadows (`slopCloudShadow`, `cloudShadowUniforms` - attach them
wherever `uDaylight` is attached: a material whose shader has the sampler but not the uniform leaves it on texture unit 0),
and world-lit materials get god rays in their fog (`CLOUD_LIGHT_GLSL` defines `SLOP_CLOUD_SHADOW`, which fog_fragment checks).
`daylight` and the floor come from the biome atmosphere every frame (`setWorldDaylight`,
`setWorldLightFloor` in the 'skybox' task). Level 15 sky in full daylight shades exactly like the
plain scene lights. Glowing blocks add emissive texels via `EmissiveTextures.ts`.

**Atmosphere (sky, fog, light rig):** one `BiomeAtmosphere` is the per-frame state; the CRITICAL
'skybox' task eases it toward the camera biome's `SkyboxSettings` (`BiomeSkyboxManager`, blended
across biome borders) and pushes it to the sky dome, `DistanceFog` (colour =
`skybox.getHorizonColor()`, density), `WorldLighting.setTint`, the held item, the liquid Fresnel
colour, and the daylight/light-floor uniforms. The time of day (`DayNightSky`, from `worldClock`)
multiplies on top: daylight × `dayNight.daylight` (night 0.15), light tint × `dayNight.lightTint`
(warm low sun, cool moonlight), the directional light along `dayNight.lightDirection`, and the
sky's night palette/twilight - weighted by a surface factor eased from the player's layer.
- `SkyboxSettings` (in `BiomeProperties`). Authored in sRGB (perceptual): `brightness` and the
  colours `tint`, `fogColor`, `undergroundFogColor`, `lightTint`, `clouds.color`. Linear: `minimumLight`
  (light floor as an RGB multiplier of albedo, e.g. the Molten Wastes' red ember glow (0.33, 0.15, 0.1),
  the Ossuary's pale green (0.3, 0.37, 0.31)) and
  `daylight` (0-1 biome-wide dimming - no surface biome uses it: Ben's rule is that darkness comes from the clouds
  and the weather, not a biome; the swamp's 0.62 and the coast's 0.82 read as always shaded). Scalars: `fogDensity` (≥ 1,
  shortens the absolute haze distance), `clouds.coverage` (default 0.42; the volumetric clouds' fair-weather cover, weather adds to it) and `clouds.opacity` (swamp
  grey overcast 0.65, volcanic dark ash 0.6, desert 0.2). A surface biome's gloom is its clouds and
  weathers, never a `skylightValue` cap (caps are baked per sub-chunk and draw hard 32-block light steps
  at region borders; every Hell biome uses cap 0).
- `DistanceFog` owns THE fog; `setViewDistance` is called only by `syncViewDistance()` (the drawn
  LOD ring's reach × 32 while LOD is drawn, else `chunkDistance` × 32), so fog and far plane always agree.
  The global `fog_vertex` override makes fog spherical (true distance, not view depth - no fog-free
  screen edges at 100° FOV); the `fog_fragment` override reinterprets `THREE.Fog`: `far` = edge
  fade (0.6·far → far), `near` = exponential aerial haze distance; a third layer, the cavern
  ceiling haze, and the weather far off (see Weather) need the fragment's world offset from the
  camera (`vFogOffset`, added to `fog_pars_*`), so any custom shader with fog must include three's
  `fog_pars_vertex`/`fog_vertex` (with `mvPosition` in view space) as well as the fragment chunks,
  and its uniforms must include `UniformsLib.fog` (the weather field's samplers ride in it). Every
  fogged material shares these patches; keep `fog: true` on world materials.
- Sky materials have `fog: false`; the dome is pinned to the far plane, dithered against banding,
  and includes three's colour-space chunk (colour-managed). Any future opaque object that does not
  write depth must draw after it (renderOrder > 500).
- `WorldLighting`: warm sun (fixed 10am, `getSunDirection()` also drives the sky's sun disc),
  hemisphere + ambient fill, optional PCF soft shadows. Sun intensity 2.1 (1.4 before the cloud shadows: Ben found
  full sun read slightly shaded once there was real shade beside it); the moon is set as a share of it in DayNightSky.

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
first job, and `GreedyChunkMesh` checks `isLiquid` - a new liquid needs no id list.
**Submerged blocks** (`submergedIn: '<family>'`, never with `isLiquid`: glowkelp, lanternweed) stand in a
full source of that liquid: the table lists them as a level-8 source of the family with a
`drawAs` id, and the worker emits the cell twice - the plant instance and its liquid's source (so the
water's faces and culling are unchanged around a plant); light treats them as diffuse, the
underwater overlay, swim sounds, fireflies and LOD (surface kind + palette) as the liquid
(`getCellLiquidFamily`, `src/world/liquid/cellLiquid.ts`); breaking one leaves the source
(`getVacatedBlockId`, used by `BlockInteraction`); liquid physics sees a wall.
**Scatter glow:** a submerged block with `scatterGlow` (linear RGB) lights the water around it after
dark. The mesh worker gives every liquid TOP face 4 corner glow colours (each of the 3×3 columns
around it sums the glow sources from the surface down, ×0.7 per cell, ≤ 6 cells, saturating; a
corner averages its 4 columns - smooth, blurred one block, seamless across sub-chunks since it
reads only the padded volume) in `nonGreedyLiquidGlow`; `buildLiquidMesh` writes them into the
`liquidGlow` vertex attribute (`LIQUID_GLOW_ATTRIBUTE`, zero on every other liquid geometry -
`withWhiteVertexColors` adds it, so no stale default attribute leaks in) and the liquid shader adds
it after the Fresnel mix, dark-only, shimmering with the ripple texels and stronger at glancing angles
(longer path through lit water). No per-frame cost; sub-chunks without glow sources skip it.
**Glow halos:** the surface alone left the water dark seen from the side or from below, so a glowing
plant also implements `IGlowHaloBlock` (`getGlowHalo()`, `GlowHaloMaterial.ts`): chunk meshes draw an
extra instanced mesh of camera-facing additive discs, one per plant (key `blockId * 100 + 99`,
renderOrder 2 - after the liquids, depth-tested, no depth write: in full under water, hidden by the
surface from above, a crown's halo rising out of it glows over the pool). Dark-only per instance
light, faded 14-30 blocks, collapsed off screen by day. Halo colours are display values added as is
(no colour-space conversion) and must stay faint: dozens overlap along a ray through a kelp forest. Non-chunk geometry drawn with these materials (icons) must carry WHITE vertex colours
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
- `loot/ChestLootRegistry.ts` - Worldgen chest loot tables (see Chest loot under `src/dungeons/`)

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
- Player saves (`saveAll`: manual, 5-min autosave, `beforeunload`) post every request before the
  first await (on unload nothing after an await runs) and write the inventory and all keyed player
  data in ONE transaction (items move between inventory and worn armor). main.ts saves nothing until
  the stored inventory + metadata were read (`savedPlayerStateLoaded`; a failed read never sets it),
  and `loadInventory`/`loadMetadata`/`loadPlayerData` THROW on a failed read. New Game's
  `clearAll()` closes writes for good (`writesClosed`: a debounced journal save or an unload save
  would carry the old world into the new one). An emptied chest/forge state saves a `removed`
  record that deletes its stored one (else the next load refilled a looted chest -
  `markBlockStateRestored` tracks which states have a record).
- Keyed player data: `persistenceManager.registerPlayerDataContributor(key, () => data)` (collected
  on every save, `structuredClone`d; return `undefined` to skip) and `await
  loadPlayerData<T>(key)` (null = never saved) after `initialize()`; `savePlayerData(key, data)` saves
  out of cycle. Stored in the player store as `data:<key>`. Keys: `progression` (journal),
  `equipment` (worn armor, max-health bonus, current health), `alchemy` (Return Idol cooldown),
  `dungeons` (cleared dungeon keys), `pois` (discovered points of interest), `weather` (weathers seen, a rung Sky Bell's spell, the weather clock's offset). RULE: load first, then contribute (or contribute `undefined`
  until loaded) - a contributor registered before its load writes defaults over the save; on a
  failed load contribute nothing this session. Version the data and tolerate missing fields.
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
- `BlockIds.ts` - Enum of all block IDs (0=AIR; 1-162 base game, 163 slime, 170-171 guardian
  spawners, 172 garrison spawner, 180 Hellforge, 200-223 Molten Wastes, 230-252 Ossuary, 260-285
  Ember Grove, 290-318 Crystal Abyss, 320-349 Cocytus - each Hell range includes its castle kit's
  blocks; 350-369 day and night (350 Ward Lantern, 351-360 swamp bioluminescence: foxfire and amber
  mushroom stems/caps, glowmoss, glimmercap, lumen fern, glowkelp + its crown, lanternweed); 361-449
  nature (361-402 wild plants and doodads, 403-408 forage bushes, 409 oak sapling, 410-411 farmland,
  412-435 crops, 436-437 embers and volcanic rocks, 438-447 young stages of seed-grown bushes); 448-499
  caves (448-456 cave biome rock, crystal, fungus and the celestite lamp, 457-477 cave foliage, 478 ore
  crate, 479-481 gravel, andesite, granite); 482-511 underground points of interest (482-490 ancient masonry,
  runestone, bookshelf, petrified wood, the keystone; 491-502 decorations, 495 the barrel a textured full block; 503 heaped
  gold, 504 fossil bone, 505-509 iron bars, minecart, telescope, stone bust, tankards, 510-511 sandstone bricks and carved
  sandstone); 512-516 weather (lightning rod, weathervane, fulgurite, star fragment, star lantern; 512-529 reserved);
  highest 516). Shared registration files are grouped by header comments per feature area
  (`// Hell: Cocytus`) - add new entries to their area's group
- `BlockRegistry.ts` - Singleton registry mapping IDs to block instances
- `FaceTextureRegistry.ts` - Maps block+face to TextureId for greedy meshing. Greedy side faces
  read un-mirrored from outside, like three's `BoxGeometry` used by item displays; faces listed in
  `QUARTER_TURN_FACES` get their texture turned a quarter (e.g. bark grain along a fallen log) -
  give the block's display geometry the same turn (`QuarterTurnedCube.ts`)
- `registerDefaultBlocks.ts` - Registers every default block at startup (main thread and each worker)
- `tags/BlockTags.ts` - `ROCK`, `WOOD`, `SOIL`, `LEAVES`, `LIQUID_SOURCE`, `CLIMBABLE`; the mining
  tool-type rule reads them (see Mining under `src/player/`)

**Greedy vs instanced:** a block is greedy-meshed unless `block.isGreedyMeshable()` returns false
(custom geometry: plants, torches, braziers, prism clusters, icicles, the Hellforge...). WorldManager
derives the mesh worker's non-greedy list and the texture-array contents from that method;
`NON_GREEDY_BLOCK_IDS` in FaceTextureRegistry is only the worker's pre-init default and is
incomplete - don't rely on it.
**Box models:** a non-greedy block built from boxes tagged with material indices (`cellBox`,
`withMaterialIndex`) merges them with `mergeTaggedParts` (`types/model_shared/`), never
`mergeGeometries(parts, true)` - that numbers groups by part, so every part past the material count
draws nothing. `buildDecorGeometry` (`molten_decor/DecorGeometry.ts`, the Hell decor and the points of
interest's decorations) goes through it too (it didn't until the points-of-interest update: hoards, anvils,
racks and lanterns drew only their first few boxes; the campfire, grave candles and infernal brazier had the same
bug - three stones, one candle, half a basket).
**Texture-layer budget:** every distinct greedy face texture costs one `BlockTextureArray` layer;
the limit is 255 (`CHUNK_MAX_TEXTURE_LAYER`, building throws above it; layer 0 = missing texture).
187 are used (54 base game, 133 expansion - the boot log's `Block texture array built with N layers`
counts them, layer 0 excluded). TextureId values may exceed 255 (layers are compacted),
so reuse one texture across faces/blocks where it reads fine (crafted infernal bricks, sanctum tile
and the crystal cores share their source block's layers). Non-greedy blocks cost no layer.
**Placement:** a `BlockItem`'s declared `blockName` wins over the `<block name>_block` id convention
(`infernal_bricks_block` places the force-2 `crafted_infernal_bricks`, never the force-6 bastion wall).

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
- **Special**: Torch (custom geometry, light emission), Forge (stateful, UI), Hellforge (UI), guardian
  and garrison spawners (block entities, see `src/dungeons/`)

**Light emitters:** `lightLevel` lights the cells AROUND a block (Minecraft rules, −1 per step);
the block's own faces are lit by its neighbours' lower light. A block that should visibly glow
(magma, ember veins, bioluminescent caps) also registers its face texture with
`registerEmissiveTexture()` (`src/renderer/EmissiveTextures.ts`): hot texels above the threshold
become emissive in the chunk shader. Torch 13, campfire 14, resin torch 15, Ward Lantern 15; magma/hell magma 8; the swamp's glowing
mushroom caps (blue, purple, foxfire, amber) 15 and their stems 2, glimmercap 5, lumen fern 4,
lanternweed 4; glowmoss and glowkelp emit nothing (emissive only - whole carpets and kelp forests
cost no light work, and blue glow would come out as warm block light).
Hell lighting comes from emitters (no skylight): crystal lamp, frost lantern, infernal/rime braziers
15, soul lantern 14, spore sac 13, soul torch, frost crystal and prism crystal 11, other ores and
crystals 3-7; castle lights: hanging frost lantern 15, ember/prism lanterns 14, soul candelabra and
glow bulb 12, glowing sap and prism pedestal 9, grave candles 8, magma bricks and rime glyph 6. A
large emitting mass emits from its shell only: `CrystalCoreFeature` turns buried crystal cells into
non-emitting `*_core` twins (same texture layer), keeping light work bounded.

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

**Random Block Ticks (`src/world/blocktick/RandomBlockTicks.ts`, the NORMAL 'random-block-ticks' task from
`setupFarming`):** blocks with `onRandomTick()` within 6 chunks of the player are visited at random, each about
once per `RANDOM_TICK_INTERVAL` (20 s); the hook rolls a chance (crops grow, forage bushes and berry bushes
regrow, saplings grow into trees, farmland dries and wets). Nothing is saved or scheduled, so worldgen and
reloaded blocks tick like placed ones (scheduled ticks are lost on reload - growth belongs here). Each
sub-chunk's tickable cells are listed by a scan of its block array (6 scans per run) and re-listed when its
`dataVersion` changes.

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
While the camera is in the Hell cavern (`LoadCenter.cavern`: entered below the ceiling at
`HELL_CEILING_Y` 140, left only above the ceiling's sub-chunk, Y ≥ 160 - hysteresis) every
in-range column wants the whole cavern - sub-chunks 0-3 plus 4 (the ceiling) - and no surface
band: the floor (dungeons, chasms), pillars and ceiling are in view across the whole disk (d=8:
985 cavern sub-chunks, +14-23% over the ellipsoid alone depending on camera height); back on the
surface they unload like any other.
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
5. Apply features (ores, cliffs), cave wall lining, cave dressing, rock blobs and underground points of
   interest (overworld caves), then the Hell ceiling band (`HellCeiling.ts`:
   the surface fill's bottom 4 layers, Y 140-143, generate as dark basalt - pale stone lit by a
   Hell biome's light floor read as a bright slab overhead)
6. Compute local light (after all block writes; merged with neighbours by the LightEngine)
7. Place decorations (trees) on main thread

**Cave biomes (Caves and Dark Places):** see the Caves section below - the underground is divided into
zones, mostly plain caves with a special one now and again (`caves/CaveBiomes.ts`), and full-detail
surface-layer sub-chunks are carved with `CaveCarver.carveSubChunkWithMask` (one padded 34³ carve: identical blocks, plus a
`CaveMask` of the 1-block shell) so `CaveDressing.ts` (worker Phase 4.55, after features and lining,
before light) can line and decorate caves seamlessly across sub-chunk faces; `scatterRockBlobs` then
puts andesite and granite blobs through every surface-layer sub-chunk's stone.

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
- **Layer 0 (the Hell layer, Y=0-127)**: Molten Wastes, The Ossuary, Ember Grove, Crystal Abyss, Cocytus

**Biome Layer System:**
Biomes are assigned to vertical layers:
- **Layer 0**: Underground biomes (Y=0-127, sub-chunks 0-3)
- **Layer 1**: Surface biomes (Y=128-511, sub-chunks 4-15)

Each layer picks its biome per 512×512-block region (`BIOME_REGION_SIZE` 16 chunks) with
`selectBiomeForLayer(rx, rz, seed, layer)` (frequency-weighted, in registration order) and blends
borders the same way (heights, dithered fill). Display names: `BIOME_DISPLAY_NAMES` /
`getBiomeDisplayName` (`biomes/BiomeDisplayNames.ts`).

**The Hell layer:** every layer-0 biome has `frequency` 1.0 (20 % of regions each), `skylightValue: 0`,
`terrainConfig.absoluteHeight: true`, no `caves`, no trees and no LOD. Floors sit around Y 30-70
under open air up to the basalt ceiling (Y 140); landmarks reach up into it. Each biome is
recognisable by its atmosphere colour, has a resource found nowhere else and one dungeon type:

| `BiomeType` (map) | Display name | Identity | Unique resources (block → item → use) | Dungeon / guardian (index) |
|-------------------|--------------|----------|---------------------------------------|----------------------------|
| `hell` (HEL) | Molten Wastes | lava sea at Y 46, terraced hell-rock badlands, mesas, great pillars, obsidian crusts; red/orange | `infernium_ore` → `raw_infernium` → `infernium_ingot` (forge; tier 6); magma cream → fire resistance; ember roach wings → slow falling | Infernal Bastion / Pyre Tyrant (1) |
| `ossuary` (OSS) | The Ossuary | bone-ash dunes over ossified rock, colossal fossils, bone spires; bone-white + soul green | `soul_vein` → `soul_shard` (hellbane helmet/axe, soul torches); ectoplasm → regeneration; bone blocks | Catacombs / Bone King (2) |
| `ember-grove` (EMB) | Ember Grove | crimson mycelium floor, giant glowing fungi, drifting spores; crimson + teal | `emberwood_stem` (planks, sticks, fuel); `glowcap` → ember sight, food | Sporeheart Hive / Sporemother (3) |
| `crystal-abyss` (CRY) | Crystal Abyss | black abyssal-stone terraces and chasms, crystal spires, geodes, floating islands; violet/magenta | `prism_crystal` (+ clusters) → `prism_shard` (strength, hellbane pickaxe, crystal lamps) | Prism Sanctum / Prism Warden (4) |
| `cocytus` (COC) | Cocytus | frozen lake (solid `BLACK_ICE` at Y 46, no liquid), rimestone shores, ice spires, frozen lavafalls, entombed figures; icy blue | `rime_crystal_ore` → `rime_crystal` (iceskin, hellbane boots, frost lanterns) | Frozen Citadel / Rime Sovereign (5) |

Code per biome: generator `biomes/<Name>Generator.ts` (`HellGenerator.ts` for the Molten Wastes);
worker terrain + features in `molten/` + `features/{HellPillar,InferniumOre}Feature.ts`,
`features/ossuary/`, `features/embergrove/`, `crystal/` + `features/crystal/`, `cocytus/` +
`features/{FrozenLake,IceSpire,FrozenLavafall,FrostCrystal}Feature.ts`; the castle kit in
`dungeons/kits/<molten|ossuary|embergrove|crystal|cocytus>/`; main-thread wiring (tier loot tables,
garrisons, guardian, locator) in `src/molten/`, `src/ossuary/`, `src/embergrove/`, `src/crystal/`,
`src/cocytus/`. Dungeons are rare: ONE procedural castle candidate per 512×512 region of its biome
(chance 0.85, anchored in the region's interior - see `src/world/generate/dungeons/`), so the
Sigil Compass is how players find them.

When creating a new biome:
1. Set `layer: 0` or `layer: 1` in `BiomeProperties`
2. Register in `BiomeRegistry.ts` with the correct layer
3. Add biome type to `BiomeType` union in `GenerationConfig.ts` and a `BIOME_DISPLAY_NAMES` entry
4. The biome mini-map HUD (player's current layer) shows the first 3 letters of the `BiomeType` id,
   uppercased (`getBiomeAbbreviation` in main.ts) - keep that prefix unique within the layer
5. `fillChunk(chunk, minY, maxY, noise, getHeightAt)` must use the PASSED `getHeightAt` (blended in
   the worker), never `this.getHeightAt` (unblended: cliffs at every region border)
6. Layer 0 also: `frequency` 1.0, `skylightValue: 0` (gloom comes from the atmosphere),
   `terrainConfig.absoluteHeight: true`, a `skybox` with `undergroundFogColor`, `fogDensity`,
   `lightTint` and `minimumLight` (the biome's ambient colour), and `entitySpawns` without
   `searchFromSky`, `minY`/`maxY` inside the cavern
7. Features run only for the chunk's PRIMARY biome: world-anchor every extended placement grid and
   veto placements whose footprint crosses into another biome region (`context.getBiomeNameAt`
   probes - `isFootprintInBiome` in `features/ossuary/ossuaryHash.ts`, `staysInOneRegion` in
   `features/embergrove/regionGuards.ts`; a structure spanning two regions gets two different
   blended base heights). Landmark features keep clear of the biome's castle through its kit's
   pure keep-out query (`isNearFrozenCitadel`, `isNearPrismSanctum`, `isNearCatacombsPrecinct`,
   `findHiveFootprintsNear`, HellPillar's `avoidInfernalBastions`)
8. A dungeon is a castle kit (see `src/world/generate/dungeons/`): kit + worker-safe config constant
   in `dungeons/kits/<biome>/` (imported from `kits/index.ts`); `new ProceduralDungeonFeature(config)`
   in the biome's features (already worker-registered - no new feature type; features listed after
   it can still write into the castle); a boss module calling
   `ctx.guardian(x, y, z, index)`, garrison rooms calling `ctx.garrison` with the biome's index range,
   `lootTierBlocks` (four blocks only the kit places). Main thread, one `setup<Biome>()` called from
   main.ts: tier loot tables, `registerGarrison`s (dungeon-only mobs), `registerGuardian` (guardian
   entity + its sigil item, dropped ×2), `registerProceduralDungeonLocator` with the SAME config
   constant

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
(A new castle kit needs none of this: every kit reuses the registered `proceduralDungeon` type.)

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
- `AudioSynthWorker.ts` - Renders sound recipes and reverb impulses (`src/audio/synth/`); echoed `requestId`, transferred buffers; `AudioSynthClient` keeps ≤ 2 in flight from a priority queue
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
0. A body that starts the step overlapping blocks (spawned into a hillside, pushed into a trunk) is pushed
   out first: `CollisionDetector.findClearOffset` - the smallest shift up or along one horizontal axis
   (≤ 1.1 blocks) that clears it; otherwise every axis clips to zero and it is frozen for good. Faces
   that only touch never overlap (a body placed exactly on a block top can walk off it).
   `PhysicsEngine.fitBody` uses the same search: `EntityManager` fits every entity entering the world
   (≤ 1.5 blocks), and `EntitySpawner` drops a spawn that only fits further than 0.6 blocks away
   (it centres spawns in their cell, on the solid block under any plants)
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
- `FirstPersonCameraControls.ts` - WASD movement, mouse look, flying mode; `addSpeedModifier()`
  (walking-speed multipliers, e.g. Frostbite, Rootbound; flying unaffected)
- `BlockRaycaster.ts` - DDA voxel raycasting for block targeting
- `BlockInteraction.ts` - Left-click mining with progress tracking
- `BlockPlacement.ts` - Right-click block placement with collision check
- `BlockInteractionHandler.ts` - E-key block UI interaction (forge, etc.)
- `MiningDamage.ts` - Tool effectiveness, mining force and the tool-type rule (below)
- `ToolbarInput.ts` - Hotbar selection (1-9, 0, mouse wheel)
- `InventoryInput.ts` - Inventory overlay open/close mechanics (toggled via E in BlockInteractionHandler);
  `addDragDropContainer()` adds extra slot containers (worn armor) to its drag-drop
- `PlayerHealth.ts` - 40 HP base + `maxHealthBonus` (Infernal Hearts; `setMaxHealthBonus` clamps
  current health, never heals); 1 s i-frames (`INVINCIBILITY_DURATION`)
- `DamageModifiers.ts` - THE player damage pipeline (see below)
- `ItemConsumption.ts` - Hold right-click to use an `IConsumable`: `canConsume` gates the start (once
  per press), `canContinueUse` every tick, `consumedOnUse: false` keeps the stack (Return Idol);
  emits `item-consumed`
- `EnvironmentalDamage.ts` - Lava, post-lava burning, hot floors ('fire' source);
  `setFireImmunityQuery` (fire resistance never ignites the burn or shows its vignette)
- `effects/`, `equipment/`, `returnidol/` - Status effects, worn armor, Return Idol (sections below)

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
| J | Journal (also from the inventory sidebar); J / E / Esc close it |
| Left Click | Mine block (hold); attack an entity in front (held: re-hits whenever fully charged) |
| Ctrl+Click (menus) | Hotbar/inventory stack into the crafting grid (or the open chest, bench, forge...); a crafting-grid stack back to the inventory (then the hotbar). With the recipe book open: hotbar ↔ inventory |
| Right Click | Place block (aimed at grass or a flower: into its cell); pick a ripe berry/forage bush; plant seeds/carrots/potatoes on farmland; held armor: wear it (swaps the worn piece); hoe on grass/dirt: till farmland (hold to keep tilling); bone meal on a crop/bush/sapling: grow it, on bare ground: sprout grass and flowers |
| Right Click (hold) | Consume food / potion / Infernal Heart; channel the Return Idol (3 s) |

**Mining Formula:**
```
blockHP = hardness × 5.0
miningTime = blockHP / (toolDamage × tagMultiplier)
```

**Mining force** (`MiningDamage.ts`): a block mines only if the tool's effective `demolitionForce`
(= its tier) ≥ the block's `demolitionForceRequired`; otherwise a floating "Needs an iron pickaxe"
hint (`describeRequiredTool`, throttled to once per 2 s per block).

| Force | Tool tier | Blocks |
|-------|-----------|--------|
| 0 | hand | soils, ash, plants, wood (incl. emberwood), lamps, torches, slime |
| 1 | wood | stone, basalt, hell rock, coal + copper ore, ossified rock, bone, rimestone, ice, chest, forge |
| 2 | stone | iron + sulfur ore, abyssal stone family, black ice, frozen magma, crafted infernal bricks, heavy castle decor (anvil, crypt altar, reliquary, statues, pedestals) |
| 3 | iron | gold + diamond ore, Hellforge, spire/rose crystal, crypt/rime grates |
| 4 | steel | - |
| 5 | diamond | obsidian; every Hell resource (`infernium_ore`, `soul_vein`, `prism_crystal` + clusters, `rime_crystal_ore`) |
| 6 | infernium | castle structure, hardness 35-200: every kit's walls, floors, pillars, stairs/slabs, bars, roof tiles, crystal glass (ROCK; the hive's root, membrane, brood comb, gill wall, root pillar and lattice are WOOD: infernium axe), rime brazier, guardian and garrison spawners - players enter through the gate until tier 6; decor, lights and timber stay 0-3 |
| 7 | hellbane | - |

**TOOL-TYPE RULE:** for blocks of force ≥ 2 only a tool with a damage multiplier for one of the
block's tags counts (pickaxe ROCK, axe WOOD, shovel SOIL); any other tool counts as force 1
(`getEffectiveDemolitionForce`). So every block with force ≥ 2 MUST carry a matching tag, or no tool
can mine it.

---

### `src/items/` - Item System

Items and tools with tag-based classification.

**Structure:**
```
items/
├── Item.ts                 # Base class (IItem interface)
├── interfaces/             # IToolStats, IWeaponStats (swords), IConsumable (use gates, consumedOnUse)
├── tags/ItemTags.ts        # WOOD, STONE, METAL, ORE, FUEL, BAR, COAL, LOG, PLANK, HIDE
├── blocks/                 # Block drop items
├── ores/, bars/            # Raw ores (incl. raw_infernium), smelted bars (incl. infernium_ingot)
├── materials/              # Mob/biome drops, sigils (ember/bone/spore/prism/rime)
├── food/, potions/         # Consumables (potions: see Alchemy)
├── consumables/            # infernal_heart
├── magic/                  # return_idol, sigil_compass
├── armor/                  # ArmorItem, ArmorTiers, TieredArmorItem (7 tiers × 4 slots)
├── weapons/sword/          # SwordItem + 7 tiers (weaponStats)
└── tools/
    ├── ToolItem.ts         # Base tool class (maxStackSize=1)
    ├── pickaxe/            # 7 tiers
    ├── shovel/             # 7 tiers
    └── axe/                # 7 tiers
```

**Tool Tiers:** Wood → Stone → Iron → Steel → Diamond → Infernium → Hellbane (tier = `demolitionForce`
1-7; infernium and hellbane tools, swords and armor are forged at the Hellforge). Hoes (`tools/hoe/`,
wood-diamond hand-crafted (2 heads + 2 sticks), infernium and hellbane forged at the Hellforge) till farmland
(see Nature; hold right-click to keep tilling) and cut leaves fast.

`ItemTags.HIDE` marks the hides that make leather armor (wolf/bear pelt, alligator leather, komodo
scales). Recipe ingredients may name a tag (`{ tag, count }`) instead of an item id.

**Tool Stats:**
- `demolitionForce` - Minimum force to mine blocks
- `damage` - Base damage per second
- `damageMultipliers` - Tag-based bonuses (pickaxe → ROCK, axe → WOOD, shovel → SOIL); also decides
  the tool-type rule. Combat stats never come from tool stats (see `src/combat/`)

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
A module may register a batch through a helper that receives `registerItemFactory` (e.g.
`items/cocytus/registerCocytusItems.ts`, avoiding a circular import). Systems refer to another
area's items by string id - `createItemFromId('<id>')` (main thread only) or recipe ingredients
`{ itemId, count }` - never by importing their classes. Item ids are persisted, matched by the
journal and by loot tables: never rename one.

**No path may delete items:** what a full inventory can't take is thrown out of the player
(`throwStackFromPlayer` in main.ts: a `DroppedItemEntity` thrown along the view, inert until the
player has left its attraction radius once) - hand-crafting and woodworking-bench results and
returned ingredients, the Hellforge's results (`dropOverflow`); a chest/bench whose contents don't
fit stays unbroken; drag-drop swaps and half-stack drops never overwrite a stack, and a stack
released over a panel is never thrown. New crafting/transfer code follows the same rule.

---

### `src/events/` - Gameplay Event Bus

`GameEvents.ts`: one typed bus, `gameEvents.on(type, fn)` / `onAny(fn)` (both return an unsubscribe)
and `emit(event)`. Synchronous; a throwing listener is logged and never breaks the emitter or the
other listeners. Systems that react to the player (journal, dungeon tracker, combat reset) listen
here and never reach into the emitting system; add a variant to the `GameEvent` union rather than a
direct call.

| Event | Fields | Emitted by |
|-------|--------|------------|
| `block-mined` | blockId, blockName, x/y/z, toolId | `BlockInteraction.completeMining` (after drops spawn, before the block becomes air) |
| `block-placed` | blockId, blockName, x/y/z | `BlockPlacement` |
| `item-added` | itemId, count (what fit) | `PlayerState.addItemCounted` (pickups, crafts, chest takes...) |
| `item-crafted` | itemId, count, station, x/y/z? (world stations: forge, apothecary) | `InventoryInput` ('hand'), `ForgeBlockState`, `ApothecaryWorkbenchState`, `WoodworkingBenchUI`, `HellforgeUI` |
| `item-picked-up` | itemId, count (what fit) | `DroppedItemEntity` collect (ground pickups only) |
| `item-consumed` | itemId | `ItemConsumption` (also for the reusable Return Idol) |
| `entity-hit` | entityType, x/y/z, charge, killed, blocked | `BlockInteraction.hitEntity`: every player melee hit (charge read before the hit restarts the clock; `blocked` = the entity's `lastHitBlocked`) |
| `entity-killed` | entityType, x/y/z | `BlockInteraction.hitEntity`: only when the player's hit took it down and `entity.countsAsKill !== false` |
| `player-hurt` | amount, environmental | `PlayerHealth.takeDamage` (accepted hit) / `takeEnvironmentalDamage` (lava, burning, poison, TNT, geyser ticks) |
| `biome-entered` | biome, layer | main.ts 'biome-entry-events' (2 Hz; region biome + layer by feet Y vs `LAYER_BOUNDARY_Y` 128) |
| `player-died` | - | main.ts death callback |
| `dungeon-entered` | dungeonId, biome, x/y/z | `DungeonTracker` (once per dungeon per session) |
| `guardian-defeated` | guardianId, x/y/z | `GuardianEntity` death |
| `effect-applied` | effectId, durationSeconds | `StatusEffects.apply` (a start or a refresh that took effect) |
| `nightfall` | day | `setupDayNight` 'world-clock' (the sun ≈ 7° below the horizon) |
| `daybreak` | day (the new one), survived (no death since nightfall) | `setupDayNight` (sunrise, or waking in a bed) |
| `cave-biome-entered` | caveBiome | `setupCaves` 'caves' (a new special cave zone) |
| `poi-discovered` | poi (kind id), x/y/z (keystone), distinctKinds | `setupPointsOfInterest` (first visit to a point of interest) |
| `weather-changed` | weather, previous (WeatherCatalog ids), layer | `setupWeather` (the named weather at the player changed, after a 5 s hold) |
| `weather-seen` | weather, distinct | `setupWeather` (a weather seen for the first time ever; fair weathers don't count) |
| `lightning-strike` | x/y/z (top of the block hit), distance, rod | `LightningSystem` (every strike around the player; `rod`: a lightning rod caught it) |
| `lightning-flash` | distance | `LightningSystem` (a flash in far clouds, no strike: far thunder) |
| `star-fallen` | x/y/z (where it lands), distance | `LightningSystem` (a meteor shower's shooting star starts to fall; it lands ~1.5 s later as a star fragment) |

---

### Player Damage, Status Effects (`src/player/DamageModifiers.ts`, `src/player/effects/`)

**Damage pipeline (RULE: every player damage path calls `applyDamageModifiers(amount, source)`
before touching `PlayerHealth`; anything that changes incoming damage registers a modifier with
`registerDamageModifier` instead of editing those paths).** Modifiers run in registration order,
result clamped ≥ 0. Sources: `melee` (mob contact/attacks, `PlayerDamageHandler` default),
`projectile`, `fire` (`EnvironmentalDamage`, burning floors), `fall`, `magic` (poison ticks and
sorcery - Rime Sovereign's frost nova, Pyre Tyrant eruptions, the Hollow Priest's bone ward; armor,
fire resistance and the Return Idol interrupt all ignore it). Geyser steam goes through as `fire`,
TNT blasts as `melee`.
`PlayerDamageHandler.damage` returns false when a hit is absorbed whole (dead or i-frames);
projectiles then skip their on-hit status effect too.

| Modifier | Effect | Registered in |
|----------|--------|---------------|
| Armor | melee/projectile × (1 − reduction); fire × full-set bonus | `equipment/ArmorDefense.ts` |
| Status effects | fire resistance → fire 0; slow falling → fall 0; Iceskin → melee/projectile × (1 − 0.2·level) | `effects/EffectBehaviours.ts` |
| Slime blocks | landing on one cancels fall damage | `progression/SlimeBounce.ts` |
| Return Idol | observes only: any non-magic hit breaks the channel | `returnidol/ReturnIdolController.ts` |

Entity hits go through `PlayerDamageHandler.damage(dmg, knockback?, source = 'melee')` (entity
callback `(damage, knockback, source?) => void`): a hit while dead or inside i-frames is absorbed
WHOLE - no damage and no knockback, so a volley knocks back like one hit.

**Status effects** (`effects/StatusEffects.ts`): `playerEffects.apply(id, seconds, level = 1)` (a
higher level replaces a lower; at equal level the longer remaining time wins; never weakens),
`has`, `getLevel`, `getRemaining`, `remove`, `clear`, `getActive`, `onChange`. Ticked by the CRITICAL
'status-effects' task; cleared on death AND again at respawn (late projectiles/clouds); never
persisted. The module is bookkeeping only - what an effect DOES lives with the system it changes,
which asks `has`/`getLevel`:

| Id (`StatusEffectIds`) | Shown as | Behaviour | Implemented in |
|------------------------|----------|-----------|----------------|
| `fire_resistance` | Fire Resistance | fire damage 0, no burn ignition/vignette | damage modifier + `EnvironmentalDamage` fire-immunity query |
| `slow_falling` | Slow Falling | glide at 4 blocks/s (braked after physics), fall damage 0 | `EffectBehaviours.update` + modifier |
| `regeneration` | Regeneration | 1 HP per 2.5 s / level | `EffectBehaviours.update` |
| `ember_sight` | Ember Sight | light floor raised to warm (0.92, 0.76, 0.58), biome floor ×1.6, eased | `EffectBehaviours.update` (post-adjusts the floor 'skybox' set) |
| `strength` | Strength | +30 % melee per level | `combat/PlayerAttack.ts` |
| `resistance` | Iceskin | melee/projectile −20 % per level | damage modifier |
| `poison` | Poison | 1 'magic' HP per 1.25 s / level, never below 1 HP | `EffectBehaviours.update` |
| `slowness` | Frostbite | walk speed −25 %/level (floor 25 %), frost vignette | `cameraControls.addSpeedModifier` |
| `potion_sickness` | Potion Sickness | display-only healing-potion cooldown | gate in `HealingPotionCooldown.ts` |
| `swiftness` | Swiftness | walk speed ×1.3 per level (stacks with Frostbite) | `getMovementSpeedMultiplier` (EffectBehaviours) |
| `rootbound` (not in `StatusEffectIds`) | Rootbound | walk speed ×0.35 (Rootbound Warden snare, 2.5 s) | speed modifier in `enemies/rootbound_warden/RootboundEffect.ts`, installed by `setupEmberGrove` |

`EffectBehaviours` runs in the CRITICAL 'alchemy-effects' task (with the frost vignette, Return
Idol and effects HUD), registered after 'skybox'. HUD info (name, colour, buff/debuff, icon):
`registerStatusEffectInfo` (`registerEffectDisplay.ts`). Bosses just `apply` debuffs.

---

### `src/combat/` - Player Melee

- `PlayerAttack.ts` - `getPlayerAttackDamage(heldItem)` is THE single source of player melee damage:
  every entity's `onPlayerInteract` takes its damage from it (never from tool mining stats) and
  multiplies its own knockback/hit-stun by `getPlayerAttackKnockback(heldItem)`. Damage = profile ×
  (0.1 + 0.9·charge²) × (1 + 0.3·strength); knockback share 0.2 + 0.8·charge². One arm clock:
  charge = time since the last hit / the HELD item's cooldown (swapping never skips recovery).
  No hit lands below `MIN_ATTACK_CHARGE` (0.5: sword 0.25 s, at most 4 hits/s) - `canPlayerAttack`
  gates a click in `BlockInteraction` (a click held through the lockout lands when it ends; holding
  the button re-hits only at full charge); the charge bar stays dim until then.
  `BlockInteraction.hitEntity` calls `registerPlayerAttack` after the hit (restarts the clock,
  plays the swing); `resetPlayerAttack` on death.
- `WeaponProfiles.ts` - Melee profiles: swords carry `weaponStats` (`IWeaponStats`: attackDamage,
  attackCooldown, knockback); tools derive theirs from the item id `<material>_<kind>` (unknown
  material: from `demolitionForce`), so mining stats never leak into combat. Anything else = fist
  (2 dmg, 0.4 s). Never below fist damage.
- `setupPlayerCombat.ts` - CRITICAL 'player-combat' task (clock + charge bar under the crosshair,
  `AttackChargeIndicator.ts`).

| Material | wood | stone | iron | steel | diamond | infernium | hellbane |
|----------|------|-------|------|-------|---------|-----------|----------|
| Sword damage (0.5 s, kb 1.0) | 4 | 5 | 6 | 7 | 8 | 10 | 13 |

Axe = sword + 1 (0.8 s, kb 1.3 - the slow heavy hitter), pickaxe = sword − 2 (0.65 s), shovel =
sword − 3 (0.6 s), hoe = sword − 3 (0.55 s, kb 0.8).

---

### Armor & Equipment (`src/items/armor/`, `src/player/equipment/`)

- `items/armor/ArmorTiers.ts` - Slots `head/chest/legs/feet` (item ids `<tier>_helmet/_chestplate/
  _leggings/_boots`), tier table; the tier id is the set id. `TieredArmorItem` builds every piece
  (`ArmorItem`: `armorSlot`, `armorPoints`, `armorTier`, `armorSetId`, never stacks).
- `player/equipment/PlayerEquipment.ts` - The 4 worn slots, separate from the inventory: worn armor
  survives death. `armorPoints`, `fullSetId`, `onChange`.
- `player/equipment/ArmorDefense.ts` - 3 % reduction per point, cap 75 %, melee + projectile only.
  Full sets: infernium fire −50 %; hellbane fire −75 % and a "ward" (melee/projectile taken a further
  −10 % after armor, still under the cap).
- `player/equipment/setupArmorSystem.ts` - Equipment panel beside the inventory grid (drag/drop,
  shift-click), right-click-to-wear, armor bar above the hearts (`ArmorDisplay`), the damage
  modifier, and persistence (`equipment` key: slots, `maxHealthBonus`, current health - restored
  after the bonus so health above the base max survives a reload).

| Points (head/chest/legs/feet) | leather | copper | iron | steel | diamond | infernium | hellbane |
|-------------------------------|---------|--------|------|-------|---------|-----------|----------|
| | 1/3/2/1 | 2/4/3/1 | 2/6/5/2 | 3/7/6/3 | 3/8/6/3 | 4/8/7/4 | 4/9/7/4 |

Leather (any `HIDE` item) and copper-diamond are hand-crafted, infernium and hellbane forged at the
Hellforge (below). **Infernal Heart** (`items/consumables/infernal_heart/`, guardian loot): +4 max HP
(2 hearts) per heart, cap +20; refused via `canConsume` once capped.

---

### Alchemy (`src/alchemy/`, `src/items/potions/`, Return Idol)

`setupAlchemy.ts` wires `EffectBehaviours`, the effects HUD (`StatusEffectHUD`, top-left slot),
debuff vignettes, the Return Idol and its persistence. Potions are `EffectPotionItem`s (effect id,
duration, level; drink 1 s, stack 16) brewed at the apothecary from `herb` + one Hell ingredient
(`crafting/recipes/AlchemyRecipes.ts`):

| Potion | Ingredient | Effect |
|--------|------------|--------|
| `fire_resistance_potion` (`_long`) | `magma_cream` (+ `corrupted_essence`) | 180 s (480 s) |
| `slow_falling_potion` | `ember_roach_wing`, or 2 `cattail_block` (surface route: the first descent precedes any Hell drop) | 90 s |
| `regeneration_potion` | `ectoplasm` | level II, 45 s |
| `ember_sight_potion` (`_long`) | `glowcap` (+ `corrupted_essence`) | 240 s (480 s) |
| `strength_potion` | `prism_shard` | 120 s |
| `iceskin_potion` | `rime_crystal` | resistance, 120 s |

Healing Potions I-III (heal 10/20/40) share a 10 s cooldown (`HealingPotionCooldown.ts`: the
`potion_sickness` badge; `canConsume` refuses with a notice). **Return Idol** (`return_idol`,
hand recipe 2 gold bar + 2 corrupted essence + 1 obsidian): hold right-click 3 s
(`canContinueUse`), reusable, 120 s cooldown persisted under `alchemy` (contributed only after it
was loaded); any non-magic damage within 0.6 s breaks the channel; teleports to
`getRespawnPosition()` behind a veil with input off until the destination is loaded and lit, then
sets the player on safe ground; input comes back only if no overlay holds the pointer. The item
talks to `ReturnIdolController` through `ReturnIdolHooks.ts` (items stay plain data).

---

### `src/hellforge/` - Hellforge Station

`HellforgeBlock` (id 180, item `hellforge_block`; light 10, force 3, non-greedy) - E opens `HellforgeUI`,
which crafts instantly from the player's inventory (shapeless `IRecipe`s) and throws results that
don't fit out of the player (`dropOverflow`). Recipes live in their own `hellforgeRegistry`
(`HellforgeRegistry.ts`, a `RecipeRegistry`, so they never show in hand crafting; the recipe book
lists them as station 'hellforge'); weapon/tool recipes in `HellforgeRecipes.ts`, armor in
`crafting/recipes/ArmorRecipes.ts`. Station recipe (hand): 4 `obsidian_block` + 2
`infernium_ingot` + 1 `gold_bar`. Tier 6 = diamond item + infernium ingots (pick/axe 3, shovel 1,
sword 2, helmet 3, chest 5, legs 4, boots 2); tier 7 = infernium item + 1 sigil + 2 ingots + 2
biome material (sword/chest: ember sigil + magma cream; helmet/axe: bone sigil + soul shard;
legs/shovel: spore sigil + glowcap; pickaxe: prism sigil + prism shard; boots: rime sigil + rime
crystal; hoe: rime sigil + rime crystal). Hoes: diamond hoe + 2 ingots → infernium hoe.

---

### `src/progression/` - Journal

- `milestones.ts` - Declarative data: 14 chapters (First Steps, Green Thumb, Into the Dark, Lost and Found, Under the Weather,
  Nightfall, Metal Ages, Arms & Armor, Alchemy, The Descent, The Five Circles, Infernal Age, Guardians, Hellbane), 96 milestones
  (Green Thumb's five, Into the Dark's seven, Lost and Found's seven, Under the Weather's eight and Nightfall's four are
  optional side goals). Chapter and
  milestone ids are persisted - never rename. `stage` orders the arc: the "next goal" is the
  unlocked, unfinished, non-optional milestone with the lowest stage. `requires` must be TRUE
  implications (completing a milestone completes its prerequisites silently). `legacy` milestones
  are pre-completed when a save without journal data is migrated.
- `MilestoneTypes.ts` - Triggers: `obtain`/`obtainAll`/`obtainTagged` (carried items, polled 1 Hz),
  event triggers (`mined`, `placed`, `crafted`, `consumed`, `killed`, `enteredBiome`,
  `enteredLayer`, `enteredDungeon`, `defeated`, `effectApplied`) and `reachedDepth`. Match on block
  `properties.name`, item ids, guardian/dungeon ids - other systems' exact strings are the
  contract (renaming a block name or entity type silently breaks a milestone).
- `ProgressionManager.ts` - Evaluates triggers off `gameEvents`; save data v1 (`completed`,
  `obtained`, `introShown`) under the `progression` key, debounced 1.5 s save after each
  completion (contributor returns `undefined` until the stored state loaded).
- `JournalUI.ts` (J overlay, a registered modal overlay), `JournalHud.ts` (goal line, top-left HUD
  slot), toasts (`ui/Toasts.ts`); CRITICAL 'progression' task.
- Drop sinks: `BoneMeal.ts` (right-click a crop/berry bush: one growth stage), `SlimeBounce.ts`
  (slime blocks cancel fall damage and bounce real falls); `ProgressionRecipes.ts` (iron axe/shovel,
  bone meal, slime block, ...).

---

### `src/dungeons/` - Dungeons & Guardians

Main-thread side of the procedural castles. The worker side (kits, layout, rasterizer) is
`src/world/generate/dungeons/` (next section); workers only write block ids/metadata.
`setupDungeons.ts` wires the guardian and garrison spawner systems, boss bar, Sigil Compass,
`DungeonTracker` and `DungeonServices` (loot spill, player-dead query); tasks 'dungeons' (CRITICAL -
cheap, and NORMAL starves while the world streams: guardian + garrison spawner activation) and
'dungeons-hud' (CRITICAL: boss bar of the nearest engaged guardian, compass, 1 Hz dungeon-entered
probe).

**Spawner lifecycle** (`GuardianSpawnerSystem.ts`, `BlockIds.GUARDIAN_SPAWNER` 170 /
`GUARDIAN_SPAWNER_SPENT` 171, force 6, hardness 200, light 7):
- The kit's boss module writes `GUARDIAN_SPAWNER` (`ctx.guardian(x, y, z, index)`) with the guardian
  index in its metadata (molten 1, ossuary 2, embergrove 3, crystal 4, cocytus 5; 6 = the overworld Cave Drake). Its block entity
  (`GuardianSpawnerBlockEntity`, created on every sub-chunk apply) reports load/unload to the system.
- Armed + player within the guardian's `activationRadius` (default 12) and `activationHeight`
  (default 8) of the altar → `definition.create(altar top centre)`, added through the
  EntityManager; one live guardian per spawner.
- Guardian leaves without dying (despawn, reset, arena sub-chunk unloaded - the guardian is
  dismissed, never outlives its spawner's sub-chunk) → re-arms after 2 s.
- Guardian dies → in the same call the block becomes `GUARDIAN_SPAWNER_SPENT` (normal `setBlock`,
  index kept in metadata, persisted with the chunk) and its loot goes into a **reward chest**
  (`RewardChest.ts`): on the altar, else the nearest loaded air cell with solid support in two rings
  beside it, never inside the player; placed like a player chest (loot-resolved bit set, so no
  loot table rolls into it); overflow and chest-less loot spill as drops. If the altar's sub-chunk
  is unloaded at death, both happen when it reloads (this session).

**Registries** (register from the biome's `setup<Biome>()`):
- `GuardianRegistry.ts` - `registerGuardian({ id, index, displayName, activationRadius?,
  activationHeight?, create(position) })`; `id` must equal the entity's `guardianId`.
- `GarrisonRegistry.ts` - `registerGarrison(...)`, see Garrisons below.
- `DungeonLocator.ts` - `registerDungeonLocator({ dungeonId, biome, displayName, findNearest(x, z,
  seed, maxRadius) })` + `findNearestDungeon(x, z, seed, r, filter?)`: the registry the compass and
  tracker query. Castles register through `registerProceduralDungeonLocator`
  (`ProceduralDungeonLocator.ts`, see the framework section): the worker feature's placement math
  from the SAME config constant - pure (region hash + biome map, never terrain rejection), a few
  calls per second; it answers the castle's anchor (grid centre), y = base floor + 1. A locator that
  drifts from its feature points the compass at nothing.

**DungeonTracker** - `dungeon-entered` once per dungeon per session within 32 blocks horizontally
of a located anchor (Hell layer only - a castle's grid reaches ~50 blocks from its anchor, so this
fires a little way inside); `guardian-defeated` marks the nearest located dungeon within 96 blocks
cleared; cleared keys (`<dungeonId>@x,z`) persist under `dungeons`.

**Sigil Compass** (`sigil_compass`, hand recipe 2 gold bar + iron bar + corrupted essence): while in
the selected hotbar slot, the HUD needle (`SigilCompassHud`, top-centre slot under the boss bar)
points at the nearest castle anchor of the Hell biome the player stands in (range 1024: ≤ 25
regions), preferring uncleared ones (probe sweep cached within 64 blocks); re-located every 2 s or
16 blocks moved; silent on the surface or in a biome without a locator.

**`GuardianEntity`** (`src/entities/guardians/GuardianEntity.ts`, abstract, extends
`AggressiveEntity`, implements `BossBarTarget`): `GuardianConfig` adds `guardianId` (= `type`, the
`guardian-defeated` id), `displayName`, `drops` (`guardianDrop(itemId, min, max)`, resolved through
the item registry), `home`/`arenaRadius` (20)/`arenaHeight` (12), `phaseThresholds` ([0.5];
invulnerable `phaseTransitionTime` 1.2 s), `regenPerSecond`, `knockbackResistance` (0.85),
`damageTakenMultiplier`, `movement` ('ground' | 'flying' | 'stationary'), `maxMinions` (6),
`bossBarColor`, `deathDuration`. Subclasses implement `createMesh()` (faces +Z),
`updateAnimations(dt)` and usually `defineAttacks()` (`GuardianAttack`: cooldown, windup → active →
recovery, range, phases, weight, line of sight; one attack at a time, weighted pick); hooks
`onPhaseChanged`, `onEngage`, `onDisengage`, `onReset`, `onDefeated`, `onBlockedHit`. Helpers:
`meleeStrike`, `areaStrike`, `damagePlayer(amount, kb, source)`, `applyEffectToPlayer`,
`spawnProjectile`/`Fan`/`Ring`, `spawnMinion` (false at `maxMinions`), `clearMinions`,
`setInvulnerable`, arena/LOS/movement helpers. Rules:
- Engages when the player enters the arena or hits it; disengages `disengageDelay` (3 s) after the
  player leaves or dies (attack cancelled, minions cleared), walks home, regenerates and resets at
  full HP; dragged > arena + 6 from home for 3 s → teleported home.
- Death (once): minions + projectiles cleared, `guardian-defeated`, loot rolled and handed to the
  spawn link (reward chest); `getDrops()` is always `[]`. Loot nobody took spills via
  `DungeonServices.spawnDrops`. `dismiss()` vanishes with no loot and no event.
- Owned minions, projectiles and their offspring (`IEntity.spawnedChildren`, recursively: split
  slimes, shardling fragments) are pruned every 0.5 s and removed together - including entities
  still queued to enter the world - on disengage, reset, death and despawn.
- A shield/focus minion that must not count as a creature kill sets `countsAsKill = false`.

| # | Guardian (`id`) | Dungeon (`dungeonId`) | HP | Phases | Signature mechanic | Loot (+ 2 sigils, `infernal_heart`) |
|---|-----------------|-----------------------|----|--------|--------------------|-----------------------------------|
| 1 | Pyre Tyrant (`pyre_tyrant`) | Infernal Bastion (`infernal_bastion`) | 550 | 0.5 | fireball fans, slam leaves burning floor; phase 2 eruptions (`FirePatchEntity`) + Hell magma slimes | infernium ingots, magma cream, diamonds |
| 2 | Bone King (`bone_king`) | Catacombs (`catacombs`) | 520 | 0.66, 0.33 | raises skeletons; bone shield (20 % damage) whose 5 shards break only on hits charged ≥ 0.8 | soul shards, gold, bones, ectoplasm |
| 3 | Sporemother (`sporemother`, in `src/embergrove/sporemother/`) | Sporeheart Hive (`sporeheart_hive`) | 520 | 0.5 | rooted phase 1 (65 % damage), poison globs, spore stalker brood; uproots and walks with a poison aura | glowcap, emberwood, spore sacs, diamonds |
| 4 | Prism Warden (`prism_warden`) | Prism Sanctum (`prism_sanctum`) | 520 | 0.66, 0.33 | locked prism beam; each phase raises 3/4 `PrismFocusEntity` shields (15 % damage until all break, `countsAsKill = false`) | prism shards, diamonds, infernium |
| 5 | Rime Sovereign (`rime_sovereign`) | Frozen Citadel (`frozen_citadel`) | 500 | 0.66, 0.33 | frost nova ('magic' + Frostbite II), ice armor, two ice revenants (any standable spot) | rime crystals, diamonds, frost lanterns |
| 6 | Cave Drake (`cave_drake`, overworld) | dragon's lairs (a point of interest, no locator) | 600 | 0.5 | fire breath stream ('fire'), tail sweep, wing buffet; phase 2 fire rain | gold, diamonds, dragon egg, heaped gold (no sigils) |

Sigils: `ember_sigil`, `bone_sigil`, `spore_sigil`, `prism_sigil`, `rime_sigil` - every guardian
drops 2, so one castle of each kind covers the 9 Hellbane recipes. Activation radius/height (set in
each `setup<Biome>()`, tuned to the boss module) / `arenaRadius`: Pyre Tyrant 11/8 / 13, Bone King
13/5 / 17, Sporemother 8/6 / 11, Prism Warden default 12/8 / 13, Rime Sovereign 10/6 / 12 (passed by
`setupCocytus`).

**Projectiles** (`src/entities/projectiles/`): `ProjectileEntity` (`type 'projectile'`, no physics
body, not hittable) - `damage`, `owner` (never hit), `preset` (`fireball`, `bone_shard`,
`ice_shard`, `crystal_shard`, `spore_glob`; shared self-lit visuals, never disposed) or own mesh,
`gravity`, `homing`, `lifetime` (6 s), `knockback`, `effect` ({ id, seconds, level }, applied on
hit), `damageSource` ('projectile'), hit callbacks. Moves in ≤ 0.25-block sub-steps (no tunnelling),
stops on solid blocks. Spawn through `GuardianEntity.spawnProjectile*` or the entity spawn fn.

**Chest loot** (`src/world/loot/ChestLootRegistry.ts`): worldgen chests are bare `CHEST` ids written by
workers; on first open (`ChestBlock.prepareInteractionState`) an empty chest whose loot-resolved
metadata bit (bit 6) is clear is filled from the highest-`priority` table whose signature block lies
within its Chebyshev `signatureRadius` (≤ 8), then the bit is set either way. Rolls are deterministic
from the chest position (seed-independent). `registerChestLootTable({ id, signatureBlocks,
signatureRadius, priority?, roll(roll, x, y, z) => LootStack[] })` on the MAIN thread only (the
module is bundled into every worker via the chest block - keep it free of heavy imports). No other
chest-placing structure may put a table's signature block near its chests. Castle chests:
`ctx.chest()` puts the kit's `lootTierBlocks[tier]` UNDER the chest and the biome registers one
table per tier with radius 1 and priority rising with the tier, so the richest signature in a
chest's 3×3×3 neighbourhood wins - keep higher-tier signature blocks out of reach of lower-tier
chests (walls and floors count):

| Table | Signature (tier 0 / 1 / 2 / 3) | Radius | Priority |
|-------|--------------------------------|--------|----------|
| `charred-camp` (volcanic) | `CHARRED_LOG` | 6 | 0 |
| `abandoned-mineshaft` (overworld) | `ORE_CRATE` | 3 | 0 |
| `cave-poi` (overworld points of interest; contents by the keystone's kind) | `POI_KEYSTONE` | 8 | 20 |
| `bastion-t0`..`t3` | `INFERNAL_TILES` / `CHARRED_PLANKS` / `GILDED_INFERNAL_BRICKS` / `OBSIDIAN_BRICKS` | 1 | 11-14 |
| `catacombs-t0`..`t3` | `CATACOMB_TILE` / `CATACOMB_SKULL_BRICK` / `CRYPT_ALTAR` / `GILDED_RELIQUARY` | 1 | 10-13 |
| `sporeheart-t0`..`t3` | `HIVE_ROOTBRICK` / `BROOD_COMB` / `GLOWING_SAP` / `ROOT_LATTICE` | 1 | 10-13 |
| `prism-sanctum-t1`..`t3` | `SANCTUM_BRICK` (tiers 0 and 1) / `MIRROR_PANEL` / `INLAID_SANCTUM_TILE` | 1 | 11-13 |
| `frozen-citadel-t0`..`t3` | `GLACIAL_BRICK` / `FROZEN_MAGMA` / `GLACIAL_ICE` / `RIME_GLYPH` | 1 | 10-13 |

**Garrisons** (`GarrisonRegistry.ts`, `GarrisonSpawnerSystem.ts`, `BlockIds.GARRISON_SPAWNER` 172 - an
iron floor grate with embers, force 6, no drop, block entity like the guardian spawner): a kit
module writes it with the garrison index in its metadata (`ctx.garrison(x, y, z, index)`; ranges:
reference kit 1-9, molten 10-19, ossuary 20-29, embergrove 30-39, crystal 40-49, cocytus 50-59; the
registered garrisons and their mobs are tabled under `src/entities/`).
`registerGarrison({ id, index, displayName?, maxAlive (3), activationRadius (10, horizontal),
activationHeight (5), respawnSeconds (600), spawnRadius (3), create(position, slot) })` on the main
thread (`weightedGarrisonMembers(entries, fixedSlots?)` builds a mixed `create`). Phases: armed →
player in range → `maxAlive` members on standable cells around the grate (fielded once) → when none
is left: any killed → cooldown, re-armed after `respawnSeconds` with the player away (> 2 × radius,
timer resets when they return); none killed (despawned) → armed again. The spawner's sub-chunk
unloading removes its members (never outlive the room); phase is kept per spawner for the session,
so chunk reloads never duplicate or refresh a garrison early. A garrison's `create` may return any
entity (usually an `AggressiveEntity` mob; members are ordinary entities - they get the usual
wiring, distance despawn and kill bookkeeping).

### `src/world/generate/dungeons/` - Procedural dungeon framework (castles)

Worker-safe (no DOM/three.js); kits import from `dungeons/index.ts`. Every dungeon type is a
**kit** (`DungeonKit`) of **modules** (`ModuleDef`) on a 3D cell grid, grown into a castle by a
seeded layout generator and rasterized per sub-chunk by the generic `ProceduralDungeonFeature`.
Worked example: `kits/reference/ReferenceKeepKit.ts` (dev only - deliberately NOT imported by
`kits/index.ts`; the scratch harness and dev checks register it).

- **Placement** (`RegionPlacement.ts`, pure, shared by feature and locator): ONE candidate per
  512×512 biome region of the dungeon's biome, accepted with `chance` (0.85), anchor jittered inside
  the region so the footprint (`kitFootprintRadius(kit)` = (gridRadius+1)·cellSize + margins) + 8
  stays out of the 96-block blend band - there the blended height equals the biome generator's own
  height, so the castle (base Y, whole layout) is computable on the main thread. Two of one type are
  ≥ 2·(104 + footprint radius) apart: 376-438 blocks for the production kits (radius 84-115; a radius
  ≥ 152 leaves no room in a region - `regionDungeonAnchor` then returns null).
  `findNearestRegionDungeon(placement, x, z, seed, r, biomeAt)`.
- **Config** (`ProceduralDungeonConfig { kitId, biome, salt, chance? }`, in the kit's worker-safe
  `*Config.ts`): ONE constant shared by the biome's features list (`new
  ProceduralDungeonFeature(config)` - the `proceduralDungeon` feature type is already registered in
  WorldGenerator + ChunkGenerationWorker) and its main-thread locator
  (`registerProceduralDungeonLocator({ dungeonId, displayName, config, layer? })` in
  `src/dungeons/ProceduralDungeonLocator.ts`; also `findNearestProceduralDungeon`,
  `getProceduralDungeonLayout` (the exact worker layout, cached), `getBiomeTerrainHeight(biome, seed)`).
  Each kit module calls `registerDungeonKit` at load and is imported from `kits/index.ts` (imported
  by the feature: every worker, and the main thread).
- **Kit**: `cellSize` (blocks per cell, e.g. 9), `floorHeight` (per level, e.g. 7), `gridRadius`
  (cells from the anchor cell), `levels` [min, max] (negative = underground), `worldYRange`,
  `targetModules`, `require` ({ tag, count }[]), `palette` (named materials: a block id or weighted
  variants picked per world position), `door` ([3, 4]), `shaftSize` (Up/Down hole, default 1:
  centred, so ladders of stacked modules line up in any rotation), `lootTierBlocks` (tier 0-3
  signature block put UNDER each chest - see Chest loot), `baseY`/`baseYRange` (default:
  median terrain height over the footprint; level 0's floor), `tierFor`, `exteriorMargin`,
  `foundationDepth`, `exteriorHeight`, `maxAttempts`, `bossDepthFraction`, and the passes
  `foundation(ctx)` (pre-pass, default: palette 'foundation' under level-0 modules) and
  `exterior(ctx)` (post-pass: curtain walls, towers, approach, lights) in world coordinates.
- **Module**: `size` [x cells, levels, z cells] (canonical orientation), `connectors` ({ cell, face
  E/S/W/N/Up/Down, kind ('door'), exterior? }), `tags` (roles: `entrance` (needs an exterior
  connector; placed on the grid edge facing out), `boss` (attached at the deepest open connector),
  `cap` (dead-ends closing spare connectors), `vault`/`boss`/`cap` are sealed (join only through
  their attach connector); others free: 'garrison', 'room', 'stairs'...), `weight`, `minCount`,
  `maxCount`, `minDepth`/`maxDepth` (path depth), `levels`, `rotations`, `overhang` ({ up, down,
  side } blocks it may draw outside its cell box - writes beyond are dropped), `build(ctx)`.
- **Layout** (`LayoutGenerator.ts`): entrance on a seeded grid edge → weighted growth from random
  open connectors (bounds, overlap, level and Y-range checks; joins every matching neighbour
  connector, so loops form) → required tags/minCounts (deep-first for minDepth defs) → boss →
  caps; up to `maxAttempts` seeded retries, best-scoring attempt as the deterministic fallback;
  BFS path depth over joined connectors; tier = depth band (vault +1, boss 3); a dry run of every
  builder/pass records markers (chests, garrisons, guardian, lights). ~0.3-8 ms per layout.
- **Rasterizer** (`DungeonRasterizer.ts`, per sub-chunk; layouts in a per-worker LRU,
  `LayoutCache.ts`): foundation pass → modules in placement order → exterior pass; later writes win.
  Builders draw their WHOLE module every call through a clipped writer (current sub-chunk ∩ write
  box) and read only pure inputs (`ctx.terrainY`, layout occupancy) - `setIf`/`fillIf` may test the
  very cell they write - so any sub-chunk order gives identical bytes. `fill` ranges are inclusive
  and ORDERED: an inverted range (e.g. a span clamped to `ctx.clip` that came out empty) writes
  nothing - never swapped (a swap once drew the Catacombs' floating Y64 sheets); dev builds warn once
  per call site (`setDungeonDevWarnings(enabled, sink?)` for harnesses). ~0.1-0.7 ms per sub-chunk
  (max ~10 ms) for the reference keep.
- **Builder context** (`ModuleContext`): module-local coords (x 0..w-1, y 0..h-1 (0 = bottom floor),
  z 0..d-1; rotation/facing handled by the writer: `ctx.facing(BlockFacing)`), `set/setIf/fill/fillIf`
  (BlockSpec = id | palette name | fn(x,y,z)), `chest(x,y,z,{tier,facing})`, `garrison(x,y,z,index)`,
  `guardian(x,y,z,index)`, `light(x,y,z)`, `connectors` (open/closed), `doorwayBox(c)`,
  `isCellOccupied`, `isOuterFace`, `rng` (fresh per call), `hash`, `terrainY`, `tier`, `depth`,
  `dryRun`, `clip`. Primitives (`DungeonBuild.ts`): `room` (shell + interior floors + doorways for open
  connectors), `doorways`/`doorway`, `windows`, `hollowBox`, `walls`, `slab`, `carve`, `sprinkle`,
  `pillar`, `arch`, `battlements`, `roofPitched`, `roofPyramid`, `dome`, `stairs` (stairs blocks or
  full steps), `spiralStairs`/`spiralRing`, `ladder`, `shaftLadder` (through an Up/Down hole),
  `foundation`/`foundationColumn`, `clearAbove`, `approach` (gate path: causeway down / trench up to
  the terrain); `foundationUnderModules` (passes).
- Dev harness (scratch, not in the repo): layouts + per-level PNG maps, rasterized top views,
  walkability BFS (entrance → boss and every chest) and a seam check (every sub-chunk again in a
  shuffled order with a fresh layout must match byte for byte).

**Production kits** (`kits/<dir>/`, all `cellSize` 9, `gridRadius` 5, `floorHeight` 7 - the citadel
8; the castle's biome features keep out of it through the listed pure query):

| Dungeon (kit id) | Biome | Files (`kits/`) | Levels, module defs (target) | Footprint r | Shape | Keep-out query |
|------------------|-------|-----------------|------------------------------|-------------|-------|----------------|
| Infernal Bastion (`infernal_bastion`) | `hell` | `molten/Bastion{Kit,Config,Modules,Build,Passes}.ts` | −1..3, 27 (24-34) | 101 | walled bailey on a brick plinth (lava sea or cut badlands), gatehouse + causeway, keep halls, undercroft (prison, treasury, vaults), obsidian spire; boss: Throne Crucible | HellPillar `avoidInfernalBastions` |
| The Catacombs (`catacombs`) | `ossuary` | `ossuary/Catacombs{Kit,Config}.ts` | −3..0, 28 (26-36) | 108 | walled cemetery precinct + chapel-mausoleum entrance, grand stair into three crypt levels; boss: throne crypt | `isNearCatacombsPrecinct` (`features/ossuary/CatacombsSite.ts`) |
| Sporeheart Hive (`sporeheart_hive`) | `ember-grove` | `embergrove/{SporeheartHiveKit,hiveModules,hiveShapes,hiveConstants}.ts` | −2..1, 25 (22-32) | 84 | root mound (foundation pass), buttress roots, crown fungi, root-arch gate; boss: Sporemother's throne at level −2 | `findHiveFootprintsNear` (`features/embergrove/HiveClearing.ts`) |
| Prism Sanctum (`prism_sanctum`) | `crystal-abyss` | `crystal/PrismSanctum{Kit,Config,Modules,Site}.ts`, `sanctumBuild.ts` | −1..2, 27 (20-30) | 89 | temple on a sanctum-brick plinth, octagon hubs, galleries, observatory spire, processional stair; boss: lens chamber | `isNearPrismSanctum` (`PrismSanctumSite.ts`) |
| Frozen Citadel (`frozen_citadel`) | `cocytus` | `cocytus/{FrozenCitadelKit,frozenCitadelConfig,frozenCitadelPlacement}.ts` | −2..2, 25 (24-31) | 115 | on the lake (floor Y 47): drawbridge over a crevasse, curtain walls + towers, great spire, undercroft under the ice; boss: throne hall | `isNearFrozenCitadel` (`frozenCitadelPlacement.ts`) |

---

### `src/entities/` - Entities

**Key Files:**
- `EntityManager.ts` - NORMAL task. `addEntity` queues (refused at `maxEntities` 1000 or a duplicate
  id); `removeEntity(id)` also takes an entity still queued to enter (`onDespawn` + dispose - it never
  enters the world). Every added entity is wired duck-typed: `setPlayerPositionRef`,
  `setPlayerDamageCallback` (`(damage, knockback, source?)`), `setWorldQueryFns`,
  `setEntitySpawnFn` / `setEntityRemoveFn` (minions, projectiles). An ACTIVE entity found
  `!isAlive` (killed outside its own update, by another entity or a system) is reaped. Despawn
  radius = max(1, `chunkDistance` − 2) chunks, horizontal, block entities exempt (at render
  distance 2 a zero radius removed guardians, projectiles and drops right after spawning).
- `spawning/EntitySpawner.ts` (LOW) + `EntitySpawnConfig.ts` - Mobs come from the biome's
  `entitySpawns` (`entityType`, `spawnRate` roll, `minY`/`maxY`, `maxNearby` - counts every loaded
  entity of the type, light bounds, `validGroundBlocks`, `searchFromSky`, `createEntity`) plus any
  `addSpawnProvider((biome, layer) => configs)` (night creatures: biome generators are also loaded by
  workers, so main-thread-only spawns go through a provider); `condition`, `maxSpawnDistance`,
  `minSkyLight`/`maxBlockLight` and `veto` narrow a config. The layer is picked from the player's Y,
  ground searched near the player's Y, ≥ 24 blocks away. Underground spawns never set
  `searchFromSky` and keep `minY`/`maxY` inside the cavern.
- `PlayerDamageHandler.ts` - Entity → player damage (see Player Damage)
- `AggressiveEntity.ts` / `PeacefulEntity.ts` - Config-driven mobs; `onPlayerInteract` takes damage
  and knockback from `getPlayerAttackDamage` / `getPlayerAttackKnockback`
- `interfaces/IEntity.ts` - Adds `countsAsKill?` (false: no `entity-killed`) and `spawnedChildren?`
  (entities this one put into the world itself, so an owning guardian can clear them)
- `guardians/`, `projectiles/` - see Dungeons & Guardians

**New mob checklist:** materials through `registerMaterialForLighting`, then `optimizeEntityMesh(root,
{ merge, dynamic: [animated nodes], registerForLighting })`; a custom `onPlayerInteract` takes its
damage from `getPlayerAttackDamage` (never tool stats); player damage goes through the damage
callback with its `source`; entities a mob spawns (children, packs, bolts) enter through the
EntityManager (`setChildSpawner`, `HellhoundEntity.setPackSpawner`, `setCrystalEntitySpawner`, the
spawn fn) and are listed in `spawnedChildren`; drops via config `drops: IEntityDrop[]` or a
once-guarded `getDrops()`. Entity `type` strings are matched by journal milestones - never rename.

**Hell mobs** (HP / hit):

| Biome | Mobs |
|-------|------|
| Molten Wastes | `magma_slime` Hell variant (`variant: 'hell'`: ×2 HP, contact 4; magma cream), `skeleton` (+ a 0.5-rate spawn on bastion bricks/tiles), `ember_roach`, `hellhound` 24 / 5-7 (pack leader brings 1-2 followers, capped at 6 alive) |
| The Ossuary | `wraith` 24 / 6 + slowness (flies through rock), `bone_hound` 22 / 5, `skeleton` |
| Ember Grove | `ember_hog` 26 / 5 (provoked only), `spore_stalker` 32 / 6 + poison, `ember_roach` |
| Crystal Abyss | `shardling` 30 / 7 (shatters into two 12 / 4 fragments), `prism_wisp` 20 / 6 (fires `crystal_shard` bolts) |
| Cocytus | `ice_revenant` 40 / 9 (slow telegraphed slam), `frost_wraith` 22 / 5 + Frostbite, `skeleton` (`enemies/cocytus/cocytusSpawns.ts`) |

**Castle garrisons** (dungeon-only mobs, never in `entitySpawns`; `registerGarrison` in each
`setup<Biome>()` - `src/embergrove/hive/HiveGarrisons.ts` for the hive; HP / hit):

| Castle | Garrison mobs | Garrisons (index: members) |
|--------|---------------|----------------------------|
| Infernal Bastion | `infernal_knight` 42 / 9 mace smash, 6 shield-bash charge (frontal hits 20 %); `ember_caster` 24 / 7 fireball (every third a fan of 3), blinks away | 10 gate guard, 11 barracks (knight + skeletons), 12 caster nest (2 casters), 13 kennel (3 hellhounds, never pack leaders), 14 war forge (knight + Hell magma slimes), 15 prison (caster + skeletons), 16 vault guard (knight + caster, respawn 900 s), 17 wall patrol |
| Catacombs | `crypt_ghoul` 34 / 7 per claw, the second + 3 s poison (lurks in a niche, leaps); `hollow_priest` 32 / 7 homing soul bolt + slowness, 6 'magic' bone ward, blinks | 20 ghoul den (3), 21 niche ambush (2, not lurking), 22 priest sanctum (priest + skeletons), 23 guard crypt (skeletons, sometimes a bone hound), 24 wraith haunt (2 wraiths) |
| Sporeheart Hive | `spore_drone` 16 / 4 + 2.5 s poison (flies, orbits, darts); `rootbound_warden` 56 / 9 maul, 4 snare + Rootbound + yank (shrugs off knockback) | 30 brood (4 drones), 31 warden (+ 2 drones), 32 stalker den (spore stalkers, sometimes a drone) |
| Prism Sanctum | `crystal_sentinel` 45 / 7 shield bash, 9 locked lance beam (spawns dormant; frontal hits 40 %); `prism_acolyte` 26 / 5 ×3 splitting bolt, blinks | 40 acolyte coven (3), 41 sentinel guard (2), 42 sentinel court (2 + acolyte), 43 shard swarm (sentinel + shardlings) |
| Frozen Citadel | `frozen_knight` 45 / 10 + Frostbite (ice shield: frontal hits 30 %); `rime_archer` 26 / 7 ice shard + Frostbite | 50 guard (2 knights), 51 archers (2), 52 patrol (knight + archer), 53 warden (2 knights + archer), 54 frost wraiths (2), 55 the damned (2 ice revenants) |

---

### `src/daynight/`, `src/nightfall/`, `src/fireflies/` - Day, Night, Night Creatures, Glow

The overworld has a 20-minute day: 12 real minutes from 06:00 to 18:00, 8 from 18:00 to 06:00
(night hours pass faster). Only the surface layer sees it; the clock runs everywhere.

- `daynight/WorldClock.ts` - THE clock, `worldClock` (pure data, no three.js): `hour`, `day` (from 1,
  ticks over at 06:00), `time` (seconds since 06:00, saved), `sunElevation`, `nightAmount` (0-1,
  smooth), `isNight` (sun < ≈-7° until sunrise, with hysteresis - night creature time), `advance`,
  `set`/`setHour`; `sunDirectionAt`/`moonDirectionAt` (sun rises at +X, tilted toward +Z). New worlds
  and old saves start at 07:00.
- `daynight/setupDayNight.ts` - the CRITICAL 'world-clock' task (held until the saved time loaded),
  keyed player data `daynight` (`{ version, time, day }`), `nightfall`/`daybreak` events, and
  `skipToMorning()` (to 06:15 - sleeping), `toggleNight()` (debug: the "Make night / Make day"
  button above the performance overlay's stats - to 21:00, or to morning without counting the night
  as survived). `daynight/sleep.ts`: the bed (E on `BED_HEAD`, main.ts)
  calls `requestSleep()`; setupNightfall's handler refuses while a night creature is within 16
  blocks, else fades to black (`ui/SleepFade.ts`) and skips the night. Sleeping only on the surface.
- The sky/light side is `renderer/skybox/DayNightSky.ts` (see Atmosphere under `src/renderer/`).
- `nightfall/setupNightfall.ts` - each surface biome's night creatures as an `EntitySpawner`
  provider: only while `worldClock.isNight`, 24-64 blocks from the player, `searchFromSky`, sky light
  ≥ 8 (never under a roof), block light ≤ 7 (torches keep them away), outside every Ward Lantern's
  reach, at most 6 night creatures alive; registers `NightSenses` (player gaze from the camera,
  carried light from the held block item's `lightLevel`, block light, `EnvironmentalDamage.ignite`),
  the sleep handler and the nightfall notice. `NightCreatureTypes.ts`: the entity types and trophy
  item ids (plain data for the journal). `WardLanterns.ts`: loaded Ward Lanterns (reported by their
  block entity) - `isWarded(x, y, z)` within 32 blocks horizontally, 48 vertically.
- `entities/night/` - the creatures. Every one uses `DawnRetreat` (`NightCreature.ts`): after
  sunrise each waits 2-24 s, plays its own exit and removes itself with no drops (drops only come from
  the player's killing hit); it can't be hit and doesn't attack while leaving. `NightSenses.ts` is
  the hook for what they sense beyond the usual entity wiring (no-ops until registered).

| Creature (type) | Biomes | HP / hit | How it hunts | Trophy (`night_trophy`) |
|-----------------|--------|----------|--------------|-------------------------|
| Stillwatcher (`stillwatcher`) | plains, grassy hills | 30 / 5 | scarecrow; frozen (no move, no attack, no knockback) while the player looks at it (55°, line of sight), fast when unwatched; creaks when caught | `witchstraw` |
| Duskmoth (`duskmoth`) | plains, hills, pine forest, coastal rainforest, jungle, swamp | 12 / 3 | flies; notices from 40 blocks if the player carries a light or stands in block light ≥ 8 (else 10), erratic loops, telegraphed swoops | `moth_dust` |
| Sandmaw (`sandmaw`) | desert | 36 / 8 + launch | swims under sand/sandstone (spines only), telegraphed eruption under the player; hittable only while reared; can't strike a player on stone | `sandmaw_fang` |
| Ashwalker (`ashwalker`) | volcanic | 40 / 6 + ignite | slow, kindles (faster) under 35 % HP; ember-burst cone (5 'fire' + ignite) after a 0.8 s windup | `cinder_core` (fuel 24, brews fire resistance) |
| Mire Angler (`mire_angler`) | swamp | 44 / 9 + pull | lurks in water/mud with a glowing lure, lunges within 5 blocks, the bite pulls toward its lair | `angler_lure` |
| Hollow Stag (`hollow_stag`) | pine forest | 50 / 9 | circles, paws (1.2 s telegraph), charges at 14 b/s; slamming a trunk stuns it 2.5 s (+50 % damage taken) | `ghost_antler` |
| Orchid Mantis (`orchid_mantis`) | jungle, coastal rainforest | 28 / 4+4 | disguised as a flowering bush (`isQuiet`) until the player is within 6 blocks; hop-lunges, double slash, hops back | `mantis_scythe` |

Trophies: any two make a **Ward Lantern** (+ iron bar + torch; `WARD_LANTERN` 350, light 15, no night
spawns within 32 blocks); `moth_dust` ×2 also brews ember sight, `cinder_core` fire resistance
(`crafting/recipes/NightfallRecipes.ts`). Journal chapter Nightfall (optional milestones: survive a
night, slay a night creature, a Ward Lantern, every trophy).

**A new night creature:** an entity in `entities/night/<name>/` using `DawnRetreat`, an entry in
`NIGHT_CREATURES` (setupNightfall) and `NIGHT_CREATURE_TYPES`, its trophy item (tag `night_trophy`,
registered in `items/nightfall/registerNightfallItems.ts`), an `EntityVoices` entry.

**Swamp bioluminescence** (the night is when it shows): the swamp's giant mushrooms are red (34 %,
no glow), blue, purple, foxfire (green) and amber (16-17 % each; `MUSHROOM_KINDS` in
SwampGenerator). Each glowing mushroom's site carries a ragged **glowmoss** carpet (radius 3-6)
written by the worker's terrain fill - `mushroomSite()` is pure, so the fill and the main-thread
decoration agree on where mushrooms grow - plus sparse noise patches; glimmercaps grow in the moss
and lumen ferns all over the floor (two `FlowerPatchFeature`s with different grid sizes - its salts
are fixed, so equal grids would share patch centres). Caps breathe (`wave` pulse). The ground cover hides by day: glowmoss is muddy
grass with a few pale specks, glimmercaps are dusty little mushrooms, lumen ferns plain ferns -
their glow maps (dark-only) light up after dark: twinkling turquoise spores over a faint teal sheen,
pink caps, cyan fiddleheads. Glowmoss lights only itself (no block light: block light is warm torch
light, and carpets of emitters would cost light work), so night creatures still spawn on it.
The pools glow too (`SubmergedPlantFeature`, a worker feature after the water fill): **glowkelp**
strands (`GLOWKELP` stalk segments under a `GLOWKELP_TOP` crown, 60 % reaching the topmost water
cell so their fronds break the murky surface) in zoned forests, and **lanternweed** beds on the
mud - both submerged blocks (see Liquids), olive plants by day; after dark kelp bladders glow
electric blue over a faint blue sheen on the blades, lanternweed pods gold. Both sway in the
current (`makeSwayInCurrent`), are cutouts in the opaque pass (never `transparent`: the water's
surface must always draw over them), are placed only into a swamp water source on support, and
float loose (drop their item, leave water) a segment at a time when their support goes
(`SubmergedPlantBlock`, scheduled ticks). A placed glowkelp segment becomes a fresh crown. Their
light scatters up through the pool (`scatterGlow`, see Liquids): the surface over a kelp forest
glows blue, over lanternweed gold - and each plant's glow halo lights the water around it.

**Fireflies** (`src/fireflies/`): `FireflySwarm` is one GPU point cloud (200 points, additive, no
fog, renderOrder 510) around the player; the CPU only picks each firefly's anchor (open ground in a
firefly biome, sky light ≥ 7, 0.4-3 blocks up, 12 picks per frame, re-picked after a 25-70 s life or
when left behind) and the shader wanders, blinks and fades them. `setupFireflies` (CRITICAL
'fireflies' task): visible share = `worldClock.nightAmount` × surface weight; swamp only
(`FIREFLY_DENSITY` per biome - an anchor outside the swamp is rejected).

**Butterflies and dragonflies** (`src/butterflies/`): the daytime counterpart of the fireflies. `ButterflySwarm` is one
GPU point cloud (110 butterflies + 12 dragonflies, opaque cutouts with dithered fade, fogged, dimmed by `daylightUniform`,
renderOrder 510) around the player; the CPU only picks anchors (butterflies: open ground with sky light ≥ 12, preferring
plants, 0.5-2.5 blocks up; dragonflies: water / swamp-water source surfaces) and the shaders animate and draw them
procedurally (no textures: flapping wing pairs, darting dragonflies facing their flight). `setupButterflies` (CRITICAL
'butterflies' task): visible share = (1 − `worldClock.nightAmount`) × surface weight; `BUTTERFLY_DENSITY` per biome
(jungle 0.07 - Ben's "good amount"; hills/coastal 0.015, pine/swamp 0.01 - the odd one; none on the plains, in
the desert or the volcanic lands).

### Nature: wild plants, ground cover, farming (`src/farming/`, `blocks/types/{foliage_shared,wild_plants,crops,forage_shared,farmland}/`)

The overworld is carpeted with life, and plants grow.
- **Foliage blocks** (`FoliageBlock`, `foliage_shared/FoliageBlock.ts`; spec in `blocks/foliage/FoliageSpec.ts`): a plant
  or doodad drawn by the foliage renderer (see `src/renderer/`). Never solid, mined instantly, `replaceable`
  (a placement aimed at it goes INTO its cell - `BlockPlacement`; liquids flow into it and wash it away -
  `LiquidPhysicsAlgorithm.isOpenCell`); pops off (dropping what it drops) when its ground goes - a
  scheduled support tick, so worldgen plants cost nothing until something changes next to them. Options:
  sprites (variants), shape (`cross` | `flat`), size, sway, jitter, scale variation, view distance, glow
  map (dark-only or not), `ground` / `floatsOn` (lily pads on water), `drops`. Display (icon, held,
  dropped) is a plain cross/flat mesh of the first sprite. A new sprite: bottom-aligned 64×64 cutout
  filling the lower `height` of the square (cross) or the whole square (flat), from the Codex white/
  magenta-background workflow (generate-texture skill), alpha binarised at 0.5.
- **Wild plants** (`wild_plants/wildPlantBlocks.ts`, one data table, assets in `wild_plants/assets/`): grasses
  (short/tall/jungle/dry/beach/frosted/ash, sedge), flowers (daisy, dandelion, lavender, foxglove, heather,
  orchid, heliconia, fireweed, sea thrift, bog cotton, desert marigold, ember lily - glows, light 6), bushes
  and ferns (wild bush, bracken, salal, elephant ear, horsetail, dead bush, tumbleweed, barrel cactus, aloe),
  mushrooms (toadstool, edible brown mushrooms), flat doodads (pebbles, twigs, leaf/needle litter, cinders,
  obsidian shards, beach shells, driftwood, volcanic rocks, glowing embers, lily pads, water lilies). Grass drops wheat seeds now and then;
  twigs/dead bushes/driftwood sticks, needle litter pinecones, shells a sea shell, aloe leaves; flowers and
  bushes drop themselves (`PlantBlockItem`, one generic block item; `items/nature/registerNatureItems.ts`).
- **Ground cover** (`generate/features/GroundCoverFeature.ts` + per-biome layers in `natureGroundCover.ts`): appended
  LAST to every overworld biome's features (after trees and structures - it only fills open ground). Per
  column, layers are tried in order (rare finds, doodads, noise-zoned flower fields and patches, then the
  grass carpet), one plant per column. Play feedback: only the jungle is lush; elsewhere low grass is a light
  scatter and knee-to-face plants (tall grass, bracken, foxgloves) only gather in small rare patches; the
  desert has half the scatter; the volcanic lands grow almost nothing (rocks, glowing embers, cinders,
  obsidian, a few ember lilies), on the surface found near the blended height (looking through
  canopies). A column whose ground is the top row of the sub-chunk below is handled by the sub-chunk
  above through `FeatureContext.getTerrainTopBelow` (the worker fills that terrain lazily) - otherwise flat
  land at a sub-chunk's top Y came out bare. Main-thread decorations (oaks, cacti, giant mushrooms) treat
  ground cover as open (`isOpenForDecoration`) and overwrite it.
- **Farming**: hoes till grass/dirt/podzol/mud/moss/snowy grass into `FARMLAND` (`setupFarming`, right-click - held,
  it keeps tilling every 0.22 s (CRITICAL 'farming-input' task); moist
  `FARMLAND_MOIST` at once within 4 blocks of water; farmland re-checks its water on random ticks). Crops
  (`crops/CropBlock.ts` + `cropBlocks.ts`): wheat, hemp, herb (3 stages, the original crops, now random-tick
  grown) and carrot, potato, tomato, onion, strawberry, pumpkin (4 stages) - foliage blocks planted only on
  farmland (seed items are `IPlantable`: `plantsBlock`; an edible plantable is planted when aimed at farmland,
  eaten otherwise - `ItemConsumption.endPress`), grown by random ticks (`stageSeconds` on moist farmland, ×0.6
  dry, ×0.35 wild), bone meal grows a stage (`IGrowableBlock.grow`). Young crops drop their seed, ripe ones
  the harvest (produce + seeds). Wild ripe crops grow in rare ground-cover patches (carrots/onions/pumpkins
  in the plains, potatoes in the hills, tomatoes in the jungle, strawberries in the forests).
- **Forage bushes** (`forage_shared/ForageBushBlock.ts`): blueberry (pine forest), prickly pear (desert), pineapple
  (jungle) - ripe/picked pairs like the berry bush; every ripe bush (`IHarvestableBlock`, berry bush included) is
  picked with E or right-click (`setupFarming`; `BlockPlacement` places nothing on a bush), random ticks regrow.
- **Seeds for every wild food plant**: blueberries, prickly pears, pineapples, aloe leaves and berries each craft
  into 2 seeds (`NatureRecipes`), planted on farmland as `ForageSproutBlock` young stages (`<name>_1`, `<name>_2`,
  `forage_shared/ForageSproutBlock.ts`) that grow into the bush (or aloe); grown bushes stand on farmland too.
- **Saplings**: oak leaves drop oak saplings (6%, mined or decaying); `OakSaplingBlock` grows an `OakTree` on
  grass/dirt/podzol. Pine saplings and berry bushes also regrow on random ticks now (their scheduled ticks
  were lost on reload).
- **Food** (`items/food/`): carrot 2, potato 1 → baked potato 6 (forge), tomato 2, onion 1, strawberry 2,
  blueberries 2, prickly pear 3, pineapple 4, aloe leaf 3 (cures poison), mushroom stew 6, vegetable stew 12
  (bowl + carrot + potato + onion), pumpkin pie 9 (pumpkin + 2 ground wheat); foraged (`crafting/recipes/
  ForageRecipes.ts`): roasted puffball 4 and roasted toadstool 3 (forge), mushroom skewer 10 (stick + both roasts +
  brown mushrooms), forager's salad 7 (bowl + 3 salad greens). Bone meal on bare ground sprouts grass and flowers by
  the ground block.
- **Every plant is good for something** (play feedback: "most items should be usable for something"): 4 of any
  `compostable` plant (wild plants, flowers, cave plants, glowing swamp plants, cacti, vines, leaves, giant mushroom
  caps) → 1 bone meal; glowing plants + herb brew ember sight; skulls → bones, shells → bone meal, dusty bottles →
  glass, dripstone formations → dripstone, vines → rope. Plant tags come from one table by block name
  (`items/tags/blockItemTags.ts`, read by `BlockItem.tags`; block items with tags of their own override it).
- **Existing worlds**: generated sub-chunks are saved once and never regenerate, so ground cover only
  appears in newly generated land.

### Caves and dark places (`src/caves/`, `generate/caves/{CaveBiomes,CaveDressing,CaveMask}.ts`, `features/MineshaftFeature.ts`)

The underground between the surface and the Hell ceiling (the cave band, Y ~146 to under the surface) is
divided into zones: most are plain caves, and now and again one is one of eight kinds of special cave, each
with its own rock, decorations, mood, sounds and creatures. Play feedback: 176-block zones felt like
"I'm in the geode area", then small 3D pockets in half the underground were "too mixed up" - keep zones
smallish and mostly plain.
- **Cave biomes** (`CaveBiomes.ts`): `caveBiomeAt(x, z, seed, surfaceBiomeAt, out)` → `{ biome, strength }`
  - jittered Voronoi zones of 88 blocks with warped borders, each a column from the surface down to the
  Hell ceiling; one in four (`SPECIAL_SHARE`) is special (~19% of the area past the rim), the rest plain
  (`biome` null). A special zone is full strength inside and thins to 0 over its last 12 blocks (`RIM`,
  distance to the bisector with the neighbouring zone). Its kind is rolled by hash with odds set by the
  surface biome over its centre (`CAVE_WEIGHTS`: frozen caves under pine forests, magma chambers under
  volcanic lands, glowworm grottos and fungal hollows under swamps, ...). Pure: the worker (with
  `getBiomeNameAt`) and the main thread (with `biomeRegistry.selectBiomeForLayer`) always agree. Biomes:
  dripstone caverns (dripstone, stalactites
  and stalagmites), mossy grotto (moss, cave ferns, glow blooms, hanging roots, cave vines with harvestable
  glowberries that regrow and grow longer), glowworm grotto (damp slate, curtains of glowing glowworm
  threads), crystal geode (calcite, glowing celestite blocks and clusters), fungal hollow (glowing pale
  mycelium, cave mushrooms, puffballs, giant pale mushrooms with light-12 caps), frozen cave (frosted stone,
  glacial ice, snow patches, icicles), magma chamber (basalt, magma, lava lakes up to Y 160 off its rim,
  obsidian where rock meets lava, embers, glowing sulfur clusters), webbed hollow (cobwebs in corners and
  under ceilings, egg sacs, bones).
- **Plain caves** (`PLAIN_CAVE` in `CaveDressing.ts`): mostly stone - gravel patches on ~12% of floors,
  pebbles, a rare mushroom, bones or cobweb, hanging roots only within 16 blocks of the surface
  (`Decor.maxDepth`); plus `scatterRockBlobs`: andesite and granite blobs (~10% of stone, 7-block value
  noise, kind by a 40-block noise) through all overworld stone from Y 146 up to 8 blocks under the surface,
  caves or not.
- **Dressing** (`CaveDressing.ts`, `DRESSINGS` per biome): the cave biome is sampled on a world-aligned
  4-block column lattice (lazily, only near caves) and interpolated per cell; a cell is in the special zone
  where its strength beats patch noise (a ragged rim), else plain. Rock touching cave air (only STONE - ores and
  feature blocks stay) is lined as floor/ceiling/wall in patches of 3D value noise (values bunch around 0.5:
  coverage 0.32 ≈ 18% of the surface); decorations roll per air cell beside a floor or ceiling. A decoration belongs to the sub-chunk holding its anchor air cell and is
  kept inside it (formation lengths clamp, giant mushrooms only where they fit whole), so nothing is cut at a
  seam; every choice hashes world coordinates. ~1-2 ms per sub-chunk. Cave foliage (`cave_plants/`) uses the
  foliage renderer, hanging pieces with shape `'hang'` (anchored at the cell top, held by the block above;
  chains via `alsoSupportedBy`); glow maps light crystals, gills, berries and glowworms in the dark.
- **Atmosphere** (`CaveAtmosphere.ts`, the 'skybox' task): an underground factor eased from sky light at the
  camera, counted only with natural rock (ROCK/SOIL) overhead - a roofed house stays a house - and the cave
  zone at the camera; the mood blends by `weight` (factor × zone strength, eased - 0 in plain caves,
  which keep the old underground look). The sky/fog darken to the zone's fog colour
  (`Skybox.setCaveUnderground`), haze thickens to its distance (`DistanceFog.setCaveHaze`, 55-110 blocks)
  and the light floor takes its tint (`blendLightFloor`; Ember Sight still post-adjusts it). Fog colours
  stay darker than anything lit.
- **Runtime** (`setupCaves.ts`): an EntitySpawner provider (providers now get the candidate position) spawns
  the creatures of the special zone at each spawn position while the player is in a cave (factor ≥ 0.5;
  plain caves: bats and the odd spider): glow bats (flocking, passive, glowing wings) everywhere but magma chambers, cave spiders (webbed hollows, rare in dripstone), geode
  crawlers (crystal geodes, armoured crystal back), sporelings (fungal hollows, spore puffs), ember
  salamanders (magma chambers, set you alight) - `src/entities/cave/`; the CRITICAL 'caves' task emits
  `cave-biome-entered` (journal chapter Into the Dark, ambience); the `abandoned-mineshaft` chest loot table.
  Ambience (`AmbienceController` `CAVE_DETAILS`/`CAVE_BEDS`) layers each cave's sounds (dripstone drips,
  crystal pings, spore puffs, ice creaks, lava pops) and a matching Hell bed.
- **Mineshafts** (`MineshaftFeature.ts`, `overworldMineshafts()` in every overworld biome with equal settings):
  one chance (55%) per 320-block cell of a flat network of corridors 4 wide and 3 tall (play feedback: 3 wide caught the player on every frame) at Y 168-205, oak post-and-beam
  supports every 4 blocks, plank floors bridging caves, cobwebs, junction rooms, and up to 3 dead-end chests
  beside ore crates (the loot table's signature; crates drop coal and iron ore). Each sub-chunk rasterises
  the corridors crossing it; never within 6 blocks of the surface.
- **Items**: celestite shards (clusters, crystal blocks, geode crawlers) → celestite lamps (light 15) and
  blocks; spider silk → rope; glowberries (food, plant them under a ceiling to grow a vine); cave mushrooms
  + herb → ember sight; salamander scale + herb → fire resistance.

### Underground points of interest (`generate/caves/pois/`, `src/pois/`)

Things to discover in the overworld's caves: 45 kinds of ruin, treasure, dwelling and wonder. The first 25: rune
circles, sealed rune vaults, dragon's lairs, lost hoards, smugglers' caches, miners' camps, dwarven forges, forgotten
halls and libraries, crypts, giant geodes and fossils, a petrified tree, sunken shrines, fairy rings, lost and
frozen explorers, an alchemist's den, a spider queen's nest, a buried longship, a stone colossus, a wishing
well, a mother lode, a hermit's hollow, a hidden garden. The second 20 (`kinds/{ruins,sacred,outlaws,wilds}.ts`):
a sunken cistern, an old stone bridge over a chasm, a forgotten gaol, a buried arena, a black monolith, a forgotten
chapel, a star chamber (observatory), a sandstone tomb (desert only), a buried wizard's tower, a sculptor's studio,
a bandit hideout, a cave-in, an excavation site, the Deepway Tavern, a mushroom village, hot springs, a fallen
star, great roots, a frozen waterfall (cold only), a wyrm burrow. Ben's ask: not too common, but you come across
one every now and again (more kinds dilute each other; the site rate is `POI_CHANCE`). The ruined portal was cut
before release (no portals in this game): index 22 is retired, never reuse it.
- **Catalog** (`PoiCatalog.ts`, plain data shared by worker and main thread): `PoiKindId`, keystone `index`
  (1-255), display name, toast flavour line, and odds as a function of the surroundings (surface biome, cave
  zone at the cell centre; rarity tiers common 10 / uncommon 6 / rare 3 / legendary 2.2 - the dragon's lair).
  Ids and indices are persisted (journal, saved keystones): never rename or renumber.
- **Placement** (`PoiSites.ts`, pure, cached per worker): one candidate per 64-block cell (8 per biome region
  side, so a site never straddles a region and every chunk sees the same blend), chance 0.38; the kind is
  rolled, then up to 6 hashed columns are probed for a cave floor with 3 cells of headroom, deep enough for
  the whole site under the surface (10 blocks), above Y 152, clear of flooded caves and magma chamber lava.
  ~34% of cells end up with a site: one per ~12,000 blocks² (~110-block spacing). The site faces its most
  open side (local +Z = forward, toward the cave). A chunk lies in exactly one cell.
- **Cave probe**: `CaveCarver.probeRegion(box)` carves a free-standing box into a fresh volume - the same
  cells the generator carves there (world-aligned lattice) - so a structure crossing many sub-chunks knows the
  original caves around it (`PoiBuilder.isCave/isRock/floorAt`) before they exist.
- **Builders** (`kinds/{ancient,treasure,nature,dwellings,wonders}.ts`, registry `kinds/index.ts`): a
  `PoiBuildDef` = kind + extent (`radius`, `above`, `below` around the anchor - writes beyond are dropped) +
  `build(b)`. `PoiBuilder` is the drawing context: local rotated coordinates (anchor = the floor's first air
  cell, floor at y -1), clipped to the current sub-chunk, implementing the dungeon framework's `DrawTarget`
  (so `pillar`, `arch`, `dome`... draw here too), plus `chamber` (a roughened ellipsoid of air with a flat
  floor), `ellipsoid`, `floor`/`foundation` (filled down to rock under open cave), `ellipsoidTop` (a
  chamber's ceiling, pure), `chest`, `keystone`, seeded `rng` and world-anchored `hash`/`smoothNoise`.
  Builders are pure functions of the site: draw everything every call, read only the probe, the surface and
  their own stream (`get`/`setIf` may read cells this sub-chunk owns), so any generation order gives the same
  blocks. Helpers in `kinds/shared.ts` (`masonry`, `walledRoom`, `scatter` - decorations need ground -,
  `hangFromCeiling`, `mix`, `weighted`).
- **Worker** (`placeCavePois.ts`, Phase 4.57 after the dressing and rock blobs, full-detail surface-layer
  sub-chunks with caves): draws its cell's site slice, then removes cave plants the structure left
  unsupported (each plant's own `FoliageBlock.isSupportedBy`). ~1.6 ms per affected sub-chunk.
- **Keystone** (`POI_KEYSTONE` 490): stone to look at and mine (stone's texture layer and drop), buried under
  each site with the kind's index in its metadata. Its block entity reports the loaded point of interest to
  `poiRegistry` (`src/pois/PoiRegistry.ts`) - how the main thread knows where they are. Every chest of a
  site lies within 8 blocks of it: the 'cave-poi' loot table (signature keystone, radius 8, priority 20,
  `PoiLoot.ts`) picks contents by the keystone's kind.
- **Runtime** (`setupPointsOfInterest.ts`): the CRITICAL 'points-of-interest' task (2 Hz) discovers a loaded
  point of interest when the player comes within reach of its keystone (horizontal ≥ 0.8 × radius) - toast,
  `ui.discover` chime, `poi-discovered` event (journal chapter Lost and Found), saved under keyed player data
  `pois` (positions + kinds). The **Delver's Compass** (`delvers_compass`: 2 rune shards + iron bar +
  celestite shard, or lost explorers' chests) points the themed compass plaque (`SigilCompassHud` with
  `DELVERS_THEME`, `HudOrder.DELVERS_COMPASS`) at the nearest undiscovered loaded one. Spider queens' nests
  add a cave spider spawn provider around them.
- **The Cave Drake** (`entities/guardians/cave_drake/`, guardian index 6, registered by `setupPointsOfInterest`):
  every dragon's lair has a guardian altar (`PoiBuilder.guardian`) on the summit of its gold mound - the drake
  sleeps on its hoard and wakes when the player comes within 12 blocks. A box model built at unit scale and
  scaled ×1.45 (`MODEL_SCALE`: ~4 blocks tall, 10 long; hitbox 3 × 3.6 × 3), wings half raised at rest. 600 HP: bite, tail sweep, fire breath
  (a stream of small fireballs, 'fire' damage - fire resistance stops it), wing buffet; below half health a
  roar (ring of fire) and fireballs lobbed down around the player. Loot goes into the reward chest on the
  spent altar (gold, diamonds, an Infernal Heart, a dragon egg, heaped gold, long fire resistance). The old
  dragon's fossil skeleton in front of the hoard is cover from the breath. Journal: Dragonslayer.
- **Blocks** (482-511): ancient bricks (+ mossy, cracked, carved meander frieze), ancient tiles, runestone
  (glowing runes, light 6, drops rune shards), ancient bookshelf (oak plank top), petrified wood, heaped gold
  (hoard mounds), fossil bone (the skeletons; smooth ivory, not the Ossuary's bundled bones, which read as birch
  planks at a distance), barrel (stave sides, lid top - a full block since play feedback asked for a texture),
  sandstone bricks and carved sandstone (glyph frieze, sandstone top) - 15 texture layers; and box-modelled
  decorations (`poi_shared/poiDecorBlocks.ts`, data-driven `PoiDecorBlock`, no layers): treasure hoard, gold coins,
  dragon egg, skull, bedroll, rune pedestal (light 7, drops rune shards), book pile, golden idol, silk cocoon
  (hangs), miner's lantern (light 12), dusty bottles, iron bars (craftable, full-cell collision - decor collision
  boxes don't turn with facing), minecart, telescope, stone bust, tankards. Builders also reuse sarcophagi, urns,
  candles, bone blocks, black ice and entombed figures, forges, the apothecary bench, campfires, giant mushrooms
  and the anvil/weapon rack.
- **Recipes** (`PoiRecipes.ts`): Delver's Compass, runestone (3 shards + stone), ancient bricks from stone and
  their variants, treasure back into gold bars (1 heaped gold → 4 - Ben: "4 gold bars for every 1 heaped gold" -,
  hoard 4, idol 3, 4 coins 1), fossil bone → 4 bone meal, barrel (6 planks + iron bar), iron bars (3 iron → 8),
  sandstone bricks and carved sandstone, and the decorations (minecart, telescope, stone bust, tankards).

### Weather (`src/weather/`, `src/renderer/weather/`)

Ben's asks: "the weather is going to depend on the biome... each biome to have at least 5 distinct weathers... really
awesome"; then, after playing: weather as real weather systems you can see coming in the sky (rain clouds approaching, a
sandstorm approaching), with shapes of their own rather than the biome's square, made of underlying air (wind,
moisture, cloud cover) that each biome shows its own way (high moisture is snow in the snowy biome, high wind is a
sandstorm in the desert), events lasting ~10 minutes, clear the most common, and sleeping bringing new weather. Plus:
squalls needed visible debris to explain the push, and rain splashes slid along with the player (now world-anchored).
Every surface biome has six to nine weathers, each Hell biome a calm and four cavern weathers falling from the ceiling.
61 distinct weathers (87 biome slots: Clear, Overcast, Gale, Drizzle, Rain Shower, Thunderstorm, Meteor Shower and
Calm are shared). Then, after v1.7.0 ("swing for the fences"): the clouds ARE the weather systems - one volumetric
cloud layer built from the same air, moving with it, casting shadows that drift over the land.

| Biome | Weathers (fair → wild) |
|-------|------------------------|
| plains | Clear, Seedfall (day), Mist, Overcast, Gale, Rain Shower, Hailstorm, Thunderstorm |
| grassy-hills | Clear, Meteor Shower (night), Valley Fog, Overcast, Gale, Drizzle, Rain Shower, Thunderstorm |
| desert | Clear, Meteor Shower (night), Heat Wave (day), Dust Devils (day), Overcast, Sandstorm, Cloudburst |
| volcanic | Smoky Haze, Red Haze, Ash Fall, Sulphur Rain, Ember Storm, Volcanic Lightning |
| jungle | Humid, Pollen Bloom (day), Steam Mist, Overcast, Sun Shower (day; Rain Shower at night), Downpour, Monsoon Storm |
| swamp | Murk, Glowmist (night), Swamp Gas, Overcast, Thick Fog, Drizzle, Rain Shower, Thunderstorm |
| pine-forest | Crisp, Aurora (night), Diamond Dust, Freezing Fog, Overcast, Gale, Snowfall, Blizzard (below the snow line: Rain Shower, Thunderstorm) |
| coastal-rainforest | Clear, Glowing Tide (night), Sea Fog, Overcast, Gale, Drizzle, Rain Shower, Squall, Thunderstorm |
| Hell (each) | Calm + Molten Wastes: Heat Surge, Ash Squall, Ember Rain, Firefall; Ossuary: Soul Wisps, Ghost Fog, Bone-Dust Storm, Grave Storm (green lightning); Ember Grove: Crimson Mist, Ember Drift, Spore Bloom, Glowfall; Crystal Abyss: Violet Mist, Resonance, Prism Lights, Crystal Hail; Cocytus: Frost Glitter, Soul Snow, Freezing Fog, Black Blizzard |

- **Weather systems** (`WeatherSystems.ts`, pure: nothing saved): the air everywhere is `WeatherAir` - cloud, precip,
  storm, wind, fog (0-1) and a system's `flavor` - made by weather systems: fair-weather cumulus fields, overcast decks,
  rain belts (some with thunder in their cores), thunderstorms (intense core, wide anvil), squall lines (long, fast,
  across their motion), dry wind storms and slow fog banks (`SYSTEM_TYPES`: shares, radius, aspect, life, levels,
  speed relative to the steering wind). Each sits on a space-time lattice in a frame drifting with the steering wind
  (2000-block cells, 1200 s steps, 3 slots at 0.34): born, grown, carried along (0.85 b/s plus its own speed), faded
  out; shapes are noise-warped ellipses with broad steady cores, rain bands moving through them. Between systems the
  air is clear (a breeze). `collect(t, x, z, radius, list)` gathers the systems alive near a place, `airAt(list, x,
  z)` reads the air from them; `regional(x, z, t, salt)` = drifting patches of fair-weather specials (pollen, heat
  waves, swamp gas...), `nightEvent(day, salt, chance)` = sky nights (meteor showers 30%, auroras 40%...),
  `biomeWarp` = where a weather reads its biome (up to 140 blocks off, so looks change along meandering lines, not a
  region's straight edge). Calibrated with scratchpad `weather/systems.ts` (shares and held-name run lengths per biome),
  `weather/air.ts` (raw air) and `weather/timeline.ts`: fair weather ~55%, wet spells usually 10-30 minutes.
- **Catalog** (`WeatherCatalog.ts`): `WeatherDef` (id - persisted, matched by milestones and creatures: never rename -,
  name, flavour line, `time` (reference), `belowSnowLine`, look) and `BIOME_WEATHER`: per biome its `ids` (fair → wild;
  the first is its fair weather - not announced) and `present(air, ctx, cascade)`, which may weigh the air first (the
  desert dries rain to virga and thins cloud, the swamp thickens fog, the hills and coast catch the wind) and hands out
  the mix with a `WeatherCascade` (most severe rule first, each taking its strength's share of what is left, the fair
  weather the rest - always sums to 1, changes smoothly). Storm cores, then rain, then wind, then fog and cloud, then
  the specials. The same rain belt is a rain shower on the plains, snowfall in the pines, a cloudburst in the desert.
- **Look** (`WeatherLook.ts`): everything a weather does, as blendable numbers - cloud cover/darkness/tint, sky grey and
  tint, sun dim, haze (extinction), ground fog (density + top Y), daylight, sun light, light tint, Hell's floor tint and
  pulse, particle densities per kind, wind, lightning rate + colour, spectacles (aurora, meteors, heat haze, rainbow,
  water glow, dust devils) and hazards (wet, hail, embers, sulphur, cold, gale). Defs give a `WeatherLookSpec` (subset,
  `hazeDistance` in blocks, particles by name). Neutral = no change from the biome atmosphere.
- **Live state** (`WeatherState.ts`): the surface's systems and the Hell cavern's own (seed ^ 0x48e11), collected around
  the player (2600 blocks, again each second or 300 blocks); `mixAt(x, y, z, layer, blend, out, air?)` (blend `'view'`
  = 9 biome readings within 64 blocks, `'wide'` = 5 within 110 (sky map), `'none'` = one (gameplay)); `lookOf(mix,
  out, air)` adds what the air itself does (a cloudier sky under cumulus, the wind as strong as the air's); overrides
  (`forced` - the debug button; `spell` - a Sky Bell raises cloud and rain, or clears the air, within 384 blocks for
  300 s, so each biome shows its own rain); the eased look (4 s), the named weather (8 s hold, and the new one must
  outweigh the old by 0.2, so rain bands don't flicker the name), wetness, after-shower rainbows, wind, forecasts.
- **Weather clock**: weather time = world time (`worldTime`) + `clockOffset`; a clock jump of over 60 s with a
  nightfall/daybreak (sleeping, the night button) adds `SLEEP_WEATHER_JUMP` (2400 s: you wake to new weather). The
  offset is saved; day/night and sky nights read the game clock.
- **Wiring** (`setupWeather.ts`, CRITICAL 'weather' task): sky (`Skybox.setWeather(SkyWeather)` + `setWind`), fog
  (`DistanceFog.setWeatherHaze` - the weather here - `setWeatherField` - read the map far off - and `setGroundFog`),
  light (`weatherAtmosphere`, WeatherAtmosphere.ts: multipliers applied by main.ts's 'skybox' task one frame later -
  daylight, sun light, light tint, the cavern's floor tint/pulse, lightning flash), wind (`setWorldWind`, WindUniform.ts:
  foliage and the weathervane), water glow (`setTideGlow`, LiquidMaterials), particles, lightning, dust devils, Hell's
  prism lights, hazards, the Storm Glass HUD, `weather-changed`/`weather-seen` events (+ a "New weather" toast), keyed
  player data `weather` (v2: seen ids, the bell's spell, the clock offset), the `WeatherHooks` provider, the
  weather-creature spawn provider, and the debug button beside "Make night" (`FpsCounter.setWeatherToggle`: steps
  through the current biome's weathers, then Auto). `WeatherSystem` also has `forceWeather(id | null)` (snaps, no
  easing), `strikeNow(x?, z?)`, `starNow()` and `advanceWeather(seconds)` (as sleeping does) for tests. Hell weathers'
  ground fog `groundFogTop` is height above the cavern floor around the player (floors run Y 30-70+), re-estimated at
  2 Hz while a fog is up; surface ones are world Y.
- **Hooks** (`WeatherHooks.ts`, safe in workers - no-ops until registered): `getWeatherSnapshot()` (sound),
  `weatherAt(x, y, z)` (creatures), `isRainingOn(x, y, z)` (crops grow ×1.6, farmland wets: wet weather + sky light 15),
  `getWeatherForecast(seconds)` (Storm Glass: the systems at that time over the player), `ringSkyBell(x, z)`.
- **Weather you can see coming** (`WeatherSkyMap.ts`, `renderer/weather/WeatherFieldShader.ts`, `renderer/clouds/`): the
  map is 96² cells of 64 blocks around the player (world-anchored, repeat-wrapped, ~3 km each way; 40 cells a frame),
  each the weather there as its biome presents it: texture A = haze extinction, ground fog, storm darkness, cloud cover;
  B = sky tint, greyness; C = the clouds its air makes - amount added to the biome's fair cover, thickness, puffiness,
  a storm's anvil (`writeClouds`: fair cumulus ~130 blocks, cumulus fields taller, overcast decks flat thin sheets,
  rain decks thick and lower, storms towers to ~900 blocks with an anvil spreading over them). The textures are created
  once in WeatherFieldShader and written in place (`SharedDataTexture`s: their `clone()` returns themselves - three
  clones texture uniforms per material).
  - **Volumetric clouds** (`VolumetricClouds.ts`, rendered by the Skybox just before the dome draws, composited on the
    sky pixels): one layer from the cloud base (`WEATHER_CLOUD_BASE`, Y 430; sheets and rain decks hang up to 70
    lower) up to the anvils (Y ~1230), ray-marched through a tileable 3D noise volume (Perlin-Worley shapes eroded by
    Worley detail; 960-block shape tile, squashed vertically for lumpy sides) whose coverage, height profile and
    puffiness come from map C, so every cloud belongs to a weather system - and the noise drifts with the steering wind
    (`SkyWeather.cloudDriftX/Z` = `WeatherSystems.driftAt`), so it travels with it. Lit by the sun (until after sunset:
    it lights the bases from below the horizon) or the moon: three light samples for self-shadowing, Henyey-Greenstein
    silver lining, a soft multiple-scattering term, storm darkness and tint from maps A/B, lightning from inside, aerial
    perspective. Jittered march (up to 72 steps, empty-air striding) blended over the last frame reprojected through
    its view (history dropped on camera jumps, resizes, hidden sky, weather jumps: `Skybox.resetClouds`). Beyond the
    map the biome's fair cumulus continue to the horizon. Skipped underground, in caves and under water.
  - **Cloud shadows**: a 256² map of 8-block cells around the camera (world-anchored), marched each frame through
    each column's own cloud (base to top or anvil, 14 jittered steps, detail and all) toward the light, ×2.6 opacity
    (from straight below, fair cumulus cover only ~15% of the ground - they look denser edge-on); `worldLightShader`'s
    `slopCloudShadow` dims the direct light by it and the sky's a little (slid along the light to each fragment's
    height), fading out past ~850 blocks. Shadows drift over the land with the clouds. A slow 12 km domain warp and
    cover swell (`Cell.warp`) keep the noise's 960-block tile from repeating.
  - **God rays**: a quarter-resolution pass (`GOD_RAY_FRAGMENT`, temporally accumulated) marches each view ray through
    the air below the cloud base, 10 jittered steps through the shadow map (`slopGodRays`, scattering 3.5× the visible
    haze), storing the haze's sunlit share; the land (fog_fragment, from the last frame: the pass renders after the land
    draws) and the sky read it (`slopGodRaysAt` scales it to each pixel's distance; `slopApplyGodRays` takes half the light
    out of the fog's own haze where it sits in cloud shadow - the sky still lights it; at full darkening every view
    under broken cloud read dim - and adds a forward glow toward the sun), and the sun's halo is cut by
    it - shafts of light pouring through gaps in the clouds. All the light uniforms ride in `cloudShadowUniforms` (the
    dome adds them too).
  - **Rain shafts and walls** (`slopWeatherFar`, 12 log-spaced jittered steps on the land, 16 on the sky, to 2000
    blocks): rain and dust from the ground up to the cloud base, with drifting billows, coloured from the horizon
    without the weather (`weatherFieldSky`, set by Skybox) greyed, darkened by the storm, tinted; the first 80 blocks
    are the weather here (`slopWeatherNear`, the fog colour; all of the ray where the map is off: Hell, caves,
    underwater). So a rain belt two kilometres off is a grey curtain falling from its cloud's base; a sandstorm a brown
    wall swallowing the land. Fair-weather haze thins beyond ~600 blocks so it never hides the storms behind it. The
    land (DistanceFog's `fog_fragment`) and the dome read the same rays; land in the edge fog reads as far as the sky
    behind it. **Every fogged material must carry the field's uniforms** (DistanceFog adds them to three's fog
    uniforms; a ShaderMaterial clones `UniformsLib.fog`): a sampler left unset sits on texture unit 0, and WebGL refuses
    to draw when another sampler type (the chunk texture array) is bound there.
- **Particles** (`PrecipitationRenderer.ts`, one instanced draw of 16000 quads + 1800 splashes): `ParticleKinds.ts` is the
  data (23 kinds: colours, size, streak length, fall, wind follow, flutter, alpha, glow, shape streak/flake/sparkle/chip,
  splash; `debris` (torn leaves and twigs), `gust` (faint long streaks along the wind) and `driving` (rain blown
  sideways) make windy weathers readable - squall, gale, monsoon, storms); each particle picks its kind from the live
  mix by seed. A 64-block box around the camera, world-anchored and wrapped; hidden below the `ShelterMap` floor (a
  128² repeat-wrapped float texture of the highest cell weather stops on per column - solid, liquid or leaves, glass
  included - swept from the chunk arrays 2048 columns a frame; in the cavern scanned down from the box top), so nothing
  falls indoors, in caves or under trees. Flakes and chips fade out within ~2 blocks of the eye. Splashes land in a
  world-anchored wrapped tile (they stay where they fell). Dust devils are the 'devil' kind orbiting up to 4 centres
  (`DustDevils.ts`). Fogged like the world.
- **Lightning** (`Lightning.ts` + `LightningRenderer.ts`): strikes at the look's rate within 18-170 blocks, the highest
  of three spots; 3.5% seek an exposed player (6 'fire' + burn within 3 blocks); a lightning rod within 48 blocks
  catches it (`LightningRods.ts`, fed by the rod's block entity); a strike chars a log (charred log) or fuses sand into
  fulgurite. Far flashes in the storm's clouds and from storms on the horizon (the map's darkness) emit
  `lightning-flash`. Bolts: jagged branching ribbons with a white core, flickering restrikes. Meteor showers drop
  falling stars (~0.7/min) that land as STAR_FRAGMENT blocks (light 10, stardust).
- **Hazards** (`WeatherHazards.ts`, only under open sky - the shelter map): rain douses burning, hail 1 per 5 s, embers
  may ignite, sulphur rain poisons after 6 s, freezing weather frostbites after 12 s (effects re-applied only as they run
  out - every apply emits `effect-applied` and a sound), a gale pushes (never into a wall) - only named windy weathers
  push, and each has debris or sand in the air to show the wind.
- **Weather creatures** (`entities/weather/`, `WeatherRetreat` in WeatherCreature.ts - they leave when the weather where
  they stand is none of theirs): Thunderhead (`thunderhead`, storms: hovers, telegraphed strikes - a roof stops them,
  sinks drained after each; storm essence), Dune Dervish (`dune_dervish`, sandstorm/dust devils: rushes and flings,
  shrugs off hits while spinning fast; whirlstone), Whiteout Stalker (`whiteout_stalker`, blizzard: circles, pounces,
  Frostbite; whiteout pelt - hide), Marsh Wisp (`marsh_wisp`, glowmist/thick fog: keeps away, homing flares, blinks;
  wisp light). At most 4 alive.
- **Blocks and items**: lightning rod (3 copper), weathervane (turns into the wind: arrow part rotated in its shader by
  `windUniform`), fulgurite (lightning on sand; smelts to 2 glass), star fragment, star lantern (4 stardust + glass + iron);
  Storm Glass (3 glass + copper + herb: HUD with the weather now and the forecast at +2/+5 min), Sky Bell (2 gold +
  storm essence + fulgurite: hold to call rain or clear the sky, 300 s cooldown), swiftness potion (whirlstone + herb:
  new `swiftness` effect, walk ×1.3), wisp light + herb → ember sight.
- Insects (fireflies, butterflies) scale by `calmWeather()`; sound reads the snapshot (weather beds, thunder - see
  `src/audio/`); journal chapter Under the Weather.

### `src/audio/` - Sound (effects, ambience, music)

Every sound is procedural: recipes in `synth/` render samples in `AudioSynthWorker` at startup or
first use - there are no audio files. The mix is deliberately quiet (a layer under the game, never
on top of it): keep new sounds at or below comparable existing ones. Voicing rules from play
feedback: block sounds stay out of the bass (breaks crumble, high-passed at 170 Hz, 24 dB/oct);
struck materials (wood, bone, armour, crystal) use many short random modes (`addDenseModes`) so
they knock instead of ringing at one pitch - a clean tuned partial reads as "bing/bong"; the
player's hurt is a voiced cry, not a thump.

- `setupAudio.ts` - wiring, called last in main.ts's wiring block: engine, bank, music, ambience,
  `PlayerSoundTracker`; the gameEvents listeners (block mined/placed, `entity-hit`, `player-hurt`,
  `item-picked-up`, crafts, consumes, effects, dungeon/guardian moments); the CRITICAL 'audio' task
  (listener from the camera every frame; muffle/reverb/ambience 4 Hz; music 2 Hz; castle probe
  1 Hz; creature idle calls polled at 2 Hz, ≥ 2.5 s apart, ≤ 24 blocks, guardians only while engaged)
- `AudioEngine.ts` - ONE AudioContext (suspended until the first gesture and while the tab is
  hidden); buses sfx / ui / ambience / music with the user's volumes (slider² curve); underwater
  muffle (low-pass on sfx + ambience); environment reverb send (open air 0.05 → cavern ~0.4); music
  hall reverb; a gentle master limiter. A ConvolverNode impulse must be rendered at the context's
  sample rate
- `SoundLibrary.ts` - THE mix: sound id → recipe, variants, bus, `loudness` (target short-term dBFS
  before the buses, `measureLoudnessDb`), pitch/level jitter, `maxVoices`, `minInterval` (volleys,
  cascades), positional `ref`/`range`, `preload`. Every rendered variant is gain-corrected to its
  target (and capped at 15 dB peak over it, so bass thumps never eat headroom), so levels live
  here, never in recipes. Reference: footstep -35, mining hit -30, break -26, melee impact -26, UI
  tick -34/-35, player hurt -22, explosion -19. Music sits around -38 dBFS RMS at its default
  volume. Ids: named (`ui.open`, `hit.armor`, `proj.fire`...),
  `block.<material>.<hit|break|place|step>`, `voice.<archetype>.<hurt|death|idle>`
- `SoundBank.ts` - buffers (effects at 32 kHz) and playback: variant rotation, jitter, voice caps
  (48 total), spatialization computed when a sound starts (full level within `ref`, inverse
  distance, faded to silence at `range`, stereo pan capped at 0.75, low-pass beyond 14 blocks). A
  sound not rendered yet renders URGENT and plays if it lands within 150 ms
- `SoundHooks.ts` - the hook game code calls for feedback only audio needs: `playSound(id, pos?)`,
  `playBlockSound(blockId, action, pos)`, `playEntitySound(type, kind, pos)`, `playBlockUiSound`;
  a no-op until setupAudio registers (workers, tests), so block classes may call it. Gameplay facts
  go on gameEvents instead
- `BlockSoundMaterials.ts` - block → one of 15 materials (stone, wood, soil, grass, sand, gravel,
  snow, leaves, glass, crystal, metal, ice, bone, soft, cloth) from name keywords, then tags, with an
  override table: a new block needs nothing unless it sounds wrong
- `EntityVoices.ts` - entity type → voice archetype (`synth/creatureVoices.ts`) + pitch, idle
  interval, boss flag, and `hit` / `shield` material: a melee hit plays `hit.<material>` (flesh,
  bone, armor, shield, crystal, ghost, soft, shell, wood, ice, stone - what the blow lands on) plus
  the creature's `hurt` reaction; a blocked hit (`IEntity.lastHitBlocked`, set by shielded knights,
  the crystal sentinel and warded/armoured guardians while handling the hit) plays its `shield`
  material and no cry. A type missing here is silent (hits sound as flesh). An archetype's voices
  render when such an entity first enters the world (EntityManager callback). An entity whose
  `isQuiet` is true (a disguised mantis) makes no idle calls
- `PlayerSoundTracker.ts` - polled player sounds: footsteps (stride 2.2 + 0.1·speed blocks, material
  underfoot, corners probed at edges), jump, landing (impact > 4 b/s; the heavy thud only when
  `calculateFallDamage` > 0 and not onto slime), ladders,
  splash/swim/lava, eat/drink cadence, Return Idol channel (cut on cancel), hotbar tick, respawn chime
- `AmbienceController.ts` - looping beds (22.05 kHz, -31 dBFS at weight 1) crossfaded by
  environment: surface wind (sky light × altitude, calmer at night) vs cave hollowness, the night's
  cricket chorus (per-biome weight × `worldClock.nightAmount`), a bed mix per Hell biome,
  underwater; sparse positioned details (birds by day and owls at night in vegetated biomes, swamp
  frogs - more often after dark, cave drips, lava pops, bone chimes, spore puffs, crystal pings, ice
  creaks); weather beds from `getWeatherSnapshot()` (`weatherBedWeights`: rain light/heavy, drizzle, hail,
  gale, sandstorm, blizzard, embers, shimmer, aurora, and rain on the roof while sheltered - weights ×
  shelter; birds stop and crickets hush in wet weather). Thunder (`weather.thunder.near/far`, delayed
  distance / 90 s), `weather.zap`, meteor whoosh/impact and `weather.skybell` from the weather events
  (`synth/weatherSounds.ts`)
- `music/` - generative score, mostly silence. `MusicMoods.ts` (22 moods, at least two per place
  with different instruments: meadow / drift / dusk / wander / canopy / mirage on the surface,
  cave / deep, two per Hell biome, dungeon / vigil, boss / onslaught - scale, tempo, progressions,
  instruments, pad, pacing), `Composer.ts` (pure + seeded: a 1-2 span pad intro, up to three motifs
  in a seeded form (AB, AABA, ABAC...) re-anchored to each chord, harmony styles incl. a 3/4 waltz,
  sometimes a phrase in thirds, pulses, a tonic ending), `MusicPlayer.ts` (struck notes from samples
  rendered every 3 semitones at 24 kHz, pads/drones as live oscillators, 1.6 s lookahead; monophonic
  winds cut their previous note; any BaseAudioContext, so a piece renders offline),
  `MusicDirector.ts` (each place's mood pool - surface weighted by biome, and at night toward
  drift/dusk - with the last pick 4× less likely; first piece 20-40 s in, then the mood's rest; a family change - surface ↔ a Hell
  biome - fades out; castle mood within 56 blocks of an anchor; boss mood at once while a guardian
  within 48 blocks is engaged; death silences it). A new mood goes into its place's pool and is
  level-matched to its siblings (render a minute offline: the pairs sit within ~1 dB RMS)
- `synth/` - pure DSP (`dsp.ts`: seeded noise, biquads, modal resonators, dense random modes,
  grains, envelopes) and
  recipes: `blockSounds.ts`, `sfxRecipes.ts`, `creatureVoices.ts`, `instruments.ts` (notes for piano, pluck,
  bell, guitar, harp, rhodes, vibes, music box, handpan, ocarina and five unpitched percussion
  voices, plus reverb impulses), `ambience.ts`; `recipes.ts` maps ids → renderers and measures loudness. They run in
  Node (`node --experimental-transform-types`) for analysis
- `AudioSettings.ts` - master / music / effects / ambience 0-100 (defaults 100 / 60 / 100 / 60),
  `localStorage['slopmine:audioSettings']`, the pause menu's Audio page

**A new sound:** recipe in `synth/` + entry in `SOUND_DEFS`, triggered by a gameEvents listener in
setupAudio (gameplay facts) or a SoundHooks call (feedback only audio cares about). A new mob: an
`EntityVoices` entry. A new block that sounds wrong: a keyword or override in BlockSoundMaterials.

### `src/ui/` - User Interface

DOM-based overlays rendered above the WebGL canvas.

**Key Files:**
- `hudLayout.ts` - Shared HUD anchors: fixed, UI-scaled *slots* that HUD elements mount into
  (`mountHudElement(el, slot, HudOrder.X)`) instead of positioning themselves - top-left (journal
  goal line, then effect badges), top-centre (boss bar, then Sigil Compass; 440 px, narrower on
  small windows so the side columns keep 220 px), top-right (toasts), bottom-centre (hearts +
  armor row, action-bar messages above). The debug overlay registers its rects as obstacles
  (`setHudObstacle`) and the top columns flow below them. New HUD elements mount into a slot too
  (a self-positioned fixed element is how the old journal/effects/boss-bar/toast collisions began)
- `Toolbar.ts` - Bottom hotbar (10 slots)
- `Inventory.ts` - Grid inventory overlay (10×8); the panel (plus crafting / recipe book / block
  UI beside it) is centred above the raised toolbar and zoomed down to fit small windows
- `CraftingPanel.ts` - 3×2 crafting grid + recipe list
- `FpsCounter.ts` - Performance stats overlay (incl. light queue and the `LOD:` far-terrain line,
  the clock) and the day/night debug button above it (clickable with the inventory or pause menu open)
- `SettingsMenu.ts` - Pause menu with settings pages (Render Distance, Far Terrain, Texture Filtering, shadows, ...)
- `LoadingScreen.ts` - World generation progress
- `Crosshair.ts` - Center screen crosshair
- `DragDropHandler.ts` - Inventory drag-drop system
- `SlotRenderer.ts` - Item icon/count rendering
- `DebugManager.ts` - Debug mode cycling (Ctrl+Shift+P)
- `blockui/` - Block-specific UIs (ForgeUI, WoodworkingBenchUI; the HellforgeUI lives in `src/hellforge/`)
- `Toasts.ts` - `showToast({ caption?, title, body?, accent?, iconUrl?, durationMs? })`: queued
  notifications in the top-right slot (journal, chapter completion)
- `PlayerNotice.ts` / `HudMessage.ts` - One-line action-bar messages above the hearts
  (`showPlayerNotice(text)`: "Equipped ...", refusals; HudMessage: Return Idol status)
- `BossBar.ts` - Boss name + health with phase notches (`BossBarTarget`); `SigilCompassHud.ts` - compass plaque
- `StatusEffectHUD.ts` / `EffectVignette.ts` - Effect badges (debuffs first, timer blinks under 10 s);
  frost rim and poison pulse
- `EquipmentPanel.ts` / `ArmorDisplay.ts` - Armor slots beside the inventory grid; armor row above the hearts
- `ReturnIdolOverlay.ts` - Channel glow/ring and the teleport veil
- `VirtualCursor.ts` - The in-game mouse of the inventory, block UIs and journal (see Pointer and menus below)

**Pointer and menus** (Ben: releasing and re-taking the browser's pointer lock for every menu now and then
left it in the wrong state - the mouse escaping the window - and the free mouse selected page text):
- The canvas keeps pointer lock the whole time the game is played; `player/PointerMode.ts` tracks it and the open
  cursor menus. A menu calls `openCursorMenu(id)` / `closeCursorMenu(id)` instead of exiting or requesting the
  lock, and closes itself when the lock is lost (Esc, leaving the window) - the pause menu then opens, the ONLY
  screen with the real mouse (`SettingsInput`: lock lost = pause menu, always).
- Gameplay input asks `hasGameplayPointer()` (locked AND no cursor menu), never `document.pointerLockElement`
  alone; things that must stop when a menu opens (held mining, eating, hoeing) listen to `onPointerModeChange`.
- `ui/VirtualCursor.ts` draws a pixel-art arrow moved by the real mouse's movement while a cursor menu is up,
  stops every real (trusted) mouse event at the window, and dispatches synthetic ones at the cursor - mousemove,
  mouseover/out, mouseenter/leave, mousedown/up, click (on the innermost element holding press and release),
  wheel, with the real modifier keys - so menu code uses ordinary listeners with `clientX`/`clientY` and
  `elementFromPoint`. It also does what browsers don't do for synthetic events: focuses a clicked text field,
  scrolls the scrollable box under the wheel, and shows `title` tooltips. No `:hover` CSS (synthetic events never
  set it) - hover styling goes through mouseenter/mouseleave, as all the UI already does. The camera ignores
  untrusted mousemoves. The page has `user-select: none` (index.html).
- The cursor's shape shows what a click would do (Ben's ask): arrow, pointing hand, open hand, fist, swap arrows,
  I-beam (pixel art in `SHAPES`, drop shadow baked in, snapped to whole device pixels). A provider registered with
  `addCursorShapeProvider` decides first - DragDropHandler's while enabled: a fist while dragging, over an item swap
  arrows when a click would move it elsewhere (Ctrl, or Shift into/out of worn armor), else an open hand - then the
  element's CSS `cursor` (`pointer` = the hand: give new clickable things `cursor: pointer`; text fields = I-beam),
  else the arrow. Re-evaluated every frame and on modifier keys, so pressing Ctrl changes it without a move.
- The cursor moves once per rendered frame (the OS cursor is drawn by the hardware): at a high frame rate it is
  close to the OS feel; a framerate cap below the display rate makes it visibly steppier.

**Z-Index Layers** (`HudZ` in hudLayout.ts for the HUD slots):
- 25: Toolbar (normal)
- 26: Hearts, armor row, action-bar messages (bottom-centre slot)
- 30: Crosshair, FPS counter, top HUD columns (journal line, effects, boss bar, compass)
- 34: Toasts (above the HUD, under open panels - never cover the crafting grid)
- 35: Inventory overlay
- 40: Toolbar (raised during inventory), pause menu
- 41: Day/night debug button (above the inventory and pause backdrops, so it can be clicked)
- 45: Journal book
- 1000: Loading screen, drag ghost
- top (2147483646-7): the virtual cursor and its `title` tooltip

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
| foliageDetail | string | 'full' | Plants: full, near (view distances ×0.55 - much less overdraw), off; applied live via `setFoliageDetail` (FoliageRenderer) |
| cloudQuality | string | 'fancy' | Clouds: fancy (half resolution, 72 steps), fast (a third, 44 steps); applied live via `setCloudQuality` (VolumetricClouds) |

**Persistence:** Auto-saves to `localStorage['slopmine:graphicsSettings']` on every change.

Volumes are `AudioSettings` (`src/audio/`, `localStorage['slopmine:audioSettings']`), edited on the
pause menu's Audio page (`audioSettings` option of `createSettingsMenuUI`).

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

Workers that import the block registry or biomes (generation, LOD, liquid physics: ~800-950
modules each) start through `whenWorkerLoadSlotFree()` (`src/workers/WorkerLoadGate.ts`) and call
its `loaded` callback on 'worker-ready' or error: under `vite dev` each fetches its graph as separate
requests, and a dozen loading at once exceeded Chromium's outstanding-request limit
(`net::ERR_INSUFFICIENT_RESOURCES` - the worker dies with a message-less `error` event). Dev loads
2 at a time; production is unthrottled. A new heavy worker pool should use it too.

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
- Gameplay systems: `src/<system>/setup<System>.ts`, called once from main.ts's wiring block

### Patterns

- Use ES modules
- Prefer functional patterns where practical
- Keep files focused and small
- Export types/interfaces for module boundaries
- Use async/await for asynchronous operations (especially in workers)
- Transfer ArrayBuffer ownership between main thread and workers for zero-copy performance
- Data classes (items, mobs) that need a runtime system call a small hook module the system
  registers itself with at startup (`ReturnIdolHooks`, `CrystalEntityHooks`, `DungeonServices`, `SoundHooks`) -
  every use tolerates the hook being unset (tests, workers)

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
