import { GameLoop } from './core/GameLoop.ts'
import { TaskScheduler } from './core/TaskScheduler.ts'
import { TaskPriority } from './core/interfaces/ITask.ts'
import { BudgetAwareTask } from './core/BudgetAwareTask.ts'
import { Renderer } from './renderer/Renderer.ts'
import { SubChunkOpacityCache } from './renderer/SubChunkOpacityCache.ts'
import { WorldLighting } from './renderer/WorldLighting.ts'
import { Skybox } from './renderer/skybox/Skybox.ts'
import { BiomeSkyboxManager } from './renderer/skybox/BiomeSkyboxManager.ts'
import { HeldItemRenderer } from './renderer/helditem/index.ts'
import { LiquidOverlay } from './renderer/LiquidOverlay.ts'
import {
	  FirstPersonCameraControls,
	} from './player/FirstPersonCameraControls.ts'
import { PlayerState } from './player/PlayerState.ts'
import { ToolbarInputHandler } from './player/ToolbarInput.ts'
import { InventoryInputHandler } from './player/InventoryInput.ts'
import { SettingsInputHandler } from './player/SettingsInput.ts'
import { BlockInteraction } from './player/BlockInteraction.ts'
import { BlockPlacement } from './player/BlockPlacement.ts'
import { ItemConsumption } from './player/ItemConsumption.ts'
import { createCrosshairUI } from './ui/Crosshair.ts'
import { createToolbarUI } from './ui/Toolbar.ts'
import { createInventoryUI } from './ui/Inventory.ts'
import { createSettingsMenuUI } from './ui/SettingsMenu.ts'
import { createFpsCounterUI } from './ui/FpsCounter.ts'
import { createLoadingScreenUI } from './ui/LoadingScreen.ts'
import { createDeathScreenUI } from './ui/DeathScreen.ts'
import { ChunkWireframeManager } from './renderer/ChunkWireframeManager.ts'
import { DebugManager } from './ui/DebugManager.ts'
import {
  WorldManager,
  registerDefaultBlocks,
} from './world/index.ts'
import { registerDefaultRecipes } from './crafting/index.ts'
import { WorldGenerator } from './world/generate/index.ts'
import { biomeRegistry, BIOME_REGION_SIZE } from './world/generate/biomes/BiomeRegistry.ts'
import { LAYER_BOUNDARY_Y } from './world/generate/GenerationConfig.ts'
import { GraphicsSettings } from './settings/index.ts'
import * as THREE from 'three'
import {
  PhysicsEngine,
  PhysicsBody,
  WorldPhysicsAdapter,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_DEPTH,
  EYE_HEIGHT,
} from './physics/index.ts'
import {
  DiamondPickaxeItem,
  DiamondShovelItem,
  DiamondAxeItem,
} from './items/tools/index.ts'
import { BlockTickManager } from './world/blockstate/BlockTickManager.ts'
import { setForgeBlockTickManager } from './world/blocks/types/forge/ForgeBlock.ts'
import { setApothecaryWorkbenchBlockTickManager } from './world/blocks/types/apothecary_workbench/ApothecaryWorkbenchBlock.ts'
import { setWoodworkingBenchBlockTickManager } from './world/blocks/types/woodworking_bench/WoodworkingBenchBlock.ts'
import { blockUIRegistry, blockActionRegistry, createForgeUI, createApothecaryWorkbenchUI, createWoodworkingBenchUI, createChestUI, createShelfUI } from './ui/blockui/index.ts'
import type { ShelfBlockState } from './world/blocks/types/shelf_shared/ShelfBlockState.ts'
import { DOOR_TOGGLE_PAIRS, toggleDoor } from './world/blocks/types/door_shared/DoorToggle.ts'
import { harvestBerryBush } from './world/blocks/types/berry_bush_berries/BerryBushLadenBlock.ts'
import { collectResin } from './world/blocks/types/resin_tap/ResinTapBlock.ts'
import { GATE_TOGGLE_PAIRS, toggleFenceGate } from './world/blocks/types/fence_gate_shared/FenceGateToggle.ts'
import { TRAPDOOR_TOGGLE_PAIRS, toggleTrapdoor } from './world/blocks/types/trapdoor_shared/TrapdoorToggle.ts'
import { BlockIds } from './world/blocks/BlockIds.ts'
import { BlockInteractionHandler } from './player/BlockInteractionHandler.ts'
import { BlockRaycaster } from './player/BlockRaycaster.ts'
import type { ForgeBlockState } from './world/blocks/types/forge/ForgeBlockState.ts'
import type { ApothecaryWorkbenchState } from './world/blocks/types/apothecary_workbench/ApothecaryWorkbenchState.ts'
import type { WoodworkingBenchState } from './world/blocks/types/woodworking_bench/WoodworkingBenchState.ts'
import type { ChestBlockState } from './world/blocks/types/chest/ChestBlockState.ts'
import { recipeBook } from './crafting/RecipeBook.ts'
import {
  PersistenceManager,
  initializeItemRegistry,
  serializeInventory,
  deserializeInventory,
  setGlobalPersistenceManager,
} from './persistence/index.ts'
import { BlockStateManager } from './world/blockstate/BlockStateManager.ts'
import { getBlockStatesToPersist } from './persistence/BlockStateSerializer.ts'
import { PlayerHealth } from './player/PlayerHealth.ts'
import { FallDamageTracker } from './player/FallDamageTracker.ts'
import { createHealthDisplayUI } from './ui/HealthDisplay.ts'
import { BlockIconGenerator } from './renderer/BlockIconGenerator.ts'
import { EntityManager, EntitySpawner, DroppedItemEntity } from './entities/index.ts'
import type { IItem } from './items/Item.ts'
import { FloatingTextManager } from './ui/floating-text/index.ts'
import { DiviningParticleManager } from './renderer/particles/DiviningParticleManager.ts'
import { MagmaSlimeEntity } from './entities/animals/magma_slime/index.ts'
import { PlayerDamageHandler } from './entities/PlayerDamageHandler.ts'

// Initialize world system
registerDefaultBlocks()
registerDefaultRecipes()

// Initialize item registry for persistence deserialization
initializeItemRegistry()

// Initialize block tick manager (for forge smelting, etc.)
const blockTickManager = new BlockTickManager()
setForgeBlockTickManager(blockTickManager)
setApothecaryWorkbenchBlockTickManager(blockTickManager)
setWoodworkingBenchBlockTickManager(blockTickManager)

// Register block UI for forge
blockUIRegistry.register(BlockIds.FORGE, (state) => createForgeUI(state as ForgeBlockState))

// Register block UI for apothecary workbench
blockUIRegistry.register(BlockIds.APOTHECARY_WORKBENCH, (state) => createApothecaryWorkbenchUI(state as ApothecaryWorkbenchState))

// Register block UI for woodworking bench (needs playerState: results and
// leftover ingredients go straight to the player inventory)
blockUIRegistry.register(BlockIds.WOODWORKING_BENCH, (state) => createWoodworkingBenchUI(state as WoodworkingBenchState, playerState))

// Register block UI for chest
blockUIRegistry.register(BlockIds.CHEST, (state) => createChestUI(state as ChestBlockState))

// Register shelf UI for all three wood variants (shared state/UI implementation)
for (const shelfId of [BlockIds.OAK_SHELF, BlockIds.PINE_SHELF, BlockIds.REDWOOD_SHELF]) {
  blockUIRegistry.register(shelfId, (state) => createShelfUI(state as ShelfBlockState))
}



// Biome mini-map helpers
function getBiomeAbbreviation(biomeType: string): string {
  return biomeType.substring(0, 3).toUpperCase()
}

function calculateBiomeMiniMap(worldX: number, worldY: number, worldZ: number, seed: number): string[][] {
  const chunkX = Math.floor(worldX / 32)
  const chunkZ = Math.floor(worldZ / 32)
  const { regionX, regionZ } = biomeRegistry.getRegionCoords(chunkX, chunkZ)

  // Determine which layer the player is in (0 = underground, 1 = surface)
  const layer: 0 | 1 = worldY < LAYER_BOUNDARY_Y ? 0 : 1

  // 5x5 grid with player's region at center [2][2]
  const grid: string[][] = []
  for (let dz = -2; dz <= 2; dz++) {
    const row: string[] = []
    for (let dx = -2; dx <= 2; dx++) {
      const biome = biomeRegistry.selectBiomeForLayer(regionX + dx, regionZ + dz, seed, layer)
      row.push(getBiomeAbbreviation(biome))
    }
    grid.push(row)
  }
  return grid
}

const renderer = new Renderer()

// Graphics settings (persisted to localStorage)
const graphicsSettings = new GraphicsSettings()
renderer.setGraphicsSettings(graphicsSettings)

// Player state (including toolbar/inventory)
const playerState = new PlayerState(10)

// Player health system (20 hearts = 40 HP)
const playerHealth = new PlayerHealth({ maxHealth: 40 })
const fallDamageTracker = new FallDamageTracker()

// Give player diamond tools in dev mode
if (import.meta.env.DEV) {
  playerState.addItem(new DiamondPickaxeItem())
  playerState.addItem(new DiamondAxeItem())
  playerState.addItem(new DiamondShovelItem())
}

// Loading screen (shown until initial chunks are generated)
const loadingScreen = createLoadingScreenUI()
let isLoading = true
let requiredChunks = 64 // Will be recalculated based on chunkDistance

// UI overlays (crosshair + hotbar + FPS counter) rendered above the canvas
const crosshair = createCrosshairUI()
crosshair.element.style.display = 'none' // Hidden during loading
const fpsCounter = createFpsCounterUI()
fpsCounter.element.style.display = 'none' // Hidden during loading

const toolbarUI = createToolbarUI(undefined, {
	  slotCount: playerState.inventory.toolbar.size,
})
toolbarUI.root.style.display = 'none' // Hidden during loading

const inventoryUI = createInventoryUI(undefined, {
  columns: playerState.inventory.inventory.width,
  rows: playerState.inventory.inventory.height,
})

// Health display UI (hearts above hotbar)
const healthDisplay = createHealthDisplayUI()
healthDisplay.root.style.display = 'none' // Hidden during loading

// Death screen UI (Dark Souls style "YOU DIED")
const deathScreen = createDeathScreenUI()

// Wire health system callbacks
playerHealth.setOnHealthChanged((current, max) => {
  healthDisplay.updateHealth(current, max)
})

// First-person camera controls
const cameraControls = new FirstPersonCameraControls(
	  renderer.camera,
	  renderer.renderer.domElement,
	  {
	    movementSpeed: 8,
	    lookSensitivity: 0.002,
	  }
	)

// Toolbar input (mouse wheel + 1-9,0) while pointer lock is active
const toolbarInput = new ToolbarInputHandler(
	  playerState.inventory.toolbar,
	  toolbarUI,
	  renderer.renderer.domElement,
	)

const inventoryInput = new InventoryInputHandler(
  renderer.renderer.domElement,
  inventoryUI,
  playerState.inventory.inventory,
  toolbarUI,
  playerState.inventory.toolbar,
  cameraControls,
  playerState,
)

// Initial toolbar sync to render any items that exist at startup
toolbarUI.syncFromState(playerState.inventory.toolbar.slots)

// Create world with terrain generation
const world = new WorldManager()
const worldGenerator = new WorldGenerator(world)

// Initialize texture atlas for reduced draw calls (must complete before mesh rendering)
await world.initializeAtlas()

// Wait for at least one generation worker to be ready before starting chunk generation
await world.waitForGenerationWorkerReady()
console.log('[main] Generation worker ready, starting chunk loading')

// Generate block icons for UI after textures are loaded
BlockIconGenerator.getInstance().generateAllIcons(renderer.renderer)

// Build recipe book index after all recipes are registered and icons are generated
recipeBook.buildIndex()

// Refresh recipe book UI now that the index is built
inventoryInput.recipeBookUI.refresh()

// Create persistence manager and initialize asynchronously
const persistenceManager = new PersistenceManager()

// Set global persistence manager for block state deletion
setGlobalPersistenceManager(persistenceManager)

// Connect persistence to world systems
world.setPersistenceManager(persistenceManager)
worldGenerator.setPersistenceManager(persistenceManager)

// Initialize persistence and load saved data (async)
persistenceManager.initialize().then(async () => {
  // Request persistent storage from main thread (more reliable than from worker)
  let persisted = false
  if (navigator.storage?.persist) {
    persisted = await navigator.storage.persist()
  }
  console.log(`Storage persistence: ${persisted ? 'granted' : 'best-effort'}`)

  // Load saved inventory if exists
  const savedInventory = await persistenceManager.loadInventory()
  if (savedInventory) {
    deserializeInventory(
      savedInventory,
      playerState.inventory.toolbar,
      playerState.inventory.inventory
    )
    toolbarUI.syncFromState(playerState.inventory.toolbar.slots)
    console.log('Loaded saved inventory')
  }

  // Load saved player position and spawn points
  const savedMetadata = await persistenceManager.loadMetadata()
  if (savedMetadata?.playerPosition) {
    const pos = savedMetadata.playerPosition
    // Add Y offset to prevent player spawning stuck in ground
    const spawnY = pos.y + 0.5
    playerBody.position.set(pos.x, spawnY, pos.z)
    renderer.camera.position.set(pos.x, spawnY + EYE_HEIGHT, pos.z)
    console.log(`Loaded saved position: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`)
  }

  // Load saved bed spawn point if exists
  if (savedMetadata?.bedSpawnPoint) {
    const sp = savedMetadata.bedSpawnPoint
    setBedSpawnPoint(sp.x, sp.y, sp.z)
    console.log(`Loaded bed spawn point: ${sp.x.toFixed(1)}, ${sp.y.toFixed(1)}, ${sp.z.toFixed(1)}`)
  }

  // Load saved player health if exists
  if (savedMetadata?.playerHealth !== undefined) {
    playerHealth.setHealth(savedMetadata.playerHealth)
    console.log(`Loaded saved health: ${savedMetadata.playerHealth}`)
  }

  // Start auto-save (every 5 minutes)
  persistenceManager.startAutoSave(() => ({
    inventory: serializeInventory(playerState.inventory),
    chunkProvider: world,
    playerPosition: {
      x: playerBody.position.x,
      y: playerBody.position.y,
      z: playerBody.position.z,
    },
    playerHealth: playerHealth.currentHealth,
    originalSpawnPoint: { x: originalSpawnPoint.x, y: originalSpawnPoint.y, z: originalSpawnPoint.z },
    bedSpawnPoint: bedSpawnPoint ? { x: bedSpawnPoint.x, y: bedSpawnPoint.y, z: bedSpawnPoint.z } : undefined,
    blockStates: getBlockStatesToPersist(BlockStateManager.getInstance().getAllStates(), world),
  }))
}).catch((error) => {
  console.error('Failed to initialize persistence:', error)
})

// Flag to skip save on unload when starting new game
let skipSaveOnUnload = false

// Safety save on page unload
window.addEventListener('beforeunload', () => {
  if (skipSaveOnUnload) return
  persistenceManager.saveBeforeUnload(
    serializeInventory(playerState.inventory),
    world,
    {
      x: playerBody.position.x,
      y: playerBody.position.y,
      z: playerBody.position.z,
    },
    playerHealth.currentHealth,
    { x: originalSpawnPoint.x, y: originalSpawnPoint.y, z: originalSpawnPoint.z },
    bedSpawnPoint ? { x: bedSpawnPoint.x, y: bedSpawnPoint.y, z: bedSpawnPoint.z } : undefined,
    getBlockStatesToPersist(BlockStateManager.getInstance().getAllStates(), world)
  )
})

// Calculate required chunks for loading (25% of total chunks for current distance)
const chunkDistance = worldGenerator.getConfig().chunkDistance
const totalChunks = (2 * chunkDistance + 1) ** 2
requiredChunks = Math.floor(totalChunks * 0.25)

// Settings menu UI (settingsInput is created later after gameLoop)
const settingsUI = createSettingsMenuUI(worldGenerator.getConfig(), graphicsSettings, document.body, {
  onResume: () => {
    // Request pointer lock to resume game - this triggers the pointerLockChange
    // handler which will close the settings menu
    renderer.renderer.domElement.requestPointerLock()
  },
  onChunkDistanceChange: () => {
    // Apply new render distance immediately
    worldGenerator.refreshChunks()
  },
  onResolutionChange: (preset) => {
    // Apply new resolution immediately
    renderer.setResolution(preset)
  },
  onFramerateLimitChange: (limit) => {
    // Apply new framerate limit immediately
    gameLoop.setTargetFps(limit)
  },
  onShadowsEnabledChange: (enabled) => {
    // Apply shadow toggle to both renderer and lighting
    renderer.setShadowsEnabled(enabled)
    lighting.setShadowsEnabled(enabled)
  },
  onShadowMapSizeChange: (size) => {
    // Apply new shadow map size
    lighting.setShadowMapSize(size)
  },
  onSave: async () => {
    // Manual save triggered from pause menu
    await persistenceManager.saveAll(
      serializeInventory(playerState.inventory),
      world,
      {
        x: playerBody.position.x,
        y: playerBody.position.y,
        z: playerBody.position.z,
      },
      playerHealth.currentHealth,
      { x: originalSpawnPoint.x, y: originalSpawnPoint.y, z: originalSpawnPoint.z },
      bedSpawnPoint ? { x: bedSpawnPoint.x, y: bedSpawnPoint.y, z: bedSpawnPoint.z } : undefined,
      getBlockStatesToPersist(BlockStateManager.getInstance().getAllStates(), world)
    )
  },
  onNewGame: async () => {
    // Clear all saved data and generate new seed for fresh start
    await persistenceManager.clearAll()
    worldGenerator.getConfig().regenerateSeed()
    // Skip beforeunload save to prevent re-saving cleared data
    skipSaveOnUnload = true
    window.location.reload()
  },
})

const seaLevel = worldGenerator.getConfig().seaLevel

// Create physics system
const physicsWorld = new WorldPhysicsAdapter(world)
const physicsEngine = new PhysicsEngine(physicsWorld)

/**
 * Find a spawn position in a biome that has wood (not desert or volcanic).
 * Searches in a spiral pattern from the default region (0,0) outward.
 * Returns world coordinates at the center of the suitable biome region.
 */
function findSuitableSpawnPosition(seed: number, seaLevelY: number): THREE.Vector3 {
  // Biomes without wood - players should not spawn in these
  const hostileBiomes: Set<string> = new Set(['desert', 'volcanic'])

  // Check the default region (0, 0) first
  const defaultBiome = biomeRegistry.selectBiomeForLayer(0, 0, seed, 1)
  if (!hostileBiomes.has(defaultBiome)) {
    // Default spawn is fine - center of region (0,0)
    return new THREE.Vector3(256, seaLevelY + 20, 256)
  }

  // Search outward in a spiral for a suitable biome region
  const maxSearchRadius = 8
  for (let r = 1; r <= maxSearchRadius; r++) {
    // Check all region coords at distance r (square spiral)
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        // Only check the perimeter of the square at this radius
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue

        const biome = biomeRegistry.selectBiomeForLayer(dx, dz, seed, 1)
        if (!hostileBiomes.has(biome)) {
          // Found a suitable biome - spawn at the center of this region
          // Region center in world coords: regionCoord * BIOME_REGION_SIZE * chunkSize + halfRegionSize
          const worldX = dx * BIOME_REGION_SIZE * 32 + (BIOME_REGION_SIZE * 32) / 2
          const worldZ = dz * BIOME_REGION_SIZE * 32 + (BIOME_REGION_SIZE * 32) / 2
          console.log(`[spawn] Avoided ${defaultBiome} at origin, spawning in ${biome} at region (${dx}, ${dz})`)
          return new THREE.Vector3(worldX, seaLevelY + 20, worldZ)
        }
      }
    }
  }

  // Fallback: no suitable biome found within search radius (very unlikely)
  console.warn('[spawn] Could not find non-hostile biome within search radius, using default')
  return new THREE.Vector3(256, seaLevelY + 20, 256)
}

// Create player physics body at spawn position (above generated terrain)
// Spawn at center of a biome region that has wood access (not desert/volcanic)
// originalSpawnPoint: The world's default spawn (never changes after world creation)
// bedSpawnPoint: Set when player sleeps in a bed (used for respawn if set)
const originalSpawnPoint = findSuitableSpawnPosition(worldGenerator.getConfig().seed, seaLevel)
let bedSpawnPoint: THREE.Vector3 | null = null

/**
 * Set the player's bed spawn point.
 * Called when player sleeps in a bed.
 */
export function setBedSpawnPoint(x: number, y: number, z: number): void {
  if (!bedSpawnPoint) {
    bedSpawnPoint = new THREE.Vector3(x, y, z)
  } else {
    bedSpawnPoint.set(x, y, z)
  }
  console.log(`Bed spawn point set: ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`)
}

/**
 * Get the respawn position (bed spawn if set, otherwise original spawn).
 */
function getRespawnPosition(): THREE.Vector3 {
  return bedSpawnPoint ?? originalSpawnPoint
}
const playerBody = new PhysicsBody(
  originalSpawnPoint,
  new THREE.Vector3(PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_DEPTH)
)
physicsEngine.addBody(playerBody)

// Create entity manager
const entityManager = new EntityManager(renderer.scene, physicsEngine, {
  maxEntities: 500,
  getChunkDistance: () => worldGenerator.getConfig().chunkDistance,
})
entityManager.setPlayerBody(playerBody)

// Connect entity manager to world for block entities
world.setEntityManager(entityManager)

// Create entity spawner
const entitySpawner = new EntitySpawner(
  entityManager,
  worldGenerator,
  world,
  playerBody
)

// Create player damage handler for entities to use
const playerDamageHandler = new PlayerDamageHandler(
  playerHealth,
  healthDisplay,
  playerBody,
  cameraControls
)

// Set player damage callback on entity manager so aggressive entities can deal damage
entityManager.setPlayerDamageCallback(playerDamageHandler.createCallback())

// Set light query for entity dimming based on world light levels (numeric fast path)
entityManager.setLightQuery((x, y, z) => world.getLightLevelFast(x, y, z))

// Set block query functions for entities that need world access (e.g., EmberRoach for pillar detection)
entityManager.setBlockQuery((x, y, z) => world.getBlockIdFast(x, y, z))
entityManager.setSolidQuery((x, y, z) => physicsWorld.isSolidBlock(x, y, z))

// Connect camera controls to physics
cameraControls.setPhysics(playerBody, physicsEngine)
cameraControls.setWorld(physicsWorld)

// Wire death callback for respawn
playerHealth.setOnDeath(() => {
  // Disable player input during respawn
  cameraControls.setInputEnabled(false)

  // Show death screen
  deathScreen.show()

  // Short delay before respawn
  setTimeout(() => {
    // Get the correct respawn position (bed if set, otherwise world spawn)
    const respawnPos = getRespawnPosition()

    // Reset position to spawn point (with Y offset to prevent spawning in ground)
    const spawnY = respawnPos.y + 0.5
    playerBody.position.set(respawnPos.x, spawnY, respawnPos.z)
    playerBody.velocity.set(0, 0, 0)
    renderer.camera.position.set(
      respawnPos.x,
      spawnY + EYE_HEIGHT,
      respawnPos.z
    )

    // Reset fall damage tracker to prevent false damage after teleport
    fallDamageTracker.reset()

    // Reset health to full
    playerHealth.reset()

    // Hold player in place to allow chunks to generate
    // This prevents falling through unloaded terrain
    const holdDuration = 2500
    const holdStartTime = performance.now()

    const holdPlayer = () => {
      const elapsed = performance.now() - holdStartTime
      if (elapsed < holdDuration) {
        // Keep player frozen at spawn position (with Y offset)
        playerBody.position.set(respawnPos.x, spawnY, respawnPos.z)
        playerBody.velocity.set(0, 0, 0)
        renderer.camera.position.set(
          respawnPos.x,
          spawnY + EYE_HEIGHT,
          respawnPos.z
        )
        requestAnimationFrame(holdPlayer)
      } else {
        // Release player after hold period
        fallDamageTracker.reset()
        deathScreen.hide()
        cameraControls.setInputEnabled(true)
      }
    }
    requestAnimationFrame(holdPlayer)
  }, 1500)
})

// Register bed sleep action (sets spawn point to player's current position)
blockActionRegistry.register(BlockIds.BED_HEAD, (worldX, worldY, worldZ) => {
  // Save player's current position as spawn point (they're standing next to the bed)
  // Respawn logic adds 0.5 to Y, so player spawns slightly above and falls down safely
  setBedSpawnPoint(playerBody.position.x, playerBody.position.y, playerBody.position.z)
  
  // Show floating text above the bed
  FloatingTextManager.instance.spawn({
    text: 'Spawn Point Set',
    position: new THREE.Vector3(Number(worldX) + 0.5, Number(worldY) + 1.5, Number(worldZ) + 0.5),
    mode: 'floating',
    duration: 2,
  })
  
  return true
})

// Register carpentry open/close toggles (doors swap both halves; all swaps
// omit the metadata arg so facing is preserved across the id swap)

// OPEN-variant ids: toggling one of these CLOSES the block, which becomes
// solid — refuse the toggle if it would embed the player in the closed block.
const openCarpentryIds = new Set<number>([
  BlockIds.OAK_DOOR_OPEN,
  BlockIds.OAK_DOOR_UPPER_OPEN,
  BlockIds.PINE_DOOR_OPEN,
  BlockIds.PINE_DOOR_UPPER_OPEN,
  BlockIds.REDWOOD_DOOR_OPEN,
  BlockIds.REDWOOD_DOOR_UPPER_OPEN,
  BlockIds.OAK_FENCE_GATE_OPEN,
  BlockIds.PINE_FENCE_GATE_OPEN,
  BlockIds.REDWOOD_FENCE_GATE_OPEN,
  BlockIds.OAK_TRAPDOOR_OPEN,
  BlockIds.PINE_TRAPDOOR_OPEN,
  BlockIds.REDWOOD_TRAPDOOR_OPEN,
])

/**
 * True if closing the block at (x, y, z) would trap the player: the player's
 * AABB (position is feet-center, matching PhysicsBody.getAABB) intersects the
 * block's full cell. Doors close both halves, so also test the cells above
 * and below the toggled coordinate.
 */
const wouldTrapPlayer = (x: bigint, y: bigint, z: bigint, isDoor: boolean): boolean => {
  const pos = playerBody.position
  const minX = pos.x - PLAYER_WIDTH / 2
  const maxX = pos.x + PLAYER_WIDTH / 2
  const minY = pos.y
  const maxY = pos.y + PLAYER_HEIGHT
  const minZ = pos.z - PLAYER_DEPTH / 2
  const maxZ = pos.z + PLAYER_DEPTH / 2

  const intersectsCell = (cx: bigint, cy: bigint, cz: bigint): boolean => {
    const bx = Number(cx)
    const by = Number(cy)
    const bz = Number(cz)
    return (
      maxX > bx && minX < bx + 1 &&
      maxY > by && minY < by + 1 &&
      maxZ > bz && minZ < bz + 1
    )
  }

  if (intersectsCell(x, y, z)) return true
  if (isDoor && (intersectsCell(x, y - 1n, z) || intersectsCell(x, y + 1n, z))) return true
  return false
}

for (const doorId of DOOR_TOGGLE_PAIRS.keys()) {
  blockActionRegistry.register(doorId, (x, y, z) => {
    if (openCarpentryIds.has(world.getBlockId(x, y, z)) && wouldTrapPlayer(x, y, z, true)) {
      return false
    }
    return toggleDoor(world, x, y, z)
  })
}
for (const gateId of Object.keys(GATE_TOGGLE_PAIRS)) {
  blockActionRegistry.register(Number(gateId), (x, y, z) => {
    if (openCarpentryIds.has(world.getBlockId(x, y, z)) && wouldTrapPlayer(x, y, z, false)) {
      return false
    }
    return toggleFenceGate(world, x, y, z)
  })
}
for (const pair of TRAPDOOR_TOGGLE_PAIRS) {
  const toggleWithGuard = (x: bigint, y: bigint, z: bigint): boolean => {
    if (openCarpentryIds.has(world.getBlockId(x, y, z)) && wouldTrapPlayer(x, y, z, false)) {
      return false
    }
    return toggleTrapdoor(world, x, y, z)
  }
  blockActionRegistry.register(pair.closedId, toggleWithGuard)
  blockActionRegistry.register(pair.openId, toggleWithGuard)
}

// Berry bush harvest (E): swap laden bush -> picked-clean, scatter berries.
// The setBlock swap preserves metadata (arg omitted) and auto-schedules the regrow tick.
blockActionRegistry.register(BlockIds.BERRY_BUSH_BERRIES, (x, y, z) => {
  const items = harvestBerryBush(world, x, y, z)
  if (items.length === 0) return false
  world.spawnBlockDrops(x, y, z, items)
  return true
})

// Resin tap collection (E): collect stored resin, then re-schedule the fill tick
// (a full tap goes dormant; collection must wake it).
blockActionRegistry.register(BlockIds.RESIN_TAP, (x, y, z) => {
  const collected = collectResin(world, x, y, z)
  world.scheduledBlockTicks.scheduleIfTickable(x, y, z)
  return collected > 0
})

// Position camera at player spawn with eye height offset
renderer.camera.position.set(
  originalSpawnPoint.x,
  originalSpawnPoint.y + EYE_HEIGHT,
  originalSpawnPoint.z
)

// Set the scene and renderer for rendering and proper GPU cleanup
world.setScene(renderer.scene)
world.setRenderer(renderer.renderer)

// Initialize floating text system
FloatingTextManager.instance.initialize(renderer.scene)

// Initialize divining particle system
DiviningParticleManager.instance.initialize(renderer.scene)

// Debug visualization system (FPS counter + chunk wireframes)
const wireframeManager = new ChunkWireframeManager(renderer.scene)
const debugManager = new DebugManager({
  fpsCounter,
  wireframeManager,
})
debugManager.restoreFromStorage()

// Sync wireframes with sub-chunk mesh lifecycle
world.onSubChunkMeshAdded((coord) => {
  wireframeManager.addSubChunk(coord)
})
world.onSubChunkMeshRemoved((coord) => {
  wireframeManager.removeSubChunk(coord)
})

// Highlight wireframes when columns are being lit
world.onColumnLightingStarted((coord) => {
  wireframeManager.highlightColumnLighting(coord, 1000)
})

// Cycle debug mode with Ctrl+Shift+P
window.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.shiftKey && event.code === 'KeyP') {
    event.preventDefault()
    debugManager.cycleMode()
  }
  // Debug: Analyze scene with Ctrl+Shift+A
  if (event.ctrlKey && event.shiftKey && event.code === 'KeyA') {
    event.preventDefault()
    renderer.debugLogSceneAnalysis()
  }
})

// Create opacity cache for software occlusion culling
const opacityCache = new SubChunkOpacityCache()
world.setOpacityCache(opacityCache)
renderer.setOpacityCache(opacityCache)

// Connect chunk meshes to renderer for frustum culling
renderer.setChunkMeshSource(() => world.getChunkMeshes())


// Add world lighting (sun at 10am) with settings-based shadow map size
const lighting = new WorldLighting({
  timeOfDay: 10,
  shadowMapSize: graphicsSettings.shadowMapSize,
})
lighting.addTo(renderer.scene)

// Apply initial shadow state from settings
lighting.setShadowsEnabled(graphicsSettings.shadowsEnabled)

// Add skybox with sun positioned to match the directional light
const skybox = new Skybox()
skybox.setSunPosition(lighting.sun.position)
skybox.addTo(renderer.scene)

// Create biome skybox manager for atmospheric effects
const biomeSkyboxManager = new BiomeSkyboxManager(
  skybox,
  biomeRegistry,
  worldGenerator.getConfig()
)

// Held item renderer (shows selected item in player's hand)
const heldItemRenderer = new HeldItemRenderer(
  renderer.renderer,
  renderer.camera
)

// Liquid overlay (underwater tint effect with distance fog)
const liquidOverlay = new LiquidOverlay(renderer.renderer, renderer.scene)

// Track toolbar selection changes
let lastSelectedIndex = playerState.inventory.toolbar.selectedIndex
const updateHeldItem = () => {
  const item = playerState.inventory.toolbar.getItem(
    playerState.inventory.toolbar.selectedIndex
  )
  heldItemRenderer.setItem(item)
}
updateHeldItem() // Set initial held item

// Block interaction system (mining)
const blockInteraction = new BlockInteraction(
  renderer.camera,
  world,
  playerState,
  renderer.scene,
  renderer.renderer.domElement,
  {
    onItemsCollected: () => {
      toolbarUI.syncFromState(playerState.inventory.toolbar.slots)
      updateHeldItem() // Update held item when inventory changes
    },
    entityManager,
  }
)

// World-driven block breaks (tree felling) scatter drops the same way mining does
world.setDropSpawner((item, x, y, z) => {
  const drop = new DroppedItemEntity({
    item,
    position: new THREE.Vector3(x + 0.5, y + 0.4, z + 0.5),
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 3,
      3.2,
      (Math.random() - 0.5) * 3
    ),
    onCollect: (collected, count) => {
      const leftover = playerState.addItemCounted(collected, count)
      if (leftover < count) {
        toolbarUI.syncFromState(playerState.inventory.toolbar.slots)
        updateHeldItem()
      }
      return leftover
    },
  })
  entityManager.addEntity(drop)
})

// Block placement system (right-click to place blocks)
const blockPlacement = new BlockPlacement(
  renderer.camera,
  world,
  playerState,
  playerBody,
  renderer.renderer.domElement,
  {
    onBlockPlaced: () => {
      toolbarUI.syncFromState(playerState.inventory.toolbar.slots)
      updateHeldItem() // Update held item when inventory changes
    },
  }
)

// Item consumption system (right-click hold to consume food)
const itemConsumption = new ItemConsumption(
  renderer.renderer.domElement,
  playerState,
  playerHealth,
  heldItemRenderer,
  {
    onItemConsumed: () => {
      toolbarUI.syncFromState(playerState.inventory.toolbar.slots)
      updateHeldItem() // Update held item when inventory changes
    },
  }
)

// Connect item consumption to block placement for priority handling
blockPlacement.setItemConsumption(itemConsumption)

// Block raycaster for E-key interaction
const blockRaycaster = new BlockRaycaster(world)

// Block UI interaction handler (E-key to open forge, etc.)
const blockInteractionHandler = new BlockInteractionHandler({
  domElement: renderer.renderer.domElement,
  camera: renderer.camera,
  worldManager: world,
  raycaster: blockRaycaster,
  inventoryUI,
  inventoryInputHandler: inventoryInput,
  toolbarUI,
  cameraControls,
  playerState,
  inventoryState: playerState.inventory.inventory,
  toolbarState: playerState.inventory.toolbar,
  onStateChanged: () => {
    toolbarUI.syncFromState(playerState.inventory.toolbar.slots)
    updateHeldItem()
  },
})

// Dragging a stack out of the inventory (or a block UI) throws it into the
// world: the drop spews out of the player along the camera's facing direction
// and lands a few blocks away. The longer pickup delay keeps it from being
// vacuumed straight back into the inventory before it lands.
const throwStackFromPlayer = (item: IItem, count: number): boolean => {
  const dir = new THREE.Vector3()
  renderer.camera.getWorldDirection(dir)

  // Horizontal throw direction (fall back to +X when looking straight up/down)
  const horiz = new THREE.Vector3(dir.x, 0, dir.z)
  if (horiz.lengthSq() < 1e-4) horiz.set(1, 0, 0)
  horiz.normalize()

  const drop = new DroppedItemEntity({
    item,
    count,
    position: new THREE.Vector3(
      playerBody.position.x + horiz.x * 0.6,
      playerBody.position.y + EYE_HEIGHT - 0.4,
      playerBody.position.z + horiz.z * 0.6
    ),
    velocity: new THREE.Vector3(
      horiz.x * 7.5 + (Math.random() - 0.5),
      3.0,
      horiz.z * 7.5 + (Math.random() - 0.5)
    ),
    pickupDelay: 1.5,
    requirePlayerExit: true,
    onCollect: (collected, n) => {
      const leftover = playerState.addItemCounted(collected, n)
      if (leftover < n) {
        toolbarUI.syncFromState(playerState.inventory.toolbar.slots)
        inventoryUI.syncFromState(playerState.inventory.inventory.slots)
        updateHeldItem()
      }
      return leftover
    },
  })
  return entityManager.addEntity(drop)
}
inventoryInput.setThrowStackHandler(throwStackFromPlayer)
blockInteractionHandler.setThrowStackHandler(throwStackFromPlayer)

let frameCpuStart = 0
let lastTickCount = 0
let lastFrameTime = 0

// Pre-allocated objects for render loop to avoid GC pressure
const schedulerStatsParam = {
  tasksExecuted: 0,
  tasksSkipped: 0,
  budgetUsedMs: 0,
  currentBudgetMs: 0,
  avgFrameTimeMs: 0,
}
const fpsUpdateParam = {
  deltaTime: 0,
  cpuTime: 0,
  tickCount: 0,
}

// Biome mini-map cache: the grid is a pure function of region + layer, so it is
// only recomputed when the player crosses a region/layer boundary (not per frame).
let miniMapGrid: string[][] = []
let miniMapRegionX = Number.NaN
let miniMapRegionZ = Number.NaN
let miniMapLayer = -1

// Create task scheduler with adaptive budgeting
const scheduler = new TaskScheduler({
  budgetRatio: 0.25,        // Use 25% of frame time for updates
  minBudgetMs: 1,           // Floor (prevents starvation)
  maxBudgetMs: 8,           // Ceiling (prevents runaway at low FPS)
  adaptationRate: 0.1,      // Smoothing factor for rolling average
  collectMetrics: true,
})

// Register CRITICAL tasks (always run every frame)
scheduler.createTask({
  id: 'camera-controls',
  priority: TaskPriority.CRITICAL,
  update: (dt) => cameraControls.update(dt),
})

scheduler.createTask({
  id: 'physics',
  priority: TaskPriority.CRITICAL,
  update: (dt) => physicsEngine.update(dt),
})

// Player health and fall damage (runs after physics to detect landing)
scheduler.createTask({
  id: 'player-health',
  priority: TaskPriority.CRITICAL,
  update: (dt) => {
    // Update invincibility timer
    playerHealth.update(dt)

    // Check for fall damage after physics (based on impact velocity)
    const damage = fallDamageTracker.update(
      playerBody.velocity.y,
      playerBody.isOnGround
    )
    if (damage > 0) {
      playerHealth.takeDamage(damage)
      healthDisplay.flash()
    }
  },
})

scheduler.createTask({
  id: 'block-interaction',
  priority: TaskPriority.CRITICAL,
  update: (dt) => blockInteraction.update(dt),
})

scheduler.createTask({
  id: 'item-consumption',
  priority: TaskPriority.CRITICAL,
  update: (dt) => itemConsumption.update(dt),
})

// Register block tick manager (for forge smelting, etc.)
scheduler.registerTask(blockTickManager)

// Register scheduled block ticks (interval-based block logic: leaf decay, etc.)
scheduler.registerTask(world.scheduledBlockTicks)

// Register entity manager
scheduler.registerTask(entityManager)

// Register entity spawner
scheduler.registerTask(entitySpawner)

// Update magma slime player tracking (they have special contact damage).
// The damage callback is stable for the session, so allocate it once instead of
// per slime per tick. Both the player position and the callback are stored as
// stable references on each slime, so this only needs to run occasionally to pick
// up newly spawned slimes rather than every 60 UPS tick.
const magmaSlimeDamageCallback = playerDamageHandler.createCallback()
const MAGMA_SLIME_TRACK_INTERVAL = 0.25 // seconds (~4Hz)
let magmaSlimeTrackTimer = MAGMA_SLIME_TRACK_INTERVAL
scheduler.createTask({
  id: 'magma-slime-tracking',
  priority: TaskPriority.NORMAL,
  update: (dt) => {
    magmaSlimeTrackTimer += dt
    if (magmaSlimeTrackTimer < MAGMA_SLIME_TRACK_INTERVAL) return
    magmaSlimeTrackTimer = 0
    const magmaSlimes = entityManager.getEntitiesByType('magma_slime')
    for (const entity of magmaSlimes) {
      const slime = entity as MagmaSlimeEntity
      slime.updatePlayerPosition(playerBody.position)
      slime.setPlayerDamageCallback(magmaSlimeDamageCallback)
    }
  },
})

// Update block UI when open
scheduler.createTask({
  id: 'block-ui-update',
  priority: TaskPriority.NORMAL,
  update: () => blockInteractionHandler.update(),
})

// Update floating text (fade, movement, cleanup)
scheduler.createTask({
  id: 'floating-text',
  priority: TaskPriority.NORMAL,
  update: (dt) => FloatingTextManager.instance.update(dt),
})

// Update divining particles (cave detection visual feedback)
scheduler.createTask({
  id: 'divining-particles',
  priority: TaskPriority.NORMAL,
  update: (dt) => DiviningParticleManager.instance.update(dt),
})

// Register HIGH priority tasks (can be skipped briefly without visual issues)
scheduler.createTask({
  id: 'shadow-camera',
  priority: TaskPriority.NORMAL,
  update: () => lighting.updateShadowTarget(renderer.camera.position),
})

scheduler.createTask({
  id: 'skybox',
  priority: TaskPriority.NORMAL,
  update: (dt) => {
    // Update biome-based skybox modifiers
    biomeSkyboxManager.update(playerBody.position.x, playerBody.position.y, playerBody.position.z)
    // Update skybox position and apply modifiers
    skybox.update(renderer.camera, dt)
  },
})

scheduler.createTask({
  id: 'held-item',
  priority: TaskPriority.NORMAL,
  update: (dt) => {
    heldItemRenderer.setWalking(cameraControls.isWalking())
    heldItemRenderer.setMining(blockInteraction.isMining())
    if (playerState.inventory.toolbar.selectedIndex !== lastSelectedIndex) {
      lastSelectedIndex = playerState.inventory.toolbar.selectedIndex
      updateHeldItem()
    }

    // Update held item lighting based on surrounding block light level
    const camPos = renderer.camera.position
    const lightLevel = world.getLightLevelFast(camPos.x, camPos.y, camPos.z)
    heldItemRenderer.setLightLevel(lightLevel)

    // Update divining stick cave detection glow
    heldItemRenderer.updateCaveDetection(world, camPos.x, camPos.y, camPos.z)

    heldItemRenderer.update(dt)
  },
})

scheduler.createTask({
  id: 'liquid-overlay',
  priority: TaskPriority.CRITICAL,
  update: (dt) => {
    liquidOverlay.update(renderer.camera.position, world, dt)
  },
})

scheduler.createTask({
  id: 'lighting-queue',
  priority: TaskPriority.NORMAL,
  update: () =>
    world.updateLightingQueue(renderer.camera.position.x, renderer.camera.position.z),
})

// Queue management tasks
scheduler.createTask({
  id: 'world-generation-queue',
  priority: TaskPriority.NORMAL,
  update: () =>
    worldGenerator.updateQueue(renderer.camera.position.x, renderer.camera.position.z, renderer.camera.position.y),
})

// Register NORMAL priority tasks (background work, budget-aware)
scheduler.registerTask(
  new BudgetAwareTask({
    id: 'world-generation',
    priority: TaskPriority.NORMAL,
    maxUnitsPerFrame: 4,
    doWork: () => worldGenerator.processNextSubChunk(),
  })
)

// Register LOW priority tasks (lowest priority background work, budget-aware)
scheduler.registerTask(
  new BudgetAwareTask({
    id: 'background-lighting',
    priority: TaskPriority.LOW,
    maxUnitsPerFrame: 4,
    doWork: () => world.processNextLightingColumn(),
  })
)


// Liquid physics queue management (moves pending blocks to processing queue)
scheduler.createTask({
  id: 'liquid-physics-queue',
  priority: TaskPriority.LOW,
  update: () =>
    world.updateLiquidPhysicsQueue(renderer.camera.position.x, renderer.camera.position.z),
})

// Liquid physics processing (water flow simulation)
scheduler.registerTask(
  new BudgetAwareTask({
    id: 'liquid-physics',
    priority: TaskPriority.LOW,
    maxUnitsPerFrame: 8,
    doWork: () => world.processNextLiquidPhysicsColumn(),
  })
)

/**
 * Transition from loading to playing state.
 * Shows UI elements and enables player controls.
 */
function finishLoading(): void {
  isLoading = false
  loadingScreen.hide()
  crosshair.element.style.display = ''
  fpsCounter.element.style.display = ''
  toolbarUI.root.style.display = 'flex'
  healthDisplay.root.style.display = 'flex'
}

const gameLoop = new GameLoop({
  update(deltaTime: number) {
    frameCpuStart = performance.now()

    // Report previous frame time for adaptive budgeting
    if (lastFrameTime > 0) {
      scheduler.reportFrameTime(lastFrameTime)
    }

    // During loading, only update world generation (bypass scheduler)
    if (isLoading) {
      // Update world generation from spawn position
      worldGenerator.update(originalSpawnPoint.x, originalSpawnPoint.z, originalSpawnPoint.y)
      world.update(originalSpawnPoint.x, originalSpawnPoint.z)

      // Process mesh results (throttled to prevent GPU flooding)
      world.processPendingMeshResults()

      // Update loading progress
      const chunksLoaded = worldGenerator.getGeneratedChunkColumnCount()
      loadingScreen.setProgress(chunksLoaded, requiredChunks)

      // Check if we have enough chunks to spawn
      if (chunksLoaded >= requiredChunks) {
        finishLoading()
      }
      return
    }

    // Normal gameplay - use task scheduler with adaptive budget management
    scheduler.update(deltaTime)

    // Process mesh results (throttled to prevent GPU flooding)
    world.processPendingMeshResults()
  },
  render() {
    renderer.render()
    const statsVisible = fpsCounter.visible
    // Capture renderer stats after main render but before held item (autoReset clears on next render call).
    // Only gather them when the overlay is visible — the computation is otherwise pure waste.
    const rendererStats = statsVisible ? renderer.getRendererStats() : null
    // Render held item on top of world
    heldItemRenderer.render()
    // Render liquid overlay (underwater tint)
    liquidOverlay.render()
    // Update wireframe colors based on culling (after culling runs in render)
    wireframeManager.updateColors(world.getChunkMeshes())
    // Update liquid physics indicators (blue circles at chunk corners when processing water)
    wireframeManager.updateLiquidPhysicsIndicators(
      world.getLiquidPhysicsQueuedColumns(),
      playerBody.position.x,
      playerBody.position.y,
      playerBody.position.z
    )
    // Measure total CPU time for update + render
    const cpuTime = performance.now() - frameCpuStart
    // All the debug HUD stats gathering below is pure waste while the overlay is
    // hidden (the default) — only feed the counter when it is actually visible.
    if (statsVisible) {
      const renderRes = renderer.getRenderResolution()
      fpsCounter.setRenderResolution(renderRes.width, renderRes.height)
      fpsCounter.setPlayerPosition(playerBody.position.x, playerBody.position.y, playerBody.position.z)
      // Recompute the biome grid only when the player crosses a region/layer boundary;
      // it is a pure function of (regionX, regionZ, layer). Yaw rotation is applied downstream.
      const chunkX = Math.floor(playerBody.position.x / 32)
      const chunkZ = Math.floor(playerBody.position.z / 32)
      const { regionX, regionZ } = biomeRegistry.getRegionCoords(chunkX, chunkZ)
      const layer = playerBody.position.y < LAYER_BOUNDARY_Y ? 0 : 1
      if (regionX !== miniMapRegionX || regionZ !== miniMapRegionZ || layer !== miniMapLayer) {
        miniMapRegionX = regionX
        miniMapRegionZ = regionZ
        miniMapLayer = layer
        miniMapGrid = calculateBiomeMiniMap(playerBody.position.x, playerBody.position.y, playerBody.position.z, worldGenerator.getConfig().seed)
      }
      fpsCounter.setBiomeMiniMap({ grid: miniMapGrid, yaw: cameraControls.getYaw() })
      fpsCounter.setLightingStats(world.getBackgroundLightingStats())
      fpsCounter.setOcclusionStats(renderer.getOcclusionStats())
      if (rendererStats) {
        fpsCounter.setRendererStats(rendererStats)
      }
      fpsCounter.setLiquidPhysicsStats(world.getLiquidPhysicsStats())
      fpsCounter.setEntityStats({
        activeCount: entityManager.entityCount,
        pendingRemovalCount: entityManager.pendingRemovalCount,
      })
      // Add scheduler stats for debug display (reuse pre-allocated object)
      const schedulerMetrics = scheduler.getMetrics()
      if (schedulerMetrics) {
        schedulerStatsParam.tasksExecuted = schedulerMetrics.tasksExecuted
        schedulerStatsParam.tasksSkipped = schedulerMetrics.tasksSkipped
        schedulerStatsParam.budgetUsedMs = schedulerMetrics.frameTimeMs
        schedulerStatsParam.currentBudgetMs = scheduler.getCurrentBudget()
        schedulerStatsParam.avgFrameTimeMs = scheduler.getAverageFrameTime()
        fpsCounter.setSchedulerStats(schedulerStatsParam)
      }
    }
    // Update FPS counter (reuse pre-allocated object). update() self-throttles and
    // skips all DOM work while hidden, but still needs frame timing fed each frame.
    fpsUpdateParam.deltaTime = lastFrameTime / 1000
    fpsUpdateParam.cpuTime = cpuTime
    fpsUpdateParam.tickCount = lastTickCount
    fpsCounter.update(fpsUpdateParam)
  },
}, (metrics) => {
  lastTickCount = metrics.tickCount
  lastFrameTime = metrics.frameTime
}, graphicsSettings.framerateLimit)

// Settings input handler - shows/hides settings based on pointer lock state
// Created after gameLoop so we can control pause state
const settingsInput = new SettingsInputHandler({
  domElement: renderer.renderer.domElement,
  cameraControls,
  isInventoryOpen: () => inventoryUI.isOpen || blockInteractionHandler.isOpen,
  openSettingsUI: () => settingsUI.open(),
  closeSettingsUI: () => settingsUI.close(),
  setGamePaused: (paused) => { gameLoop.paused = paused },
})

gameLoop.start()

// Periodic health check for stuck chunk generation (for debugging)
setInterval(() => {
  world.checkGenerationHealth()
}, 5000)
