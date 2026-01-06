import * as THREE from 'three'
import type { OrePosition } from '../world/generate/features/OreFeature.ts'
import { BlockIds } from '../world/blocks/BlockIds.ts'
import type { ISubChunkCoordinate } from '../world/interfaces/ICoordinates.ts'
import { createSubChunkKey, type SubChunkKey } from '../world/interfaces/ICoordinates.ts'

/**
 * Color mapping for different ore types.
 */
const ORE_COLORS: Record<number, number> = {
  [BlockIds.COAL_BLOCK]: 0x333333,     // Dark gray for coal
  [BlockIds.IRON_BLOCK]: 0xd4af37,     // Tan/brown for iron
  [BlockIds.COPPER_BLOCK]: 0xff8c00,   // Orange for copper
  [BlockIds.GOLD_BLOCK]: 0xffd700,     // Gold
  [BlockIds.DIAMOND_BLOCK]: 0x00ffff,  // Cyan for diamond
}

/**
 * Manages debug wireframe boxes around ore blocks.
 * Wireframes are color-coded by ore type and rendered without depth testing
 * so they're visible through terrain.
 */
export class OreWireframeManager {
  private readonly scene: THREE.Scene
  private readonly wireframesBySubChunk: Map<SubChunkKey, THREE.Group> = new Map()
  private readonly materials: Map<number, THREE.LineBasicMaterial> = new Map()
  private readonly geometry: THREE.EdgesGeometry
  private visible = false

  constructor(scene: THREE.Scene) {
    this.scene = scene

    // Create shared geometry for 1x1x1 block wireframes
    const boxGeometry = new THREE.BoxGeometry(1, 1, 1)
    this.geometry = new THREE.EdgesGeometry(boxGeometry)
    boxGeometry.dispose()

    // Create materials for each ore type (no depth test = always on top)
    for (const [blockId, color] of Object.entries(ORE_COLORS)) {
      const material = new THREE.LineBasicMaterial({
        color,
        depthTest: false,  // Always render on top
        depthWrite: false,
        transparent: true,
        opacity: 0.8,
      })
      this.materials.set(Number(blockId), material)
    }
  }

  /**
   * Add ore wireframes for a sub-chunk.
   */
  addOresForSubChunk(coordinate: ISubChunkCoordinate, orePositions: OrePosition[]): void {
    const key = createSubChunkKey(coordinate.x, coordinate.z, coordinate.subY)

    // Remove existing wireframes for this sub-chunk
    this.removeOresForSubChunk(coordinate)

    if (orePositions.length === 0) return

    // Create a group to hold all wireframes for this sub-chunk
    const group = new THREE.Group()
    group.visible = this.visible
    group.renderOrder = 1000 // Render after chunk wireframes

    // Create a wireframe for each ore position
    for (const pos of orePositions) {
      const material = this.materials.get(pos.blockId)
      if (!material) continue

      const wireframe = new THREE.LineSegments(this.geometry, material)
      // Position at block center (blocks are at integer positions)
      wireframe.position.set(pos.x + 0.5, pos.y + 0.5, pos.z + 0.5)
      wireframe.renderOrder = 1000
      group.add(wireframe)
    }

    this.scene.add(group)
    this.wireframesBySubChunk.set(key, group)
  }

  /**
   * Remove ore wireframes for a sub-chunk.
   */
  removeOresForSubChunk(coordinate: ISubChunkCoordinate): void {
    const key = createSubChunkKey(coordinate.x, coordinate.z, coordinate.subY)
    const group = this.wireframesBySubChunk.get(key)
    if (group) {
      this.scene.remove(group)
      // Dispose children
      for (const child of group.children) {
        if (child instanceof THREE.LineSegments) {
          // Geometry is shared, don't dispose
        }
      }
      this.wireframesBySubChunk.delete(key)
    }
  }

  /**
   * Set visibility of all ore wireframes.
   */
  setVisible(visible: boolean): void {
    this.visible = visible
    for (const group of this.wireframesBySubChunk.values()) {
      group.visible = visible
    }
  }

  /**
   * Check if wireframes are currently visible.
   */
  isVisible(): boolean {
    return this.visible
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    for (const group of this.wireframesBySubChunk.values()) {
      this.scene.remove(group)
    }
    this.wireframesBySubChunk.clear()
    this.geometry.dispose()
    for (const material of this.materials.values()) {
      material.dispose()
    }
    this.materials.clear()
  }
}
