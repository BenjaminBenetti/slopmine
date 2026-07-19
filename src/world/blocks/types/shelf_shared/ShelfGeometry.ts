import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Shelf dimensions - shared by all wood variants.
// Geometry is centered around Y=0 (renderer adds +0.5); front faces +Z
// (SOUTH = identity rotation). The board hugs the -Z back edge (wall side)
// and sits flush with the TOP of the cell, so a block placed in the cell
// above rests visually on the shelf surface.
const BOARD_THICKNESS = 0.12 // Board: y 0.38..0.5 (top flush with cell top)
const BOARD_DEPTH = 0.88 // Board: z -0.5..0.38 (slight front inset)
const BRACKET_WIDTH = 0.08 // Support bracket thickness along X
const BRACKET_HEIGHT = 0.3 // Brackets: y 0.08..0.38
const BRACKET_DEPTH = 0.28 // Brackets: z -0.5..-0.22
const BRACKET_X_OFFSET = 0.35 // Bracket centers at x +-0.35

/**
 * Build the shelf geometry: a top-of-cell board with two support brackets
 * against the wall.
 * - Board: full X width, y in [0.38, 0.5], z in [-0.5, 0.38]
 * - Brackets: 0.08 wide, under the board at x +-0.35,
 *   y in [0.08, 0.38], z in [-0.5, -0.22]
 */
function buildShelfGeometry(): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = []

  // Board (y 0.38..0.5, full X, z -0.5..0.38)
  const board = new THREE.BoxGeometry(1, BOARD_THICKNESS, BOARD_DEPTH)
  board.translate(0, 0.5 - BOARD_THICKNESS / 2, -0.5 + BOARD_DEPTH / 2)
  geometries.push(board)

  // Two support brackets under the board, against the wall side
  for (const sx of [-1, 1]) {
    const bracket = new THREE.BoxGeometry(BRACKET_WIDTH, BRACKET_HEIGHT, BRACKET_DEPTH)
    bracket.translate(
      sx * BRACKET_X_OFFSET,
      0.5 - BOARD_THICKNESS - BRACKET_HEIGHT / 2,
      -0.5 + BRACKET_DEPTH / 2
    )
    geometries.push(bracket)
  }

  return mergeGeometries(geometries, false)
}

/**
 * Shared shelf geometry singleton used by all wood shelf variants.
 */
export const shelfGeometry = buildShelfGeometry()

/**
 * Local Y of the top surface of the shelf board (flush with the cell top).
 * Display items rest on top of this.
 */
export const SHELF_BOARD_TOP_Y = 0.5
