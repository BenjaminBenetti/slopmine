import * as THREE from 'three'

/**
 * Visual overlay that darkens a block during mining.
 * Uses a semi-transparent box mesh that increases opacity as mining progresses.
 * Supports custom-sized hitboxes for blocks like ladders, torches, and flowers.
 */
export class MiningOverlay {
  private readonly scene: THREE.Scene
  private overlayMesh: THREE.Mesh | null = null
  private material: THREE.MeshBasicMaterial | null = null
  private geometry: THREE.BoxGeometry | null = null

  // Track current box dimensions to avoid recreating geometry unnecessarily
  private currentSizeX = 0
  private currentSizeY = 0
  private currentSizeZ = 0

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  /**
   * Show or update the overlay for the given interaction box.
   * @param box - Interaction box in world space
   * @param progress - Mining progress from 0.0 to 1.0
   */
  showBox(box: THREE.Box3, progress: number): void {
    // Calculate box dimensions
    const sizeX = box.max.x - box.min.x
    const sizeY = box.max.y - box.min.y
    const sizeZ = box.max.z - box.min.z

    // Calculate center position
    const centerX = (box.min.x + box.max.x) / 2
    const centerY = (box.min.y + box.max.y) / 2
    const centerZ = (box.min.z + box.max.z) / 2

    // Create or update geometry if size changed
    if (!this.overlayMesh || !this.sizeMatches(sizeX, sizeY, sizeZ)) {
      this.createOverlayMesh(sizeX, sizeY, sizeZ)
    }

    if (!this.overlayMesh || !this.material) return

    // Position at box center
    this.overlayMesh.position.set(centerX, centerY, centerZ)

    // Increase opacity based on progress (max 70% opacity)
    this.material.opacity = Math.min(progress * 0.7, 0.7)

    this.overlayMesh.visible = true
  }

  /**
   * Show or update the overlay at the given block position (legacy full-cube API).
   * @param x - World X coordinate of the block
   * @param y - World Y coordinate of the block
   * @param z - World Z coordinate of the block
   * @param progress - Mining progress from 0.0 to 1.0
   * @deprecated Use showBox() for custom hitbox support
   */
  show(x: number, y: number, z: number, progress: number): void {
    // Create a full-cube box at the given position
    const box = new THREE.Box3(
      new THREE.Vector3(x, y, z),
      new THREE.Vector3(x + 1, y + 1, z + 1)
    )
    this.showBox(box, progress)
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
   * Check if current geometry matches the requested size (with tolerance).
   */
  private sizeMatches(sizeX: number, sizeY: number, sizeZ: number): boolean {
    const tolerance = 0.001
    return (
      Math.abs(this.currentSizeX - sizeX) < tolerance &&
      Math.abs(this.currentSizeY - sizeY) < tolerance &&
      Math.abs(this.currentSizeZ - sizeZ) < tolerance
    )
  }

  /**
   * Create the overlay mesh with specified dimensions.
   */
  private createOverlayMesh(sizeX: number, sizeY: number, sizeZ: number): void {
    // Dispose old geometry if exists
    if (this.geometry) {
      this.geometry.dispose()
    }

    // Store current size
    this.currentSizeX = sizeX
    this.currentSizeY = sizeY
    this.currentSizeZ = sizeZ

    // Slightly larger than actual size to fully cover without z-fighting
    const padding = 0.002
    this.geometry = new THREE.BoxGeometry(
      sizeX + padding,
      sizeY + padding,
      sizeZ + padding
    )

    if (!this.material) {
      this.material = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0,
        depthTest: true,
        depthWrite: false,
        side: THREE.FrontSide,
      })
    }

    if (this.overlayMesh) {
      this.scene.remove(this.overlayMesh)
    }

    this.overlayMesh = new THREE.Mesh(this.geometry, this.material)
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
      this.overlayMesh = null
    }

    if (this.geometry) {
      this.geometry.dispose()
      this.geometry = null
    }

    if (this.material) {
      this.material.dispose()
      this.material = null
    }
  }
}
