import * as THREE from 'three'
import { GameLoop } from './core/GameLoop.ts'
import { Renderer } from './renderer/Renderer.ts'
import {
	  FirstPersonCameraControls,
	} from './player/FirstPersonCameraControls.ts'
import { PlayerState } from './player/PlayerState.ts'
import { ToolbarInputHandler } from './player/ToolbarInput.ts'
import { InventoryInputHandler } from './player/InventoryInput.ts'
import { createCrosshairUI } from './ui/Crosshair.ts'
import { createToolbarUI } from './ui/Toolbar.ts'
import { createInventoryUI } from './ui/Inventory.ts'
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

// UI overlays (crosshair + hotbar) rendered above the canvas
createCrosshairUI()
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

// Place 3 blocks in the world
world.setBlock(0n, 0n, 0n, BlockIds.STONE)
world.setBlock(1n, 0n, 0n, BlockIds.DIRT)
world.setBlock(2n, 0n, 0n, BlockIds.GRASS)

// Render the world blocks to the scene
world.render(renderer.scene)

// Add lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
renderer.scene.add(ambientLight)

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
directionalLight.position.set(5, 10, 5)
renderer.scene.add(directionalLight)

const gameLoop = new GameLoop({
  update(deltaTime: number) {
    cameraControls.update(deltaTime)
  },
  render() {
    renderer.render()
  },
})

gameLoop.start()
