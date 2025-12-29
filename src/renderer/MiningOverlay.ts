import * as THREE from 'three'

/**
 * Visual overlay that darkens a block during mining.
 * Uses a semi-transparent box mesh that increases opacity as mining progresses.
 */
export class MiningOverlay {
  private readonly scene: THREE.Scene
  private overlayMesh: THREE.Mesh | null = null
  private material: THREE.MeshBasicMaterial | null = null

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  /**
   * Show or update the overlay at the given block position.
   * @param x - World X coordinate of the block
   * @param y - World Y coordinate of the block
   * @param z - World Z coordinate of the block
   * @param progress - Mining progress from 0.0 to 1.0
   */
  show(x: number, y: number, z: number, progress: number): void {
    if (!this.overlayMesh) {
      this.createOverlayMesh()
    }

    if (!this.overlayMesh || !this.material) return

    // Position at block center (blocks are rendered offset by 0.5)
    this.overlayMesh.position.set(x + 0.5, y + 0.5, z + 0.5)

    // Increase opacity based on progress (max 70% opacity)
    this.material.opacity = Math.min(progress * 0.7, 0.7)

    this.overlayMesh.visible = true
  }

  /**
   * Hide the overlay.
   */
  hide(): void {
    if (this.overlayMesh) {
      this.overlayMesh.visible = false
    }
  }

  /**
   * Create the overlay mesh.
   */
  private createOverlayMesh(): void {
    // Slightly larger than 1x1x1 to fully cover the block without z-fighting
    const geometry = new THREE.BoxGeometry(1.002, 1.002, 1.002)

    this.material = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false,
      side: THREE.FrontSide,
    })

    this.overlayMesh = new THREE.Mesh(geometry, this.material)
    this.overlayMesh.visible = false
    this.overlayMesh.renderOrder = 1 // Render after blocks

    this.scene.add(this.overlayMesh)
  }

  /**
   * Dispose of the overlay resources.
   */
  dispose(): void {
    if (this.overlayMesh) {
      this.scene.remove(this.overlayMesh)
      this.overlayMesh.geometry.dispose()
      this.overlayMesh = null
    }

    if (this.material) {
      this.material.dispose()
      this.material = null
    }
  }
}
