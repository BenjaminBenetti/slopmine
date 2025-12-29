import { GameLoop } from './core/GameLoop.ts'
import { Renderer } from './renderer/Renderer.ts'
import { WorldLighting } from './renderer/WorldLighting.ts'
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

// Create world and place blocks
const world = new WorldManager()
world.loadChunk({ x: 0n, z: 0n })

// Place 5 blocks in the world
world.setBlock(0n, 0n, 0n, BlockIds.STONE)
world.setBlock(1n, 0n, 0n, BlockIds.DIRT)
world.setBlock(2n, 0n, 0n, BlockIds.GRASS)
world.setBlock(3n, 0n, 0n, BlockIds.OAK_LOG)
world.setBlock(4n, 0n, 0n, BlockIds.OAK_LEAVES)

// Render the world blocks to the scene
world.render(renderer.scene)

// Add world lighting (sun at 10am)
const lighting = new WorldLighting({ timeOfDay: 10 })
lighting.addTo(renderer.scene)

let frameCpuStart = 0
let frameDeltaTime = 0

const gameLoop = new GameLoop({
  update(deltaTime: number) {
    frameCpuStart = performance.now()
    frameDeltaTime = deltaTime
    cameraControls.update(deltaTime)
  },
  render() {
    renderer.render()
    // Measure total CPU time for update + render
    const cpuTime = performance.now() - frameCpuStart
    fpsCounter.update({ deltaTime: frameDeltaTime, cpuTime })
  },
})

gameLoop.start()
