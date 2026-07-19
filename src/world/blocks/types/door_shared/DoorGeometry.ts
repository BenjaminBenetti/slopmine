import * as THREE from 'three'

/**
 * Shared door panel geometry for all wood door variants.
 *
 * Geometry is centered around Y=0 (the renderer adds +0.5) and around X/Z=0,
 * so the cell spans [-0.5, 0.5] on each axis. Front faces +Z (SOUTH =
 * identity rotation); yaw facing rotation is applied by the non-greedy
 * instanced render path.
 */

/** Panel spans this range on its thin axis (flush with the +Z front edge when closed). */
const PANEL_MIN = 0.31
const PANEL_MAX = 0.5
const PANEL_THICKNESS = PANEL_MAX - PANEL_MIN
const PANEL_CENTER = (PANEL_MIN + PANEL_MAX) / 2

/**
 * Closed door panel: full X/Y, thin in Z, hugging the +Z front edge
 * (z in [0.31, 0.5] in centered local coordinates).
 */
export const doorClosedGeometry = new THREE.BoxGeometry(1, 1, PANEL_THICKNESS)
  .translate(0, 0, PANEL_CENTER)

/**
 * Open door panel: swung to the side - full Z/Y, thin in X
 * (x in [0.31, 0.5] in centered local coordinates).
 */
export const doorOpenGeometry = new THREE.BoxGeometry(PANEL_THICKNESS, 1, 1)
  .translate(PANEL_CENTER, 0, 0)
