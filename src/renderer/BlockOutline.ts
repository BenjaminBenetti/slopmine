import * as THREE from 'three'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'

/** How far the outline sits outside the block's box (avoids z-fighting). */
const INFLATE = 0.004

/** Line width in CSS pixels (stays the same on high-DPI screens). */
const LINE_WIDTH = 2

/**
 * Thin dark wireframe box around the block the player is aiming at.
 * The unit-cube edges are scaled to the block's interaction box, so slabs,
 * torches, plants etc. get a fitted outline. Screen-space "fat" lines keep it
 * a constant 2px (plain GL lines are 1 device pixel - nearly invisible on
 * high-DPI screens); still a single instanced draw call.
 */
export class BlockOutline {
  private readonly lines: LineSegments2
  private readonly geometry: LineSegmentsGeometry
  private readonly material: LineMaterial
  private readonly scene: THREE.Scene
  private readonly renderer: THREE.WebGLRenderer
  private readonly size = new THREE.Vector2()

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.scene = scene
    this.renderer = renderer

    const box = new THREE.BoxGeometry(1, 1, 1)
    const edges = new THREE.EdgesGeometry(box)
    this.geometry = new LineSegmentsGeometry().fromEdgesGeometry(edges)
    edges.dispose()
    box.dispose()

    this.material = new LineMaterial({
      color: 0x000000,
      linewidth: LINE_WIDTH,
      transparent: true,
      opacity: 0.55,
      depthTest: true,
      depthWrite: false,
      // Pull the line quads slightly toward the camera so the block's own
      // faces never poke through them at grazing angles
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })

    this.lines = new LineSegments2(this.geometry, this.material)
    this.lines.visible = false
    this.lines.frustumCulled = false
    scene.add(this.lines)
  }

  /** Outline the given world-space box (typically a raycast hit's interactionBox). */
  show(box: THREE.Box3): void {
    const lines = this.lines
    lines.position.set(
      (box.min.x + box.max.x) / 2,
      (box.min.y + box.max.y) / 2,
      (box.min.z + box.max.z) / 2
    )
    lines.scale.set(
      box.max.x - box.min.x + INFLATE * 2,
      box.max.y - box.min.y + INFLATE * 2,
      box.max.z - box.min.z + INFLATE * 2
    )
    // Line width is resolved against the canvas' CSS size
    this.material.resolution.copy(this.renderer.getSize(this.size))
    lines.visible = true
  }

  hide(): void {
    this.lines.visible = false
  }

  dispose(): void {
    this.scene.remove(this.lines)
    this.geometry.dispose()
    this.material.dispose()
  }
}
