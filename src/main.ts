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
import { createCrosshairUI } from './ui/Crosshair.ts'
import { createToolbarUI } from './ui/Toolbar.ts'
import { createInventoryUI } from './ui/Inventory.ts'
import { createFpsCounterUI } from './ui/FpsCounter.ts'
import {
  WorldManager,
  registerDefaultBlocks,
  BlockIds,
} from './world/index.ts'
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
  cameraControls,
)

// Create world and load a 3x3 grid of chunks
const world = new WorldManager()
for (let cx = -1n; cx <= 1n; cx++) {
  for (let cz = -1n; cz <= 1n; cz++) {
    world.loadChunk({ x: cx, z: cz })
  }
}

// Create a grass testing plane centered roughly on player
// Plane is 64x64 blocks, from -32 to 31 on x and z, at y=0
world.fillRegion(-32n, 0n, -32n, 31n, 0n, 31n, BlockIds.GRASS)

// Create physics system
const physicsWorld = new WorldPhysicsAdapter(world)
const physicsEngine = new PhysicsEngine(physicsWorld)

// Create player physics body at spawn position (above the grass plane)
const spawnPosition = new THREE.Vector3(0, 5, 0)
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

// Render the world blocks to the scene
world.render(renderer.scene)

// Add world lighting (sun at 10am)
const lighting = new WorldLighting({ timeOfDay: 10 })
lighting.addTo(renderer.scene)

// Add skybox with sun positioned to match the directional light
const skybox = new Skybox()
skybox.setSunPosition(lighting.sun.position)
skybox.addTo(renderer.scene)

let frameCpuStart = 0
let frameDeltaTime = 0

const gameLoop = new GameLoop({
  update(deltaTime: number) {
    frameCpuStart = performance.now()
    frameDeltaTime = deltaTime
    cameraControls.update(deltaTime)
    physicsEngine.update(deltaTime)
  },
  render() {
    renderer.render()
    // Measure total CPU time for update + render
    const cpuTime = performance.now() - frameCpuStart
    fpsCounter.update({ deltaTime: frameDeltaTime, cpuTime })
  },
})

gameLoop.start()
