import type { ISubChunkData } from '../interfaces/ISubChunkData.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SUB_CHUNK_HEIGHT } from '../interfaces/IChunk.ts'
import { getBlock } from '../blocks/BlockRegistry.ts'

interface LightNode {
  x: number
  y: number
  z: number
  level: number
}

/**
 * Light values from the boundary layer of a sub-chunk.
 * Used for cross-sub-chunk light propagation.
 */
export interface BlocklightBoundary {
  /** Stored blocklight values (0-15) at each x,z position for a given Y layer */
  values: Uint8Array // 32x32 = 1024 entries
}

/**
 * Handles blocklight propagation for sub-chunks.
 * Blocklight emanates from blocks with lightLevel > 0 (torches, lava, etc.)
 * and decreases by 1 per block traveled (plus lightBlocking of blocks).
 */
export class BlocklightPropagator {
  /**
   * Calculate blocklight for an individual sub-chunk.
   * Finds all light-emitting blocks and propagates outward.
   */
  propagateSubChunk(subChunk: ISubChunkData): void {
    const queue: LightNode[] = []

    // Phase 1: Find all light sources and initialize their blocklight
    for (let y = 0; y < SUB_CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const blockId = subChunk.getBlockId(x, y, z)
          const block = getBlock(blockId)
          const lightLevel = block.properties.lightLevel

          if (lightLevel > 0) {
            subChunk.setBlocklight(x, y, z, lightLevel)
            queue.push({ x, y, z, level: lightLevel })
          }
        }
      }
    }

    // Phase 2: BFS propagation
    this.processQueue(subChunk, queue)
  }

  /**
   * Propagate blocklight inward from chunk edges.
   * Call this when a chunk may have received light from neighbors that needs to spread.
   * Scans X=0, X=31, Z=0, Z=31 edges for light values and propagates them inward.
   */
  propagateFromEdges(subChunk: ISubChunkData): void {
    const queue: LightNode[] = []

    // Scan X edges
    for (let y = 0; y < SUB_CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        // X=0 edge - propagate inward if has light
        const light0 = subChunk.getBlocklight(0, y, z)
        if (light0 > 1) {
          queue.push({ x: 0, y, z, level: light0 })
        }
        // X=31 edge
        const light31 = subChunk.getBlocklight(CHUNK_SIZE_X - 1, y, z)
        if (light31 > 1) {
          queue.push({ x: CHUNK_SIZE_X - 1, y, z, level: light31 })
        }
      }
    }

    // Scan Z edges
    for (let y = 0; y < SUB_CHUNK_HEIGHT; y++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        // Z=0 edge
        const lightZ0 = subChunk.getBlocklight(x, y, 0)
        if (lightZ0 > 1) {
          queue.push({ x, y, z: 0, level: lightZ0 })
        }
        // Z=31 edge
        const lightZ31 = subChunk.getBlocklight(x, y, CHUNK_SIZE_Z - 1)
        if (lightZ31 > 1) {
          queue.push({ x, y, z: CHUNK_SIZE_Z - 1, level: lightZ31 })
        }
      }
    }

    if (queue.length > 0) {
      this.processQueue(subChunk, queue)
    }
  }

  /**
   * Process the light propagation queue.
   * Uses index-based iteration to avoid O(n) shift() calls.
   */
  private processQueue(subChunk: ISubChunkData, queue: LightNode[]): void {
    let head = 0

    while (head < queue.length) {
      const node = queue[head++]

      // Check all 6 neighbors
      this.tryPropagate(subChunk, queue, node.x - 1, node.y, node.z, node.level)
      this.tryPropagate(subChunk, queue, node.x + 1, node.y, node.z, node.level)
      this.tryPropagate(subChunk, queue, node.x, node.y - 1, node.z, node.level)
      this.tryPropagate(subChunk, queue, node.x, node.y + 1, node.z, node.level)
      this.tryPropagate(subChunk, queue, node.x, node.y, node.z - 1, node.level)
      this.tryPropagate(subChunk, queue, node.x, node.y, node.z + 1, node.level)
    }
  }

  /**
   * Try to propagate light to a neighbor position.
   */
  private tryPropagate(
    subChunk: ISubChunkData,
    queue: LightNode[],
    nx: number,
    ny: number,
    nz: number,
    sourceLevel: number
  ): void {
    // Bounds check
    if (nx < 0 || nx >= CHUNK_SIZE_X) return
    if (nz < 0 || nz >= CHUNK_SIZE_Z) return
    if (ny < 0 || ny >= SUB_CHUNK_HEIGHT) return

    const blockId = subChunk.getBlockId(nx, ny, nz)
    const block = getBlock(blockId)
    const blocking = block.properties.lightBlocking

    // Light decreases by 1 + blocking amount
    const newLevel = sourceLevel - 1 - blocking
    if (newLevel <= 0) return

    const currentLevel = subChunk.getBlocklight(nx, ny, nz)
    if (newLevel > currentLevel) {
      subChunk.setBlocklight(nx, ny, nz, newLevel)
      queue.push({ x: nx, y: ny, z: nz, level: newLevel })
    }
  }

  /**
   * Get blocklight values from the bottom layer of a sub-chunk.
   * Used to propagate light into the sub-chunk below.
   */
  getBottomBoundaryLight(subChunk: ISubChunkData): BlocklightBoundary {
    const values = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Z)

    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        const index = z * CHUNK_SIZE_X + x
        values[index] = subChunk.getBlocklight(x, 0, z)
      }
    }

    return { values }
  }

  /**
   * Get blocklight values from the top layer of a sub-chunk.
   * Used to propagate light into the sub-chunk above.
   */
  getTopBoundaryLight(subChunk: ISubChunkData): BlocklightBoundary {
    const values = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Z)
    const topY = SUB_CHUNK_HEIGHT - 1

    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        const index = z * CHUNK_SIZE_X + x
        values[index] = subChunk.getBlocklight(x, topY, z)
      }
    }

    return { values }
  }

  /**
   * Propagate blocklight from the sub-chunk above into the target sub-chunk.
   *
   * @param targetSubChunk The sub-chunk to update lighting in
   * @param aboveLight Light values from bottom of the sub-chunk above
   * @returns true if any light values changed
   */
  propagateFromAbove(targetSubChunk: ISubChunkData, aboveLight: BlocklightBoundary): boolean {
    const queue: LightNode[] = []
    let changed = false

    const topY = SUB_CHUNK_HEIGHT - 1

    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        const index = z * CHUNK_SIZE_X + x
        const incomingLight = aboveLight.values[index]
        if (incomingLight === 0) continue

        // Get block at top of this sub-chunk
        const blockId = targetSubChunk.getBlockId(x, topY, z)
        const block = getBlock(blockId)
        const blocking = block.properties.lightBlocking

        // Calculate light after passing through top block
        const newLevel = incomingLight - 1 - blocking
        if (newLevel <= 0) continue

        const currentLevel = targetSubChunk.getBlocklight(x, topY, z)

        if (newLevel > currentLevel) {
          targetSubChunk.setBlocklight(x, topY, z, newLevel)
          queue.push({ x, y: topY, z, level: newLevel })
          changed = true
        }
      }
    }

    // Propagate the incoming light further into the sub-chunk
    if (queue.length > 0) {
      this.processQueue(targetSubChunk, queue)
    }

    return changed
  }

  /**
   * Propagate blocklight from the sub-chunk below into the target sub-chunk.
   *
   * @param targetSubChunk The sub-chunk to update lighting in
   * @param belowLight Light values from top of the sub-chunk below
   * @returns true if any light values changed
   */
  propagateFromBelow(targetSubChunk: ISubChunkData, belowLight: BlocklightBoundary): boolean {
    const queue: LightNode[] = []
    let changed = false

    const bottomY = 0

    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        const index = z * CHUNK_SIZE_X + x
        const incomingLight = belowLight.values[index]
        if (incomingLight === 0) continue

        // Get block at bottom of this sub-chunk
        const blockId = targetSubChunk.getBlockId(x, bottomY, z)
        const block = getBlock(blockId)
        const blocking = block.properties.lightBlocking

        // Calculate light after passing through bottom block
        const newLevel = incomingLight - 1 - blocking
        if (newLevel <= 0) continue

        const currentLevel = targetSubChunk.getBlocklight(x, bottomY, z)

        if (newLevel > currentLevel) {
          targetSubChunk.setBlocklight(x, bottomY, z, newLevel)
          queue.push({ x, y: bottomY, z, level: newLevel })
          changed = true
        }
      }
    }

    // Propagate the incoming light further into the sub-chunk
    if (queue.length > 0) {
      this.processQueue(targetSubChunk, queue)
    }

    return changed
  }

  /**
   * Propagate blocklight from a neighboring sub-chunk across their shared horizontal edge.
   *
   * @param targetSubChunk The sub-chunk to update lighting in
   * @param sourceSubChunk The sub-chunk providing light
   * @param direction Which edge of target faces source: 'posX' | 'negX' | 'posZ' | 'negZ'
   * @returns true if any light values changed
   */
  propagateFromNeighborSubChunk(
    targetSubChunk: ISubChunkData,
    sourceSubChunk: ISubChunkData,
    direction: 'posX' | 'negX' | 'posZ' | 'negZ'
  ): boolean {
    const queue: LightNode[] = []
    let changed = false

    let sourceX: number, targetX: number
    let sourceZ: number, targetZ: number

    for (let y = 0; y < SUB_CHUNK_HEIGHT; y++) {
      if (direction === 'posX' || direction === 'negX') {
        // X-axis boundary
        sourceX = direction === 'posX' ? 0 : CHUNK_SIZE_X - 1
        targetX = direction === 'posX' ? CHUNK_SIZE_X - 1 : 0

        for (let z = 0; z < CHUNK_SIZE_Z; z++) {
          const sourceLight = sourceSubChunk.getBlocklight(sourceX, y, z)
          if (sourceLight > 0) {
            // Get block at target position
            const blockId = targetSubChunk.getBlockId(targetX, y, z)
            const block = getBlock(blockId)
            const blocking = block.properties.lightBlocking

            const newLevel = sourceLight - 1 - blocking
            if (newLevel <= 0) continue

            const currentLevel = targetSubChunk.getBlocklight(targetX, y, z)

            if (newLevel > currentLevel) {
              targetSubChunk.setBlocklight(targetX, y, z, newLevel)
              queue.push({ x: targetX, y, z, level: newLevel })
              changed = true
            }
          }
        }
      } else {
        // Z-axis boundary
        sourceZ = direction === 'posZ' ? 0 : CHUNK_SIZE_Z - 1
        targetZ = direction === 'posZ' ? CHUNK_SIZE_Z - 1 : 0

        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const sourceLight = sourceSubChunk.getBlocklight(x, y, sourceZ)
          if (sourceLight > 0) {
            // Get block at target position
            const blockId = targetSubChunk.getBlockId(x, y, targetZ)
            const block = getBlock(blockId)
            const blocking = block.properties.lightBlocking

            const newLevel = sourceLight - 1 - blocking
            if (newLevel <= 0) continue

            const currentLevel = targetSubChunk.getBlocklight(x, y, targetZ)

            if (newLevel > currentLevel) {
              targetSubChunk.setBlocklight(x, y, targetZ, newLevel)
              queue.push({ x, y, z: targetZ, level: newLevel })
              changed = true
            }
          }
        }
      }
    }

    // Propagate the edge light further into target sub-chunk
    if (queue.length > 0) {
      this.processQueue(targetSubChunk, queue)
    }

    return changed
  }

  /**
   * Propagate blocklight into a newly exposed position from neighboring blocks.
   * Called when a non-light-source block is removed and needs to receive light from neighbors.
   *
   * @param subChunk The sub-chunk containing the removed block
   * @param x Local X coordinate
   * @param y Local Y coordinate
   * @param z Local Z coordinate
   */
  propagateIntoExposedBlock(
    subChunk: ISubChunkData,
    x: number,
    y: number,
    z: number
  ): void {
    // Find max blocklight from neighbors and propagate from there
    const neighbors = [
      { nx: x - 1, ny: y, nz: z },
      { nx: x + 1, ny: y, nz: z },
      { nx: x, ny: y - 1, nz: z },
      { nx: x, ny: y + 1, nz: z },
      { nx: x, ny: y, nz: z - 1 },
      { nx: x, ny: y, nz: z + 1 },
    ]

    let maxNeighborLight = 0

    for (const { nx, ny, nz } of neighbors) {
      if (nx < 0 || nx >= CHUNK_SIZE_X) continue
      if (nz < 0 || nz >= CHUNK_SIZE_Z) continue
      if (ny < 0 || ny >= SUB_CHUNK_HEIGHT) continue

      const neighborLight = subChunk.getBlocklight(nx, ny, nz)
      if (neighborLight > maxNeighborLight) {
        maxNeighborLight = neighborLight
      }
    }

    if (maxNeighborLight > 1) {
      // Set light at this position (reduced by 1 from neighbor)
      const newLight = maxNeighborLight - 1
      subChunk.setBlocklight(x, y, z, newLight)

      // Propagate further from this position
      const queue: LightNode[] = [{ x, y, z, level: newLight }]
      this.processQueue(subChunk, queue)
    }
  }

  /**
   * Clear blocklight at a position and recalculate from neighbors.
   * Used when a light source is removed.
   *
   * @param subChunk The sub-chunk containing the removed light source
   * @param x Local X coordinate
   * @param y Local Y coordinate
   * @param z Local Z coordinate
   * @param oldLightLevel The light level that was removed
   */
  clearAndRecalculate(
    subChunk: ISubChunkData,
    x: number,
    y: number,
    z: number,
    oldLightLevel: number
  ): void {
    // Clear all light that could have come from this source using BFS
    const clearQueue: LightNode[] = [{ x, y, z, level: oldLightLevel }]
    const relightQueue: LightNode[] = []
    let head = 0

    subChunk.setBlocklight(x, y, z, 0)

    while (head < clearQueue.length) {
      const node = clearQueue[head++]

      const neighbors = [
        { nx: node.x - 1, ny: node.y, nz: node.z },
        { nx: node.x + 1, ny: node.y, nz: node.z },
        { nx: node.x, ny: node.y - 1, nz: node.z },
        { nx: node.x, ny: node.y + 1, nz: node.z },
        { nx: node.x, ny: node.y, nz: node.z - 1 },
        { nx: node.x, ny: node.y, nz: node.z + 1 },
      ]

      for (const { nx, ny, nz } of neighbors) {
        if (nx < 0 || nx >= CHUNK_SIZE_X) continue
        if (nz < 0 || nz >= CHUNK_SIZE_Z) continue
        if (ny < 0 || ny >= SUB_CHUNK_HEIGHT) continue

        const neighborLight = subChunk.getBlocklight(nx, ny, nz)

        if (neighborLight > 0 && neighborLight < node.level) {
          // This light could have come from the removed source - clear it
          subChunk.setBlocklight(nx, ny, nz, 0)
          clearQueue.push({ x: nx, y: ny, z: nz, level: neighborLight })
        } else if (neighborLight >= node.level) {
          // This light came from another source - add to relight queue
          relightQueue.push({ x: nx, y: ny, z: nz, level: neighborLight })
        }
      }
    }

    // Repropagate from remaining light sources
    this.processQueue(subChunk, relightQueue)
  }

  /**
   * Clear blocklight at a chunk boundary that may have come from a neighbor chunk.
   * Used when a light source is removed in the neighboring chunk.
   * Uses BFS to clear light that could have propagated from the neighbor.
   *
   * @param targetSubChunk The sub-chunk to clear light from
   * @param sourceSubChunk The neighboring sub-chunk (light source was removed here)
   * @param direction Which edge of target faces source: 'posX' | 'negX' | 'posZ' | 'negZ'
   * @returns true if any light values changed
   */
  clearFromNeighborSubChunk(
    targetSubChunk: ISubChunkData,
    sourceSubChunk: ISubChunkData,
    direction: 'posX' | 'negX' | 'posZ' | 'negZ'
  ): boolean {
    const clearQueue: LightNode[] = []
    const relightQueue: LightNode[] = []
    let changed = false

    let sourceX: number, targetX: number
    let sourceZ: number, targetZ: number

    // Find edge positions where target has light but source no longer supports it
    for (let y = 0; y < SUB_CHUNK_HEIGHT; y++) {
      if (direction === 'posX' || direction === 'negX') {
        sourceX = direction === 'posX' ? 0 : CHUNK_SIZE_X - 1
        targetX = direction === 'posX' ? CHUNK_SIZE_X - 1 : 0

        for (let z = 0; z < CHUNK_SIZE_Z; z++) {
          const sourceLight = sourceSubChunk.getBlocklight(sourceX, y, z)
          const targetLight = targetSubChunk.getBlocklight(targetX, y, z)

          // Only clear if source is completely dark but target has light
          // This handles the case where a light source was removed in the source chunk
          // We don't clear if source still has light, because:
          // 1. The target's light might come from target's own sources (not from source)
          // 2. If targetLight > sourceLight, it definitely didn't come from source
          if (targetLight > 0 && sourceLight === 0) {
            // Clear this edge position and queue for BFS clearing
            targetSubChunk.setBlocklight(targetX, y, z, 0)
            clearQueue.push({ x: targetX, y, z, level: targetLight })
            changed = true
          }
        }
      } else {
        sourceZ = direction === 'posZ' ? 0 : CHUNK_SIZE_Z - 1
        targetZ = direction === 'posZ' ? CHUNK_SIZE_Z - 1 : 0

        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const sourceLight = sourceSubChunk.getBlocklight(x, y, sourceZ)
          const targetLight = targetSubChunk.getBlocklight(x, y, targetZ)

          // Only clear if source is completely dark but target has light
          if (targetLight > 0 && sourceLight === 0) {
            targetSubChunk.setBlocklight(x, y, targetZ, 0)
            clearQueue.push({ x, y, z: targetZ, level: targetLight })
            changed = true
          }
        }
      }
    }

    // BFS to clear light that propagated from the edge
    let head = 0
    while (head < clearQueue.length) {
      const node = clearQueue[head++]

      const neighbors = [
        { nx: node.x - 1, ny: node.y, nz: node.z },
        { nx: node.x + 1, ny: node.y, nz: node.z },
        { nx: node.x, ny: node.y - 1, nz: node.z },
        { nx: node.x, ny: node.y + 1, nz: node.z },
        { nx: node.x, ny: node.y, nz: node.z - 1 },
        { nx: node.x, ny: node.y, nz: node.z + 1 },
      ]

      for (const { nx, ny, nz } of neighbors) {
        if (nx < 0 || nx >= CHUNK_SIZE_X) continue
        if (nz < 0 || nz >= CHUNK_SIZE_Z) continue
        if (ny < 0 || ny >= SUB_CHUNK_HEIGHT) continue

        const neighborLight = targetSubChunk.getBlocklight(nx, ny, nz)

        if (neighborLight > 0 && neighborLight < node.level) {
          // This light could have come from the cleared edge - clear it
          targetSubChunk.setBlocklight(nx, ny, nz, 0)
          clearQueue.push({ x: nx, y: ny, z: nz, level: neighborLight })
          changed = true
        } else if (neighborLight >= node.level) {
          // This light came from another source - add to relight queue
          relightQueue.push({ x: nx, y: ny, z: nz, level: neighborLight })
        }
      }
    }

    // Re-propagate from remaining light sources
    if (relightQueue.length > 0) {
      this.processQueue(targetSubChunk, relightQueue)
    }

    return changed
  }
}
