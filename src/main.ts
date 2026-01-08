import { GameLoop } from './core/GameLoop.ts'
import { TaskScheduler } from './core/TaskScheduler.ts'
import { TaskPriority } from './core/interfaces/ITask.ts'
import { BudgetAwareTask } from './core/BudgetAwareTask.ts'
import { Renderer } from './renderer/Renderer.ts'
import { SubChunkOpacityCache } from './renderer/SubChunkOpacityCache.ts'
import { WorldLighting } from './renderer/WorldLighting.ts'
import { Skybox } from './renderer/skybox/Skybox.ts'
import { HeldItemRenderer } from './renderer/helditem/index.ts'
import {
	  FirstPersonCameraControls,
	} from './player/FirstPersonCameraControls.ts'
import { PlayerState } from './player/PlayerState.ts'
import { ToolbarInputHandler } from './player/ToolbarInput.ts'
import { InventoryInputHandler } from './player/InventoryInput.ts'
import { SettingsInputHandler } from './player/SettingsInput.ts'
import { BlockInteraction } from './player/BlockInteraction.ts'
import { BlockPlacement } from './player/BlockPlacement.ts'
import { createCrosshairUI } from './ui/Crosshair.ts'
import { createToolbarUI } from './ui/Toolbar.ts'
import { createInventoryUI } from './ui/Inventory.ts'
import { createSettingsMenuUI } from './ui/SettingsMenu.ts'
import { createFpsCounterUI } from './ui/FpsCounter.ts'
import { createLoadingScreenUI } from './ui/LoadingScreen.ts'
import { ChunkWireframeManager } from './renderer/ChunkWireframeManager.ts'
import { OreWireframeManager } from './renderer/OreWireframeManager.ts'
import { DebugManager } from './ui/DebugManager.ts'
import {
  WorldManager,
  registerDefaultBlocks,
} from './world/index.ts'
import { registerDefaultRecipes } from './crafting/index.ts'
import { WorldGenerator } from './world/generate/index.ts'
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
import { smeltingRegistry } from './smelting/index.ts'
import { IronBarItem, GoldBarItem, CopperBarItem, SteelBarItem } from './items/bars/index.ts'
import { blockUIRegistry, createForgeUI } from './ui/blockui/index.ts'
import { BlockIds } from './world/blocks/BlockIds.ts'
import { BlockInteractionHandler } from './player/BlockInteractionHandler.ts'
import { BlockRaycaster } from './player/BlockRaycaster.ts'
import type { ForgeBlockState } from './world/blocks/types/forge/ForgeBlockState.ts'
import { ForgeBlockItem } from './items/blocks/forge/ForgeBlockItem.ts'
import { recipeRegistry } from './crafting/RecipeRegistry.ts'
import {
  PersistenceManager,
  initializeItemRegistry,
  serializeInventory,
  deserializeInventory,
} from './persistence/index.ts'

// Initialize world system
registerDefaultBlocks()
registerDefaultRecipes()

// Initialize item registry for persistence deserialization
initializeItemRegistry()

// Initialize block tick manager (for forge smelting, etc.)
const blockTickManager = new BlockTickManager()
setForgeBlockTickManager(blockTickManager)

// Register smelting recipes
smeltingRegistry.register({
  id: 'smelt_iron_ore',
  name: 'Iron Bar',
  inputId: 'iron_ore',
  createResult: () => new IronBarItem(),
  resultCount: 1,
  smeltTime: 10,
})
smeltingRegistry.register({
  id: 'smelt_gold_ore',
  name: 'Gold Bar',
  inputId: 'gold_ore',
  createResult: () => new GoldBarItem(),
  resultCount: 1,
  smeltTime: 12,
})
smeltingRegistry.register({
  id: 'smelt_copper_ore',
  name: 'Copper Bar',
  inputId: 'copper_ore',
  createResult: () => new CopperBarItem(),
  resultCount: 1,
  smeltTime: 8,
})
smeltingRegistry.register({
  id: 'smelt_iron_bar',
  name: 'Steel Bar',
  inputId: 'iron_bar',
  createResult: () => new SteelBarItem(),
  resultCount: 1,
  smeltTime: 30, // 30 seconds - requires high heat to convert iron to steel
})

// Register forge crafting recipe (4 stone -> 1 forge)
recipeRegistry.register({
  id: 'craft_forge',
  name: 'Forge',
  ingredients: [{ itemId: 'stone_block', count: 4 }],
  createResult: () => new ForgeBlockItem(),
  resultCount: 1,
})

// Register block UI for forge
blockUIRegistry.register(BlockIds.FORGE, (state) => createForgeUI(state as ForgeBlockState))

const renderer = new Renderer()

// Graphics settings (persisted to localStorage)
const graphicsSettings = new GraphicsSettings()
renderer.setGraphicsSettings(graphicsSettings)

// Player state (including toolbar/inventory)
const playerState = new PlayerState(10)

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

// Create persistence manager and initialize asynchronously
const persistenceManager = new PersistenceManager()

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

  // Load saved player position if exists
  const savedMetadata = await persistenceManager.loadMetadata()
  if (savedMetadata?.playerPosition) {
    const pos = savedMetadata.playerPosition
    playerBody.position.set(pos.x, pos.y, pos.z)
    renderer.camera.position.set(pos.x, pos.y + EYE_HEIGHT, pos.z)
    spawnPosition.set(pos.x, pos.y, pos.z)
    console.log(`Loaded saved position: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`)
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
  }))
}).catch((error) => {
  console.error('Failed to initialize persistence:', error)
})

// Safety save on page unload
window.addEventListener('beforeunload', () => {
  persistenceManager.saveBeforeUnload(
    serializeInventory(playerState.inventory),
    world,
    {
      x: playerBody.position.x,
      y: playerBody.position.y,
      z: playerBody.position.z,
    }
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
      }
    )
  },
  onNewGame: async () => {
    // Clear all saved data and reload the page for fresh start
    await persistenceManager.clearAll()
    window.location.reload()
  },
})

const seaLevel = worldGenerator.getConfig().seaLevel

// Create physics system
const physicsWorld = new WorldPhysicsAdapter(world)
const physicsEngine = new PhysicsEngine(physicsWorld)

// Create player physics body at spawn position (above generated terrain)
// Spawn at center of biome region (256, 256) to avoid biome boundary at origin
const spawnPosition = new THREE.Vector3(256, seaLevel + 20, 256)
const playerBody = new PhysicsBody(
  spawnPosition,
  new THREE.Vector3(PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_DEPTH)
)
physicsEngine.addBody(playerBody)

// Connect camera controls to physics
cameraControls.setPhysics(playerBody, physicsEngine)

// Position camera at player spawn with eye height offset
renderer.camera.position.set(
  spawnPosition.x,
  spawnPosition.y + EYE_HEIGHT,
  spawnPosition.z
)

// Set the scene for rendering
world.setScene(renderer.scene)

// Debug visualization system (FPS counter + chunk wireframes + ore wireframes)
const wireframeManager = new ChunkWireframeManager(renderer.scene)
const oreWireframeManager = new OreWireframeManager(renderer.scene)
const debugManager = new DebugManager({
  fpsCounter,
  wireframeManager,
  oreWireframeManager,
})
debugManager.restoreFromStorage()

// Sync wireframes with sub-chunk mesh lifecycle
world.onSubChunkMeshAdded((coord) => {
  wireframeManager.addSubChunk(coord)
})
world.onSubChunkMeshRemoved((coord) => {
  wireframeManager.removeSubChunk(coord)
  oreWireframeManager.removeOresForSubChunk(coord)
})

// Add ore wireframes when ores are generated
world.onOrePositionsGenerated((coord, positions) => {
  oreWireframeManager.addOresForSubChunk(coord, positions)
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

// Held item renderer (shows selected item in player's hand)
const heldItemRenderer = new HeldItemRenderer(
  renderer.renderer,
  renderer.camera
)

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
  }
)

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

scheduler.createTask({
  id: 'block-interaction',
  priority: TaskPriority.CRITICAL,
  update: (dt) => blockInteraction.update(dt),
})

// Register block tick manager (for forge smelting, etc.)
scheduler.registerTask(blockTickManager)

// Update block UI when open
scheduler.createTask({
  id: 'block-ui-update',
  priority: TaskPriority.NORMAL,
  update: () => blockInteractionHandler.update(),
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
  update: () => skybox.update(renderer.camera),
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
    const lightLevel = world.getLightLevelAtWorld(camPos.x, camPos.y, camPos.z)
    heldItemRenderer.setLightLevel(lightLevel)

    heldItemRenderer.update(dt)
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
    worldGenerator.updateQueue(renderer.camera.position.x, renderer.camera.position.z),
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
      worldGenerator.update(spawnPosition.x, spawnPosition.z, spawnPosition.y)
      world.update(spawnPosition.x, spawnPosition.z)

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
    // Render held item on top of world
    heldItemRenderer.render()
    // Update wireframe colors based on culling (after culling runs in render)
    wireframeManager.updateColors(world.getChunkMeshes())
    // Measure total CPU time for update + render
    const cpuTime = performance.now() - frameCpuStart
    const renderRes = renderer.getRenderResolution()
    fpsCounter.setRenderResolution(renderRes.width, renderRes.height)
    fpsCounter.setPlayerPosition(playerBody.position.x, playerBody.position.y, playerBody.position.z)
    fpsCounter.setLightingStats(world.getBackgroundLightingStats())
    fpsCounter.setOcclusionStats(renderer.getOcclusionStats())
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
    // Update FPS counter (reuse pre-allocated object)
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
