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
import { ChunkWireframeManager } from './renderer/ChunkWireframeManager.ts'
import { DebugManager } from './ui/DebugManager.ts'
import {
  WorldManager,
  registerDefaultBlocks,
} from './world/index.ts'
import { registerDefaultRecipes } from './crafting/index.ts'
import { WorldGenerator } from './world/generate/index.ts'
import { biomeRegistry } from './world/generate/biomes/BiomeRegistry.ts'
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
import { smeltingRegistry } from './smelting/index.ts'
import { brewingRegistry } from './brewing/index.ts'
import { IronBarItem, GoldBarItem, CopperBarItem, SteelBarItem } from './items/bars/index.ts'
import { GlassBlockItem } from './items/blocks/glass/GlassBlockItem.ts'
import { ApothecaryWorkbenchBlockItem } from './items/blocks/apothecary_workbench/ApothecaryWorkbenchBlockItem.ts'
import { HealthPotion1Item } from './items/potions/health_potion_1/HealthPotion1Item.ts'
import { HealthPotion2Item } from './items/potions/health_potion_2/HealthPotion2Item.ts'
import { HealthPotion3Item } from './items/potions/health_potion_3/HealthPotion3Item.ts'
import { CookedPorkItem } from './items/food/cooked_pork/CookedPorkItem.ts'
import { CookedFoxMeatItem } from './items/food/cooked_fox_meat/CookedFoxMeatItem.ts'
import { CookedBeefItem } from './items/food/cooked_beef/CookedBeefItem.ts'
import { CookedRabbitItem } from './items/food/cooked_rabbit/CookedRabbitItem.ts'
import { CookedAlligatorMeatItem } from './items/food/cooked_alligator_meat/CookedAlligatorMeatItem.ts'
import { CookedSnakeItem } from './items/food/cooked_snake/CookedSnakeItem.ts'
import { CookedKomodoMeatItem } from './items/food/cooked_komodo_meat/CookedKomodoMeatItem.ts'
import { BreadItem } from './items/food/bread/BreadItem.ts'
import { blockUIRegistry, createForgeUI, createApothecaryWorkbenchUI } from './ui/blockui/index.ts'
import { BlockIds } from './world/blocks/BlockIds.ts'
import { BlockInteractionHandler } from './player/BlockInteractionHandler.ts'
import { BlockRaycaster } from './player/BlockRaycaster.ts'
import type { ForgeBlockState } from './world/blocks/types/forge/ForgeBlockState.ts'
import type { ApothecaryWorkbenchState } from './world/blocks/types/apothecary_workbench/ApothecaryWorkbenchState.ts'
import { ForgeBlockItem } from './items/blocks/forge/ForgeBlockItem.ts'
import { recipeRegistry } from './crafting/RecipeRegistry.ts'
import {
  PersistenceManager,
  initializeItemRegistry,
  serializeInventory,
  deserializeInventory,
} from './persistence/index.ts'
import { PlayerHealth } from './player/PlayerHealth.ts'
import { FallDamageTracker } from './player/FallDamageTracker.ts'
import { createHealthDisplayUI } from './ui/HealthDisplay.ts'
import { BlockIconGenerator } from './renderer/BlockIconGenerator.ts'
import { EntityManager, EntitySpawner } from './entities/index.ts'
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
smeltingRegistry.register({
  id: 'cook_raw_pork',
  name: 'Cooked Pork',
  inputId: 'raw_pork',
  createResult: () => new CookedPorkItem(),
  resultCount: 1,
  smeltTime: 5, // 5 seconds - quick cooking time
})
smeltingRegistry.register({
  id: 'cook_raw_fox_meat',
  name: 'Cooked Fox Meat',
  inputId: 'raw_fox_meat',
  createResult: () => new CookedFoxMeatItem(),
  resultCount: 1,
  smeltTime: 5, // 5 seconds - quick cooking time
})
smeltingRegistry.register({
  id: 'cook_raw_beef',
  name: 'Cooked Beef',
  inputId: 'raw_beef',
  createResult: () => new CookedBeefItem(),
  resultCount: 1,
  smeltTime: 6, // 6 seconds - slightly longer for beef
})
smeltingRegistry.register({
  id: 'cook_raw_rabbit',
  name: 'Cooked Rabbit',
  inputId: 'raw_rabbit',
  createResult: () => new CookedRabbitItem(),
  resultCount: 1,
  smeltTime: 4, // 4 seconds - rabbit is small so cooks quickly
})
smeltingRegistry.register({
  id: 'bake_bread',
  name: 'Bread',
  inputId: 'ground_wheat',
  createResult: () => new BreadItem(),
  resultCount: 1,
  smeltTime: 12, // 12 seconds to bake bread
})
smeltingRegistry.register({
  id: 'cook_raw_alligator_meat',
  name: 'Cooked Alligator Meat',
  inputId: 'raw_alligator_meat',
  createResult: () => new CookedAlligatorMeatItem(),
  resultCount: 1,
  smeltTime: 7, // 7 seconds - alligator meat is tough
})
smeltingRegistry.register({
  id: 'cook_raw_snake',
  name: 'Cooked Snake',
  inputId: 'raw_snake',
  createResult: () => new CookedSnakeItem(),
  resultCount: 1,
  smeltTime: 6, // 6 seconds - snake meat cooks quickly
})
smeltingRegistry.register({
  id: 'cook_raw_komodo_meat',
  name: 'Cooked Komodo Meat',
  inputId: 'raw_komodo_meat',
  createResult: () => new CookedKomodoMeatItem(),
  resultCount: 1,
  smeltTime: 7, // 7 seconds - komodo meat is thick
})
smeltingRegistry.register({
  id: 'smelt_sand',
  name: 'Glass',
  inputId: 'sand_block',
  createResult: () => new GlassBlockItem(),
  resultCount: 1,
  smeltTime: 10, // 10 seconds - melting sand into glass
})

// Register brewing recipes
brewingRegistry.register({
  id: 'brew_health_potion_1',
  name: 'Healing Potion I',
  ingredients: [{ itemId: 'herb', count: 1 }],
  createResult: () => new HealthPotion1Item(),
  resultCount: 1,
  brewTime: 10, // 10 seconds
})
brewingRegistry.register({
  id: 'brew_health_potion_2',
  name: 'Healing Potion II',
  ingredients: [
    { itemId: 'herb', count: 1 },
    { itemId: 'mushroom_cap_block', count: 1 },
  ],
  createResult: () => new HealthPotion2Item(),
  resultCount: 1,
  brewTime: 15, // 15 seconds
})
brewingRegistry.register({
  id: 'brew_health_potion_3',
  name: 'Healing Potion III',
  ingredients: [
    { itemId: 'herb', count: 1 },
    { itemId: 'mushroom_cap_block', count: 1 },
    { itemId: 'corrupted_essence', count: 1 },
  ],
  createResult: () => new HealthPotion3Item(),
  resultCount: 1,
  brewTime: 20, // 20 seconds
})

// Register forge crafting recipe (4 stone -> 1 forge)
recipeRegistry.register({
  id: 'craft_forge',
  name: 'Forge',
  ingredients: [{ itemId: 'stone_block', count: 4 }],
  createResult: () => new ForgeBlockItem(),
  resultCount: 1,
})

// Register apothecary workbench crafting recipe (4 stone + 2 glass -> 1 apothecary workbench)
recipeRegistry.register({
  id: 'craft_apothecary_workbench',
  name: 'Apothecary Workbench',
  ingredients: [
    { itemId: 'stone_block', count: 4 },
    { itemId: 'glass_block', count: 2 },
  ],
  createResult: () => new ApothecaryWorkbenchBlockItem(),
  resultCount: 1,
})

// Register block UI for forge
blockUIRegistry.register(BlockIds.FORGE, (state) => createForgeUI(state as ForgeBlockState))

// Register block UI for apothecary workbench
blockUIRegistry.register(BlockIds.APOTHECARY_WORKBENCH, (state) => createApothecaryWorkbenchUI(state as ApothecaryWorkbenchState))

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

// Generate block icons for UI after textures are loaded
BlockIconGenerator.getInstance().generateAllIcons(renderer.renderer)

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
    playerHealth.currentHealth
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
      playerHealth.currentHealth
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

// Create player physics body at spawn position (above generated terrain)
// Spawn at center of biome region (256, 256) to avoid biome boundary at origin
const spawnPosition = new THREE.Vector3(256, seaLevel + 20, 256)
const playerBody = new PhysicsBody(
  spawnPosition,
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

// Set light query for entity dimming based on world light levels
entityManager.setLightQuery((x, y, z) => world.getLightLevelAtWorld(x, y, z))

// Set block query functions for entities that need world access (e.g., EmberRoach for pillar detection)
entityManager.setBlockQuery((x, y, z) =>
  world.getBlockId(BigInt(Math.floor(x)), BigInt(Math.floor(y)), BigInt(Math.floor(z)))
)
entityManager.setSolidQuery((x, y, z) => physicsWorld.isSolidBlock(x, y, z))

// Connect camera controls to physics
cameraControls.setPhysics(playerBody, physicsEngine)
cameraControls.setWorld(physicsWorld)

// Wire death callback for respawn
playerHealth.setOnDeath(() => {
  // Disable player input during respawn
  cameraControls.setInputEnabled(false)

  // Short delay before respawn
  setTimeout(() => {
    // Reset position to spawn point
    playerBody.position.copy(spawnPosition)
    playerBody.velocity.set(0, 0, 0)
    renderer.camera.position.set(
      spawnPosition.x,
      spawnPosition.y + EYE_HEIGHT,
      spawnPosition.z
    )

    // Reset fall damage tracker to prevent false damage after teleport
    fallDamageTracker.reset()

    // Reset health to full
    playerHealth.reset()

    // Re-enable player input
    cameraControls.setInputEnabled(true)
  }, 1500)
})

// Position camera at player spawn with eye height offset
renderer.camera.position.set(
  spawnPosition.x,
  spawnPosition.y + EYE_HEIGHT,
  spawnPosition.z
)

// Set the scene and renderer for rendering and proper GPU cleanup
world.setScene(renderer.scene)
world.setRenderer(renderer.renderer)

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

// Register entity manager
scheduler.registerTask(entityManager)

// Register entity spawner
scheduler.registerTask(entitySpawner)

// Update magma slime player tracking (they have special contact damage)
scheduler.createTask({
  id: 'magma-slime-tracking',
  priority: TaskPriority.NORMAL,
  update: () => {
    const magmaSlimes = entityManager.getEntitiesByType('magma_slime')
    for (const entity of magmaSlimes) {
      const slime = entity as MagmaSlimeEntity
      slime.updatePlayerPosition(playerBody.position)
      slime.setPlayerDamageCallback(playerDamageHandler.createCallback())
    }
  },
})

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
    const lightLevel = world.getLightLevelAtWorld(camPos.x, camPos.y, camPos.z)
    heldItemRenderer.setLightLevel(lightLevel)

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
    // Capture renderer stats after main render but before held item (autoReset clears on next render call)
    const rendererStats = renderer.getRendererStats()
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
    const renderRes = renderer.getRenderResolution()
    fpsCounter.setRenderResolution(renderRes.width, renderRes.height)
    fpsCounter.setPlayerPosition(playerBody.position.x, playerBody.position.y, playerBody.position.z)
    fpsCounter.setBiomeMiniMap({
      grid: calculateBiomeMiniMap(playerBody.position.x, playerBody.position.y, playerBody.position.z, worldGenerator.getConfig().seed),
      yaw: cameraControls.getYaw(),
    })
    fpsCounter.setLightingStats(world.getBackgroundLightingStats())
    fpsCounter.setOcclusionStats(renderer.getOcclusionStats())
    fpsCounter.setRendererStats(rendererStats)
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
