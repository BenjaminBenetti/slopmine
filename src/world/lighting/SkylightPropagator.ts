import type { Chunk } from '../chunks/Chunk.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT } from '../interfaces/IChunk.ts'
import { BlockIds } from '../blocks/BlockIds.ts'
import { getBlock } from '../blocks/BlockRegistry.ts'

interface LightNode {
  x: number
  y: number
  z: number
  level: number
}

/**
 * Handles skylight propagation for chunks.
 * Light starts at 15 at the sky and decreases as it travels through/around blocks.
 */
export class SkylightPropagator {
  /**
   * Calculate skylight for an entire chunk.
   * Call after terrain and caves are generated.
   */
  propagate(chunk: Chunk): void {
    // Phase 1: Initialize columns from sky down
    this.initializeColumns(chunk)

    // Phase 2: Spread light horizontally into caves
    this.spreadLight(chunk)
  }

  /**
   * Update lighting after a block change at the given position.
   * Used when player mines/places blocks.
   */
  updateAt(chunk: Chunk, x: number, y: number, z: number): void {
    // Check if this position now has sky access
    const hasSkyAccess = this.checkSkyAccess(chunk, x, y, z)

    if (hasSkyAccess) {
      // Light can flow down - recalculate column below
      this.propagateColumnDown(chunk, x, z, y)
    }

    // Spread light from neighbors into this position
    this.spreadFromNeighbors(chunk, x, y, z)
  }

  /**
   * Phase 1: Scan each column from top down.
   * Set skylight=15 until hitting an opaque block, then 0 below.
   */
  private initializeColumns(chunk: Chunk): void {
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        let skylight = 15

        // Scan from top down
        for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
          const blockId = chunk.getBlockId(x, y, z)

          if (blockId === BlockIds.AIR) {
            chunk.setSkylight(x, y, z, skylight)
          } else {
            const block = getBlock(blockId)
            const blocking = block.properties.lightBlocking

            // Reduce light based on block's light blocking
            skylight = Math.max(0, skylight - blocking)
            chunk.setSkylight(x, y, z, skylight)

            // If fully opaque, no more light below
            if (blocking >= 15) {
              // Fill rest of column with 0
              for (let yy = y - 1; yy >= 0; yy--) {
                chunk.setSkylight(x, yy, z, 0)
              }
              break
            }
          }
        }
      }
    }
  }

  /**
   * Phase 2: BFS flood-fill to spread light horizontally into caves.
   */
  private spreadLight(chunk: Chunk): void {
    const queue: LightNode[] = []

    // Find all light sources that can spread (blocks with light > 1 adjacent to darker blocks)
    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const light = chunk.getSkylight(x, y, z)
          if (light > 1) {
            // Check if any neighbor has lower light (potential spread target)
            if (this.hasLowerNeighbor(chunk, x, y, z, light)) {
              queue.push({ x, y, z, level: light })
            }
          }
        }
      }
    }

    // BFS propagation
    this.processQueue(chunk, queue)
  }

  /**
   * Process the light propagation queue.
   * Uses index-based iteration to avoid O(n) shift() calls.
   */
  private processQueue(chunk: Chunk, queue: LightNode[]): void {
    let head = 0

    while (head < queue.length) {
      const node = queue[head++]

      // Check all 6 neighbors
      // -X
      this.tryPropagate(chunk, queue, node.x - 1, node.y, node.z, node.level)
      // +X
      this.tryPropagate(chunk, queue, node.x + 1, node.y, node.z, node.level)
      // -Y
      this.tryPropagate(chunk, queue, node.x, node.y - 1, node.z, node.level)
      // +Y
      this.tryPropagate(chunk, queue, node.x, node.y + 1, node.z, node.level)
      // -Z
      this.tryPropagate(chunk, queue, node.x, node.y, node.z - 1, node.level)
      // +Z
      this.tryPropagate(chunk, queue, node.x, node.y, node.z + 1, node.level)
    }
  }

  /**
   * Try to propagate light to a neighbor position.
   */
  private tryPropagate(chunk: Chunk, queue: LightNode[], nx: number, ny: number, nz: number, sourceLevel: number): void {
    // Bounds check
    if (nx < 0 || nx >= CHUNK_SIZE_X) return
    if (nz < 0 || nz >= CHUNK_SIZE_Z) return
    if (ny < 0 || ny >= CHUNK_HEIGHT) return

    const blockId = chunk.getBlockId(nx, ny, nz)
    const block = getBlock(blockId)
    const blocking = block.properties.lightBlocking

    // Calculate new light level (decrease by 1 + blocking)
    const newLight = sourceLevel - 1 - blocking
    if (newLight <= 0) return

    const currentLight = chunk.getSkylight(nx, ny, nz)
    if (newLight > currentLight) {
      chunk.setSkylight(nx, ny, nz, newLight)
      queue.push({ x: nx, y: ny, z: nz, level: newLight })
    }
  }

  /**
   * Check if any neighbor has lower light than expected.
   */
  private hasLowerNeighbor(chunk: Chunk, x: number, y: number, z: number, light: number): boolean {
    const neighbors = [
      [x - 1, y, z],
      [x + 1, y, z],
      [x, y - 1, z],
      [x, y + 1, z],
      [x, y, z - 1],
      [x, y, z + 1],
    ]

    for (const [nx, ny, nz] of neighbors) {
      if (nx < 0 || nx >= CHUNK_SIZE_X) continue
      if (nz < 0 || nz >= CHUNK_SIZE_Z) continue
      if (ny < 0 || ny >= CHUNK_HEIGHT) continue

      if (chunk.getSkylight(nx, ny, nz) < light - 1) {
        return true
      }
    }
    return false
  }

  /**
   * Check if a position has direct sky access (no opaque blocks above).
   */
  private checkSkyAccess(chunk: Chunk, x: number, y: number, z: number): boolean {
    for (let yy = y; yy < CHUNK_HEIGHT; yy++) {
      const blockId = chunk.getBlockId(x, yy, z)
      if (blockId !== BlockIds.AIR) {
        const block = getBlock(blockId)
        if (block.properties.lightBlocking >= 15) {
          return false
        }
      }
    }
    return true
  }

  /**
   * Propagate light down a column from a given Y position.
   */
  private propagateColumnDown(chunk: Chunk, x: number, z: number, startY: number): void {
    let skylight = 15

    // Start from sky and go down to startY to get current light level
    for (let y = CHUNK_HEIGHT - 1; y >= startY; y--) {
      const blockId = chunk.getBlockId(x, y, z)
      if (blockId !== BlockIds.AIR) {
        const block = getBlock(blockId)
        skylight = Math.max(0, skylight - block.properties.lightBlocking)
        if (skylight === 0) break
      }
    }

    // Now propagate down from startY
    for (let y = startY; y >= 0; y--) {
      const blockId = chunk.getBlockId(x, y, z)
      chunk.setSkylight(x, y, z, skylight)

      if (blockId !== BlockIds.AIR) {
        const block = getBlock(blockId)
        skylight = Math.max(0, skylight - block.properties.lightBlocking)
        if (skylight === 0) {
          // Fill rest with 0
          for (let yy = y - 1; yy >= 0; yy--) {
            chunk.setSkylight(x, yy, z, 0)
          }
          break
        }
      }
    }
  }

  /**
   * Spread light from neighboring blocks into the given position.
   */
  private spreadFromNeighbors(chunk: Chunk, x: number, y: number, z: number): void {
    const queue: LightNode[] = []
    const neighbors = [
      [x - 1, y, z],
      [x + 1, y, z],
      [x, y - 1, z],
      [x, y + 1, z],
      [x, y, z - 1],
      [x, y, z + 1],
    ]

    // Find max light from neighbors
    for (const [nx, ny, nz] of neighbors) {
      if (nx < 0 || nx >= CHUNK_SIZE_X) continue
      if (nz < 0 || nz >= CHUNK_SIZE_Z) continue
      if (ny < 0 || ny >= CHUNK_HEIGHT) continue

      const neighborLight = chunk.getSkylight(nx, ny, nz)
      if (neighborLight > 1) {
        queue.push({ x: nx, y: ny, z: nz, level: neighborLight })
      }
    }

    // Process spreading from neighbors
    this.processQueue(chunk, queue)
  }
}
