import * as THREE from 'three'
import { GameLoop } from './core/GameLoop.ts'
import { Renderer } from './renderer/Renderer.ts'
import {
  FirstPersonCameraControls,
} from './player/FirstPersonCameraControls.ts'

const renderer = new Renderer()

// First-person camera controls
const cameraControls = new FirstPersonCameraControls(
  renderer.camera,
  renderer.renderer.domElement,
  {
    movementSpeed: 8,
    lookSensitivity: 0.002,
  }
)

// Create a simple cube for testing
const geometry = new THREE.BoxGeometry(1, 1, 1)
const material = new THREE.MeshNormalMaterial()
const cube = new THREE.Mesh(geometry, material)
renderer.scene.add(cube)

// Add some ambient light
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
renderer.scene.add(ambientLight)

const gameLoop = new GameLoop({
  update(deltaTime: number) {
    cameraControls.update(deltaTime)

    // Simple cube animation to show movement relative to the world
    cube.rotation.x += deltaTime
    cube.rotation.y += deltaTime * 0.7
  },
  render() {
    renderer.render()
  },
})

gameLoop.start()
