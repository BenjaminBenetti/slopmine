import { GameLoop } from './core/GameLoop.ts'
import { Renderer } from './renderer/Renderer.ts'
import { WorldLighting } from './renderer/WorldLighting.ts'
import { Skybox } from './renderer/skybox/Skybox.ts'
import {
	  FirstPersonCameraControls,
	} from './player/FirstPersonCameraControls.ts'
import { PlayerState } from './player/PlayerState.ts'
import { ToolbarInputHandler } from './player/ToolbarInput.ts'
import { InventoryInputHandler } from './player/InventoryInput.ts'
import { SettingsInputHandler } from './player/SettingsInput.ts'
import { BlockInteraction } from './player/BlockInteraction.ts'
import { createCrosshairUI } from './ui/Crosshair.ts'
import { createToolbarUI } from './ui/Toolbar.ts'
import { createInventoryUI } from './ui/Inventory.ts'
import { createSettingsMenuUI } from './ui/SettingsMenu.ts'
import { createFpsCounterUI } from './ui/FpsCounter.ts'
import {
  WorldManager,
  registerDefaultBlocks,
} from './world/index.ts'
import { WorldGenerator } from './world/generate/index.ts'
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

// Initialize world system
registerDefaultBlocks()

const renderer = new Renderer()

// Player state (including toolbar/inventory)
const playerState = new PlayerState(10)

// UI overlays (crosshair + hotbar + FPS counter) rendered above the canvas
createCrosshairUI()
const fpsCounter = createFpsCounterUI()

// Restore FPS counter visibility from localStorage
const FPS_COUNTER_STORAGE_KEY = 'slopmine:fpsCounterVisible'
const storedVisibility = localStorage.getItem(FPS_COUNTER_STORAGE_KEY)
if (storedVisibility === 'false') {
  fpsCounter.hide()
}

// Toggle FPS counter with Ctrl+Shift+P
window.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.shiftKey && event.code === 'KeyP') {
    event.preventDefault()
    fpsCounter.toggle()
    localStorage.setItem(FPS_COUNTER_STORAGE_KEY, String(fpsCounter.visible))
  }
})
const toolbarUI = createToolbarUI(undefined, {
	  slotCount: playerState.inventory.toolbar.size,
})

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
)

// Initial toolbar sync to render any items that exist at startup
toolbarUI.syncFromState(playerState.inventory.toolbar.slots)

// Create world with terrain generation
const world = new WorldManager()
const worldGenerator = new WorldGenerator(world)

// Settings menu UI (settingsInput is created later after gameLoop)
const settingsUI = createSettingsMenuUI(worldGenerator.getConfig(), document.body, {
  onResume: () => {
    // Request pointer lock to resume game - this triggers the pointerLockChange
    // handler which will close the settings menu
    renderer.renderer.domElement.requestPointerLock()
  },
  onChunkDistanceChange: () => {
    // Apply new render distance immediately
    worldGenerator.refreshChunks()
  },
})

const seaLevel = worldGenerator.getConfig().seaLevel

// Create physics system
const physicsWorld = new WorldPhysicsAdapter(world)
const physicsEngine = new PhysicsEngine(physicsWorld)

// Create player physics body at spawn position (above generated terrain)
const spawnPosition = new THREE.Vector3(0, seaLevel + 20, 0)
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

// Connect chunk meshes to renderer for frustum culling
renderer.setChunkMeshSource(() => world.getChunkMeshes())

// Queue chunk for background meshing when generation completes
world.onChunkGenerated((chunk) => {
  world.queueChunkForMeshing(chunk)
})

// Add world lighting (sun at 10am)
const lighting = new WorldLighting({ timeOfDay: 10 })
lighting.addTo(renderer.scene)

// Add skybox with sun positioned to match the directional light
const skybox = new Skybox()
skybox.setSunPosition(lighting.sun.position)
skybox.addTo(renderer.scene)

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
    },
  }
)

let frameCpuStart = 0
let lastTickCount = 0
let lastFrameTime = 0

const gameLoop = new GameLoop({
  update(deltaTime: number) {
    frameCpuStart = performance.now()
    cameraControls.update(deltaTime)
    physicsEngine.update(deltaTime)
    blockInteraction.update(deltaTime)

    // Update world generation based on camera position
    worldGenerator.update(
      renderer.camera.position.x,
      renderer.camera.position.z
    )

    // Update shadow camera to follow player
    lighting.updateShadowTarget(renderer.camera.position)

    // Keep skybox centered on camera so player can never leave it
    skybox.update(renderer.camera)
  },
  render() {
    renderer.render()
    // Measure total CPU time for update + render
    const cpuTime = performance.now() - frameCpuStart
    fpsCounter.update({
      deltaTime: lastFrameTime / 1000,
      cpuTime,
      tickCount: lastTickCount,
    })
  },
}, (metrics) => {
  lastTickCount = metrics.tickCount
  lastFrameTime = metrics.frameTime
})

// Settings input handler - shows/hides settings based on pointer lock state
// Created after gameLoop so we can control pause state
const settingsInput = new SettingsInputHandler({
  domElement: renderer.renderer.domElement,
  cameraControls,
  isInventoryOpen: () => inventoryUI.isOpen,
  openSettingsUI: () => settingsUI.open(),
  closeSettingsUI: () => settingsUI.close(),
  setGamePaused: (paused) => { gameLoop.paused = paused },
})

gameLoop.start()
