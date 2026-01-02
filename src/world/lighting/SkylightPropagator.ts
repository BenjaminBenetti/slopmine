import type { IChunkData } from '../interfaces/IChunkData.ts'
import type { ISubChunkData } from '../interfaces/ISubChunkData.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT, SUB_CHUNK_HEIGHT, SUB_CHUNK_COUNT } from '../interfaces/IChunk.ts'
import { BlockIds } from '../blocks/BlockIds.ts'
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
export interface BoundaryLight {
  /** Stored light values (0-15) at each x,z position */
  values: Uint8Array // 32x32 = 1024 entries
}

// Internal light scale (0-30) for slower falloff
// Light decreases by 1 per block internally, stored as floor(level/2) giving 0-15
// This doubles the effective travel distance of light
const INTERNAL_MAX_LIGHT = 30
const LIGHT_SCALE = 2

/**
 * Handles skylight propagation for chunks.
 * Light starts at max at the sky and decreases as it travels through/around blocks.
 * Uses internal 0-30 scale for gentler falloff, stored as 0-15.
 */
export class SkylightPropagator {
  /**
   * Calculate skylight for an entire chunk.
   * Call after terrain and caves are generated.
   */
  propagate(chunk: IChunkData): void {
    // Phase 1: Initialize columns from sky down
    this.initializeColumns(chunk)

    // Phase 2: Spread light horizontally into caves
    this.spreadLight(chunk)
  }

  /**
   * Update lighting after a block change at the given position.
   * Used when player mines/places blocks.
   */
  updateAt(chunk: IChunkData, x: number, y: number, z: number): void {
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
   * Uses internal 0-30 scale, stores as 0-15.
   */
  private initializeColumns(chunk: IChunkData): void {
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        let skylight = INTERNAL_MAX_LIGHT // 30 internally

        // Scan from top down
        for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
          const blockId = chunk.getBlockId(x, y, z)

          if (blockId === BlockIds.AIR) {
            // Store as 0-15 (divide by scale)
            chunk.setSkylight(x, y, z, Math.floor(skylight / LIGHT_SCALE))
          } else {
            const block = getBlock(blockId)
            const blocking = block.properties.lightBlocking

            // Reduce light based on block's light blocking (scaled)
            skylight = Math.max(0, skylight - blocking * LIGHT_SCALE)
            chunk.setSkylight(x, y, z, Math.floor(skylight / LIGHT_SCALE))

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
   * Works with internal 0-30 scale for slower falloff.
   */
  private spreadLight(chunk: IChunkData): void {
    const queue: LightNode[] = []

    // Find all light sources that can spread (blocks with light > 0 adjacent to darker blocks)
    // Convert stored 0-15 to internal 0-30 scale
    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const storedLight = chunk.getSkylight(x, y, z)
          if (storedLight > 0) {
            const internalLight = storedLight * LIGHT_SCALE
            // Check if any neighbor has lower light (potential spread target)
            if (this.hasLowerNeighbor(chunk, x, y, z, storedLight)) {
              queue.push({ x, y, z, level: internalLight })
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
  private processQueue(chunk: IChunkData, queue: LightNode[]): void {
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
   * sourceLevel is in internal 0-30 scale.
   */
  private tryPropagate(chunk: IChunkData, queue: LightNode[], nx: number, ny: number, nz: number, sourceLevel: number): void {
    // Bounds check
    if (nx < 0 || nx >= CHUNK_SIZE_X) return
    if (nz < 0 || nz >= CHUNK_SIZE_Z) return
    if (ny < 0 || ny >= CHUNK_HEIGHT) return

    const blockId = chunk.getBlockId(nx, ny, nz)
    const block = getBlock(blockId)
    const blocking = block.properties.lightBlocking

    // Calculate new internal light level (decrease by 1 + scaled blocking)
    const newInternalLight = sourceLevel - 1 - blocking * LIGHT_SCALE
    if (newInternalLight <= 0) return

    // Convert to stored value (0-15)
    const newStoredLight = Math.floor(newInternalLight / LIGHT_SCALE)
    const currentStoredLight = chunk.getSkylight(nx, ny, nz)

    if (newStoredLight > currentStoredLight) {
      chunk.setSkylight(nx, ny, nz, newStoredLight)
      queue.push({ x: nx, y: ny, z: nz, level: newInternalLight })
    }
  }

  /**
   * Check if any neighbor has lower light than expected.
   */
  private hasLowerNeighbor(chunk: IChunkData, x: number, y: number, z: number, light: number): boolean {
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
  private checkSkyAccess(chunk: IChunkData, x: number, y: number, z: number): boolean {
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
   * Uses internal 0-30 scale for slower falloff.
   */
  private propagateColumnDown(chunk: IChunkData, x: number, z: number, startY: number): void {
    let skylight = INTERNAL_MAX_LIGHT

    // Start from sky and go down to startY to get current light level
    for (let y = CHUNK_HEIGHT - 1; y >= startY; y--) {
      const blockId = chunk.getBlockId(x, y, z)
      if (blockId !== BlockIds.AIR) {
        const block = getBlock(blockId)
        skylight = Math.max(0, skylight - block.properties.lightBlocking * LIGHT_SCALE)
        if (skylight === 0) break
      }
    }

    // Now propagate down from startY
    for (let y = startY; y >= 0; y--) {
      const blockId = chunk.getBlockId(x, y, z)
      chunk.setSkylight(x, y, z, Math.floor(skylight / LIGHT_SCALE))

      if (blockId !== BlockIds.AIR) {
        const block = getBlock(blockId)
        skylight = Math.max(0, skylight - block.properties.lightBlocking * LIGHT_SCALE)
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
   * Uses internal 0-30 scale for slower falloff.
   */
  private spreadFromNeighbors(chunk: IChunkData, x: number, y: number, z: number): void {
    const queue: LightNode[] = []
    const neighbors = [
      [x - 1, y, z],
      [x + 1, y, z],
      [x, y - 1, z],
      [x, y + 1, z],
      [x, y, z - 1],
      [x, y, z + 1],
    ]

    // Find max light from neighbors (convert stored 0-15 to internal 0-30)
    for (const [nx, ny, nz] of neighbors) {
      if (nx < 0 || nx >= CHUNK_SIZE_X) continue
      if (nz < 0 || nz >= CHUNK_SIZE_Z) continue
      if (ny < 0 || ny >= CHUNK_HEIGHT) continue

      const storedLight = chunk.getSkylight(nx, ny, nz)
      if (storedLight > 0) {
        queue.push({ x: nx, y: ny, z: nz, level: storedLight * LIGHT_SCALE })
      }
    }

    // Process spreading from neighbors
    this.processQueue(chunk, queue)
  }

  /**
   * Propagate light from a source chunk's edge into a target chunk.
   * Call this when a new chunk is generated to update neighbor lighting.
   * @param targetChunk The chunk to update lighting in
   * @param sourceChunk The newly generated chunk providing light
   * @param direction Which edge of target faces source: 'posX' | 'negX' | 'posZ' | 'negZ'
   */
  propagateFromNeighbor(
    targetChunk: IChunkData,
    sourceChunk: IChunkData,
    direction: 'posX' | 'negX' | 'posZ' | 'negZ'
  ): boolean {
    const queue: LightNode[] = []
    let changed = false

    // Determine which edge to read from source and write to target
    let sourceX: number, targetX: number
    let sourceZ: number, targetZ: number

    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      if (direction === 'posX' || direction === 'negX') {
        // X-axis boundary
        sourceX = direction === 'posX' ? 0 : CHUNK_SIZE_X - 1
        targetX = direction === 'posX' ? CHUNK_SIZE_X - 1 : 0

        for (let z = 0; z < CHUNK_SIZE_Z; z++) {
          const sourceLight = sourceChunk.getSkylight(sourceX, y, z)
          if (sourceLight > 0) {
            const internalLight = sourceLight * LIGHT_SCALE
            // Try to propagate into target
            const targetLight = targetChunk.getSkylight(targetX, y, z)
            const newInternalLight = internalLight - 1 // Decrease by 1 crossing boundary
            const newStoredLight = Math.floor(newInternalLight / LIGHT_SCALE)

            if (newStoredLight > targetLight) {
              targetChunk.setSkylight(targetX, y, z, newStoredLight)
              queue.push({ x: targetX, y, z, level: newInternalLight })
              changed = true
            }
          }
        }
      } else {
        // Z-axis boundary
        sourceZ = direction === 'posZ' ? 0 : CHUNK_SIZE_Z - 1
        targetZ = direction === 'posZ' ? CHUNK_SIZE_Z - 1 : 0

        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const sourceLight = sourceChunk.getSkylight(x, y, sourceZ)
          if (sourceLight > 0) {
            const internalLight = sourceLight * LIGHT_SCALE
            // Try to propagate into target
            const targetLight = targetChunk.getSkylight(x, y, targetZ)
            const newInternalLight = internalLight - 1 // Decrease by 1 crossing boundary
            const newStoredLight = Math.floor(newInternalLight / LIGHT_SCALE)

            if (newStoredLight > targetLight) {
              targetChunk.setSkylight(x, y, targetZ, newStoredLight)
              queue.push({ x, y, z: targetZ, level: newInternalLight })
              changed = true
            }
          }
        }
      }
    }

    // Propagate the edge light further into target chunk
    if (queue.length > 0) {
      this.processQueue(targetChunk, queue)
    }

    return changed
  }

  /**
   * Propagate light from a neighboring sub-chunk across their shared edge.
   * Call this when a sub-chunk has edge light that should spread to neighbors.
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

    // Determine which edge to read from source and write to target
    let sourceX: number, targetX: number
    let sourceZ: number, targetZ: number

    for (let y = 0; y < SUB_CHUNK_HEIGHT; y++) {
      if (direction === 'posX' || direction === 'negX') {
        // X-axis boundary
        sourceX = direction === 'posX' ? 0 : CHUNK_SIZE_X - 1
        targetX = direction === 'posX' ? CHUNK_SIZE_X - 1 : 0

        for (let z = 0; z < CHUNK_SIZE_Z; z++) {
          const sourceLight = sourceSubChunk.getSkylight(sourceX, y, z)
          if (sourceLight > 0) {
            const internalLight = sourceLight * LIGHT_SCALE
            // Try to propagate into target
            const targetLight = targetSubChunk.getSkylight(targetX, y, z)
            const newInternalLight = internalLight - 1 // Decrease by 1 crossing boundary
            const newStoredLight = Math.floor(newInternalLight / LIGHT_SCALE)

            if (newStoredLight > targetLight) {
              targetSubChunk.setSkylight(targetX, y, z, newStoredLight)
              queue.push({ x: targetX, y, z, level: newInternalLight })
              changed = true
            }
          }
        }
      } else {
        // Z-axis boundary
        sourceZ = direction === 'posZ' ? 0 : CHUNK_SIZE_Z - 1
        targetZ = direction === 'posZ' ? CHUNK_SIZE_Z - 1 : 0

        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const sourceLight = sourceSubChunk.getSkylight(x, y, sourceZ)
          if (sourceLight > 0) {
            const internalLight = sourceLight * LIGHT_SCALE
            // Try to propagate into target
            const targetLight = targetSubChunk.getSkylight(x, y, targetZ)
            const newInternalLight = internalLight - 1 // Decrease by 1 crossing boundary
            const newStoredLight = Math.floor(newInternalLight / LIGHT_SCALE)

            if (newStoredLight > targetLight) {
              targetSubChunk.setSkylight(x, y, targetZ, newStoredLight)
              queue.push({ x, y, z: targetZ, level: newInternalLight })
              changed = true
            }
          }
        }
      }
    }

    // Propagate the edge light further into target sub-chunk
    if (queue.length > 0) {
      this.processSubChunkQueue(targetSubChunk, queue)
    }

    return changed
  }

  // ============================================
  // Sub-Chunk Lighting Methods
  // ============================================

  /**
   * Calculate skylight for an individual sub-chunk.
   * Call after terrain and caves are generated for the sub-chunk.
   *
   * @param subChunk The sub-chunk to light
   * @param aboveLight Optional light values from the bottom layer of the sub-chunk above.
   *                   If not provided and subY < 15, assumes full sky light at top.
   */
  propagateSubChunk(subChunk: ISubChunkData, aboveLight?: BoundaryLight): void {
    // Phase 1: Initialize columns from top down
    this.initializeSubChunkColumns(subChunk, aboveLight)

    // Phase 2: Spread light horizontally into caves
    this.spreadSubChunkLight(subChunk)
  }

  /**
   * Get light values from the bottom layer of a sub-chunk.
   * Used to propagate light into the sub-chunk below.
   */
  getBottomBoundaryLight(subChunk: ISubChunkData): BoundaryLight {
    const values = new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Z)

    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        const index = z * CHUNK_SIZE_X + x
        values[index] = subChunk.getSkylight(x, 0, z)
      }
    }

    return { values }
  }

  /**
   * Propagate light from the sub-chunk above into the target sub-chunk.
   * Call this when a sub-chunk above is generated after the one below.
   *
   * @param targetSubChunk The sub-chunk to update lighting in
   * @param aboveLight Light values from bottom of the sub-chunk above
   * @returns true if any light values changed
   */
  propagateFromAbove(targetSubChunk: ISubChunkData, aboveLight: BoundaryLight): boolean {
    const queue: LightNode[] = []
    let changed = false

    // For each column, check if incoming light from above is higher than current top
    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        const index = z * CHUNK_SIZE_X + x
        const incomingStoredLight = aboveLight.values[index]
        if (incomingStoredLight === 0) continue

        // Get block at top of this sub-chunk
        const topY = SUB_CHUNK_HEIGHT - 1
        const blockId = targetSubChunk.getBlockId(x, topY, z)
        const block = getBlock(blockId)
        const blocking = block.properties.lightBlocking

        // Calculate light after passing through top block
        const incomingInternal = incomingStoredLight * LIGHT_SCALE
        const newInternalLight = incomingInternal - 1 - blocking * LIGHT_SCALE
        if (newInternalLight <= 0) continue

        const newStoredLight = Math.floor(newInternalLight / LIGHT_SCALE)
        const currentStoredLight = targetSubChunk.getSkylight(x, topY, z)

        if (newStoredLight > currentStoredLight) {
          targetSubChunk.setSkylight(x, topY, z, newStoredLight)
          queue.push({ x, y: topY, z, level: newInternalLight })
          changed = true
        }
      }
    }

    // Propagate the incoming light further into the sub-chunk
    if (queue.length > 0) {
      this.processSubChunkQueue(targetSubChunk, queue)
    }

    return changed
  }

  /**
   * Initialize skylight columns for a sub-chunk, scanning from top down.
   * Uses internal 0-30 scale, stores as 0-15.
   */
  private initializeSubChunkColumns(subChunk: ISubChunkData, aboveLight?: BoundaryLight): void {
    const subY = subChunk.coordinate.subY

    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        // Determine starting light level
        let skylight: number
        if (aboveLight) {
          // Use light from sub-chunk above (convert stored 0-15 to internal 0-30)
          const index = z * CHUNK_SIZE_X + x
          skylight = aboveLight.values[index] * LIGHT_SCALE
        } else if (subY === SUB_CHUNK_COUNT - 1) {
          // Topmost sub-chunk: start with full sky light
          skylight = INTERNAL_MAX_LIGHT
        } else {
          // Sub-chunk without above data: assume full light (will be corrected when above generates)
          skylight = INTERNAL_MAX_LIGHT
        }

        // Scan from top of sub-chunk down
        for (let y = SUB_CHUNK_HEIGHT - 1; y >= 0; y--) {
          const blockId = subChunk.getBlockId(x, y, z)

          if (blockId === BlockIds.AIR) {
            // Store as 0-15 (divide by scale)
            subChunk.setSkylight(x, y, z, Math.floor(skylight / LIGHT_SCALE))
          } else {
            const block = getBlock(blockId)
            const blocking = block.properties.lightBlocking

            // Reduce light based on block's light blocking (scaled)
            skylight = Math.max(0, skylight - blocking * LIGHT_SCALE)
            subChunk.setSkylight(x, y, z, Math.floor(skylight / LIGHT_SCALE))

            // If fully opaque, no more light below
            if (blocking >= 15) {
              // Fill rest of column with 0
              for (let yy = y - 1; yy >= 0; yy--) {
                subChunk.setSkylight(x, yy, z, 0)
              }
              break
            }
          }
        }
      }
    }
  }

  /**
   * BFS flood-fill to spread light horizontally into caves within a sub-chunk.
   */
  spreadSubChunkLight(subChunk: ISubChunkData): void {
    const queue: LightNode[] = []

    // Find all light sources that can spread
    for (let y = 0; y < SUB_CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const storedLight = subChunk.getSkylight(x, y, z)
          if (storedLight > 0) {
            const internalLight = storedLight * LIGHT_SCALE
            // Check if any neighbor has lower light (potential spread target)
            if (this.subChunkHasLowerNeighbor(subChunk, x, y, z, storedLight)) {
              queue.push({ x, y, z, level: internalLight })
            }
          }
        }
      }
    }

    // BFS propagation
    this.processSubChunkQueue(subChunk, queue)
  }

  /**
   * Process the light propagation queue for a sub-chunk.
   */
  private processSubChunkQueue(subChunk: ISubChunkData, queue: LightNode[]): void {
    let head = 0

    while (head < queue.length) {
      const node = queue[head++]

      // Check all 6 neighbors
      this.trySubChunkPropagate(subChunk, queue, node.x - 1, node.y, node.z, node.level)
      this.trySubChunkPropagate(subChunk, queue, node.x + 1, node.y, node.z, node.level)
      this.trySubChunkPropagate(subChunk, queue, node.x, node.y - 1, node.z, node.level)
      this.trySubChunkPropagate(subChunk, queue, node.x, node.y + 1, node.z, node.level)
      this.trySubChunkPropagate(subChunk, queue, node.x, node.y, node.z - 1, node.level)
      this.trySubChunkPropagate(subChunk, queue, node.x, node.y, node.z + 1, node.level)
    }
  }

  /**
   * Try to propagate light to a neighbor position within a sub-chunk.
   */
  private trySubChunkPropagate(
    subChunk: ISubChunkData,
    queue: LightNode[],
    nx: number,
    ny: number,
    nz: number,
    sourceLevel: number
  ): void {
    // Bounds check (sub-chunk is 64 height)
    if (nx < 0 || nx >= CHUNK_SIZE_X) return
    if (nz < 0 || nz >= CHUNK_SIZE_Z) return
    if (ny < 0 || ny >= SUB_CHUNK_HEIGHT) return

    const blockId = subChunk.getBlockId(nx, ny, nz)
    const block = getBlock(blockId)
    const blocking = block.properties.lightBlocking

    // Calculate new internal light level
    const newInternalLight = sourceLevel - 1 - blocking * LIGHT_SCALE
    if (newInternalLight <= 0) return

    // Convert to stored value (0-15)
    const newStoredLight = Math.floor(newInternalLight / LIGHT_SCALE)
    const currentStoredLight = subChunk.getSkylight(nx, ny, nz)

    if (newStoredLight > currentStoredLight) {
      subChunk.setSkylight(nx, ny, nz, newStoredLight)
      queue.push({ x: nx, y: ny, z: nz, level: newInternalLight })
    }
  }

  /**
   * Update lighting after a block change in a sub-chunk.
   * When a block is removed, light should flood down from above.
   * Returns a list of sub-chunk subY indices that were affected and need remeshing.
   *
   * @param column Object providing getSubChunk(subY) method
   * @param localX Local X coordinate (0-31)
   * @param localY Local Y coordinate in column (0-1023)
   * @param localZ Local Z coordinate (0-31)
   * @param wasBlockRemoved True if block was removed (air placed), false if block was placed
   * @returns Array of subY indices that need remeshing due to light changes
   */
  updateSubChunkLightingAt(
    column: { getSubChunk(subY: number): ISubChunkData | null },
    localX: number,
    localY: number,
    localZ: number,
    wasBlockRemoved: boolean
  ): number[] {
    const affectedSubChunks: Set<number> = new Set()
    const subY = Math.floor(localY / SUB_CHUNK_HEIGHT)
    const localSubY = localY % SUB_CHUNK_HEIGHT

    const subChunk = column.getSubChunk(subY)
    if (!subChunk) return []

    if (wasBlockRemoved) {
      // Block was removed - light can now flow through this position
      // Find the maximum light level from any neighbor (all 6 directions)
      let incomingLight = 0

      // Check if there's direct sky access by scanning up
      const hasSkyAccess = SkylightPropagator.checkSubChunkSkyAccess(column, localX, localY, localZ)
      if (hasSkyAccess) {
        incomingLight = 15
      } else {
        // No sky access - find brightest neighbor and use that minus 1
        // Check above
        if (localSubY === SUB_CHUNK_HEIGHT - 1) {
          const aboveSubChunk = column.getSubChunk(subY + 1)
          if (aboveSubChunk) {
            incomingLight = Math.max(incomingLight, aboveSubChunk.getSkylight(localX, 0, localZ))
          }
        } else {
          incomingLight = Math.max(incomingLight, subChunk.getSkylight(localX, localSubY + 1, localZ))
        }

        // Check below
        if (localSubY === 0) {
          const belowSubChunk = column.getSubChunk(subY - 1)
          if (belowSubChunk) {
            incomingLight = Math.max(incomingLight, belowSubChunk.getSkylight(localX, SUB_CHUNK_HEIGHT - 1, localZ))
          }
        } else {
          incomingLight = Math.max(incomingLight, subChunk.getSkylight(localX, localSubY - 1, localZ))
        }

        // Check horizontal neighbors (within same sub-chunk, clamped to bounds)
        if (localX > 0) {
          incomingLight = Math.max(incomingLight, subChunk.getSkylight(localX - 1, localSubY, localZ))
        }
        if (localX < CHUNK_SIZE_X - 1) {
          incomingLight = Math.max(incomingLight, subChunk.getSkylight(localX + 1, localSubY, localZ))
        }
        if (localZ > 0) {
          incomingLight = Math.max(incomingLight, subChunk.getSkylight(localX, localSubY, localZ - 1))
        }
        if (localZ < CHUNK_SIZE_Z - 1) {
          incomingLight = Math.max(incomingLight, subChunk.getSkylight(localX, localSubY, localZ + 1))
        }

        // Apply attenuation (light decreases by 1 when passing through air)
        if (incomingLight > 0) {
          incomingLight = incomingLight - 1
        }
      }

      // Set light at the removed block position
      if (incomingLight > subChunk.getSkylight(localX, localSubY, localZ)) {
        subChunk.setSkylight(localX, localSubY, localZ, incomingLight)
        affectedSubChunks.add(subY)

        // Propagate light downward through this column
        this.propagateSubChunkColumnDown(column, localX, localZ, localY, affectedSubChunks)

        // Spread light horizontally from this position
        this.spreadFromPositionSubChunk(column, localX, localY, localZ, affectedSubChunks)
      }
    } else {
      // Block was placed - need to recalculate darkness
      // Set this position's light to 0 (opaque block)
      const block = getBlock(subChunk.getBlockId(localX, localSubY, localZ))
      if (block.properties.lightBlocking >= 15) {
        subChunk.setSkylight(localX, localSubY, localZ, 0)
        affectedSubChunks.add(subY)

        // Propagate darkness down, then recalculate from neighbors
        this.propagateSubChunkDarknessDown(column, localX, localZ, localY, affectedSubChunks)

        // Re-spread light from neighbors to blocks that were darkened
        // Start from one block below the placed block
        this.recalculateLightFromNeighbors(column, localX, localY - 1, localZ, affectedSubChunks)
      }
    }

    return Array.from(affectedSubChunks)
  }

  /**
   * Check if a position has direct sky access through the sub-chunk column.
   * This is a static method so it can be called from both main thread and workers.
   */
  static checkSubChunkSkyAccess(
    column: { getSubChunk(subY: number): ISubChunkData | null },
    localX: number,
    localY: number,
    localZ: number
  ): boolean {
    const startSubY = Math.floor(localY / SUB_CHUNK_HEIGHT)
    const startLocalY = localY % SUB_CHUNK_HEIGHT

    // Check from the position to the top of the current sub-chunk
    const startSubChunk = column.getSubChunk(startSubY)
    if (startSubChunk) {
      for (let y = startLocalY; y < SUB_CHUNK_HEIGHT; y++) {
        const blockId = startSubChunk.getBlockId(localX, y, localZ)
        if (blockId !== BlockIds.AIR) {
          const block = getBlock(blockId)
          if (block.properties.lightBlocking >= 15) {
            return false
          }
        }
      }
    }

    // Check all sub-chunks above
    for (let subY = startSubY + 1; subY < 16; subY++) {
      const subChunk = column.getSubChunk(subY)
      if (!subChunk) continue // Ungenerated sub-chunk, assume sky access

      for (let y = 0; y < SUB_CHUNK_HEIGHT; y++) {
        const blockId = subChunk.getBlockId(localX, y, localZ)
        if (blockId !== BlockIds.AIR) {
          const block = getBlock(blockId)
          if (block.properties.lightBlocking >= 15) {
            return false
          }
        }
      }
    }

    return true
  }

  /**
   * Propagate light down a column after a block removal.
   */
  private propagateSubChunkColumnDown(
    column: { getSubChunk(subY: number): ISubChunkData | null },
    localX: number,
    localZ: number,
    startY: number,
    affectedSubChunks: Set<number>
  ): void {
    const startSubY = Math.floor(startY / SUB_CHUNK_HEIGHT)
    const startSubChunk = column.getSubChunk(startSubY)
    if (!startSubChunk) return

    // Get light at starting position (internal scale)
    let skylight = startSubChunk.getSkylight(localX, startY % SUB_CHUNK_HEIGHT, localZ) * LIGHT_SCALE

    // Propagate down through the starting sub-chunk
    for (let y = (startY % SUB_CHUNK_HEIGHT) - 1; y >= 0; y--) {
      const blockId = startSubChunk.getBlockId(localX, y, localZ)
      const block = getBlock(blockId)
      const blocking = block.properties.lightBlocking

      skylight = Math.max(0, skylight - 1 - blocking * LIGHT_SCALE)
      const storedLight = Math.floor(skylight / LIGHT_SCALE)

      if (storedLight > startSubChunk.getSkylight(localX, y, localZ)) {
        startSubChunk.setSkylight(localX, y, localZ, storedLight)
        affectedSubChunks.add(startSubY)
      } else {
        break // No improvement, stop propagating
      }

      if (skylight <= 0) break
    }

    // Continue to sub-chunks below if we have light left
    if (skylight > 0) {
      for (let subY = startSubY - 1; subY >= 0; subY--) {
        const subChunk = column.getSubChunk(subY)
        if (!subChunk) break

        for (let y = SUB_CHUNK_HEIGHT - 1; y >= 0; y--) {
          const blockId = subChunk.getBlockId(localX, y, localZ)
          const block = getBlock(blockId)
          const blocking = block.properties.lightBlocking

          skylight = Math.max(0, skylight - 1 - blocking * LIGHT_SCALE)
          const storedLight = Math.floor(skylight / LIGHT_SCALE)

          if (storedLight > subChunk.getSkylight(localX, y, localZ)) {
            subChunk.setSkylight(localX, y, localZ, storedLight)
            affectedSubChunks.add(subY)
          } else {
            return // No improvement, stop propagating
          }

          if (skylight <= 0) return
        }
      }
    }
  }

  /**
   * Propagate darkness down when a block is placed.
   */
  private propagateSubChunkDarknessDown(
    column: { getSubChunk(subY: number): ISubChunkData | null },
    localX: number,
    localZ: number,
    startY: number,
    affectedSubChunks: Set<number>
  ): void {
    const startSubY = Math.floor(startY / SUB_CHUNK_HEIGHT)

    // Set light to 0 for all blocks below that were lit from above
    for (let subY = startSubY; subY >= 0; subY--) {
      const subChunk = column.getSubChunk(subY)
      if (!subChunk) break

      const startLocalY = subY === startSubY ? (startY % SUB_CHUNK_HEIGHT) - 1 : SUB_CHUNK_HEIGHT - 1

      for (let y = startLocalY; y >= 0; y--) {
        const currentLight = subChunk.getSkylight(localX, y, localZ)
        if (currentLight === 0) break // Already dark

        // Check if this block could be getting light from elsewhere (neighbors)
        // For simplicity, set to 0 and let horizontal spread fix it
        subChunk.setSkylight(localX, y, localZ, 0)
        affectedSubChunks.add(subY)

        // If block is opaque, stop
        const blockId = subChunk.getBlockId(localX, y, localZ)
        if (blockId !== BlockIds.AIR) {
          const block = getBlock(blockId)
          if (block.properties.lightBlocking >= 15) break
        }
      }
    }
  }

  /**
   * Recalculate light from neighbors for blocks that were darkened.
   * Called after darkness propagation to restore light from horizontal sources.
   */
  private recalculateLightFromNeighbors(
    column: { getSubChunk(subY: number): ISubChunkData | null },
    localX: number,
    startY: number,
    localZ: number,
    affectedSubChunks: Set<number>
  ): void {
    if (startY < 0) return

    const startSubY = Math.floor(startY / SUB_CHUNK_HEIGHT)

    // Scan down through the darkened column and recalculate light from neighbors
    for (let subY = startSubY; subY >= 0; subY--) {
      const subChunk = column.getSubChunk(subY)
      if (!subChunk) break

      const startLocalY = subY === startSubY ? (startY % SUB_CHUNK_HEIGHT) : SUB_CHUNK_HEIGHT - 1

      for (let y = startLocalY; y >= 0; y--) {
        const blockId = subChunk.getBlockId(localX, y, localZ)

        // If we hit an opaque block, stop
        if (blockId !== BlockIds.AIR) {
          const block = getBlock(blockId)
          if (block.properties.lightBlocking >= 15) return
        }

        // Find maximum light from horizontal neighbors
        let maxNeighborLight = 0

        if (localX > 0) {
          maxNeighborLight = Math.max(maxNeighborLight, subChunk.getSkylight(localX - 1, y, localZ))
        }
        if (localX < CHUNK_SIZE_X - 1) {
          maxNeighborLight = Math.max(maxNeighborLight, subChunk.getSkylight(localX + 1, y, localZ))
        }
        if (localZ > 0) {
          maxNeighborLight = Math.max(maxNeighborLight, subChunk.getSkylight(localX, y, localZ - 1))
        }
        if (localZ < CHUNK_SIZE_Z - 1) {
          maxNeighborLight = Math.max(maxNeighborLight, subChunk.getSkylight(localX, y, localZ + 1))
        }

        // Apply light with attenuation
        if (maxNeighborLight > 1) {
          const newLight = maxNeighborLight - 1
          const currentLight = subChunk.getSkylight(localX, y, localZ)
          if (newLight > currentLight) {
            subChunk.setSkylight(localX, y, localZ, newLight)
            affectedSubChunks.add(subY)
          }
        }
      }
    }
  }

  /**
   * Spread light horizontally from a position after a block removal.
   */
  private spreadFromPositionSubChunk(
    column: { getSubChunk(subY: number): ISubChunkData | null },
    localX: number,
    localY: number,
    localZ: number,
    affectedSubChunks: Set<number>
  ): void {
    const subY = Math.floor(localY / SUB_CHUNK_HEIGHT)
    const localSubY = localY % SUB_CHUNK_HEIGHT
    const subChunk = column.getSubChunk(subY)
    if (!subChunk) return

    const queue: LightNode[] = []
    const storedLight = subChunk.getSkylight(localX, localSubY, localZ)
    if (storedLight > 0) {
      queue.push({ x: localX, y: localSubY, z: localZ, level: storedLight * LIGHT_SCALE })
    }

    // Process the queue with bounds checking for sub-chunk
    let head = 0
    while (head < queue.length) {
      const node = queue[head++]
      const neighbors = [
        [node.x - 1, node.y, node.z],
        [node.x + 1, node.y, node.z],
        [node.x, node.y - 1, node.z],
        [node.x, node.y + 1, node.z],
        [node.x, node.y, node.z - 1],
        [node.x, node.y, node.z + 1],
      ]

      for (const [nx, ny, nz] of neighbors) {
        if (nx < 0 || nx >= CHUNK_SIZE_X) continue
        if (nz < 0 || nz >= CHUNK_SIZE_Z) continue
        if (ny < 0 || ny >= SUB_CHUNK_HEIGHT) continue

        const blockId = subChunk.getBlockId(nx, ny, nz)
        const block = getBlock(blockId)
        const blocking = block.properties.lightBlocking

        const newInternalLight = node.level - 1 - blocking * LIGHT_SCALE
        if (newInternalLight <= 0) continue

        const newStoredLight = Math.floor(newInternalLight / LIGHT_SCALE)
        const currentStoredLight = subChunk.getSkylight(nx, ny, nz)

        if (newStoredLight > currentStoredLight) {
          subChunk.setSkylight(nx, ny, nz, newStoredLight)
          queue.push({ x: nx, y: ny, z: nz, level: newInternalLight })
          affectedSubChunks.add(subY)
        }
      }
    }
  }

  /**
   * Check if any neighbor within the sub-chunk has lower light than expected.
   */
  private subChunkHasLowerNeighbor(
    subChunk: ISubChunkData,
    x: number,
    y: number,
    z: number,
    light: number
  ): boolean {
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
      if (ny < 0 || ny >= SUB_CHUNK_HEIGHT) continue

      if (subChunk.getSkylight(nx, ny, nz) < light - 1) {
        return true
      }
    }
    return false
  }

  /**
   * Propagate light from a source sub-chunk's edge into a target sub-chunk (horizontal).
   * Call this when a new sub-chunk is generated to update neighbor lighting.
   * @param targetSubChunk The sub-chunk to update lighting in
   * @param sourceSubChunk The newly generated sub-chunk providing light
   * @param direction Which edge of target faces source: 'posX' | 'negX' | 'posZ' | 'negZ'
   * @returns true if any light values changed
   */
  propagateSubChunkFromNeighbor(
    targetSubChunk: ISubChunkData,
    sourceSubChunk: ISubChunkData,
    direction: 'posX' | 'negX' | 'posZ' | 'negZ'
  ): boolean {
    const queue: LightNode[] = []
    let changed = false

    // Determine which edge to read from source and write to target
    let sourceX: number, targetX: number
    let sourceZ: number, targetZ: number

    for (let y = 0; y < SUB_CHUNK_HEIGHT; y++) {
      if (direction === 'posX' || direction === 'negX') {
        // X-axis boundary
        sourceX = direction === 'posX' ? 0 : CHUNK_SIZE_X - 1
        targetX = direction === 'posX' ? CHUNK_SIZE_X - 1 : 0

        for (let z = 0; z < CHUNK_SIZE_Z; z++) {
          const sourceLight = sourceSubChunk.getSkylight(sourceX, y, z)
          if (sourceLight > 0) {
            const internalLight = sourceLight * LIGHT_SCALE
            const targetLight = targetSubChunk.getSkylight(targetX, y, z)
            const newInternalLight = internalLight - 1
            const newStoredLight = Math.floor(newInternalLight / LIGHT_SCALE)

            if (newStoredLight > targetLight) {
              targetSubChunk.setSkylight(targetX, y, z, newStoredLight)
              queue.push({ x: targetX, y, z, level: newInternalLight })
              changed = true
            }
          }
        }
      } else {
        // Z-axis boundary
        sourceZ = direction === 'posZ' ? 0 : CHUNK_SIZE_Z - 1
        targetZ = direction === 'posZ' ? CHUNK_SIZE_Z - 1 : 0

        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const sourceLight = sourceSubChunk.getSkylight(x, y, sourceZ)
          if (sourceLight > 0) {
            const internalLight = sourceLight * LIGHT_SCALE
            const targetLight = targetSubChunk.getSkylight(x, y, targetZ)
            const newInternalLight = internalLight - 1
            const newStoredLight = Math.floor(newInternalLight / LIGHT_SCALE)

            if (newStoredLight > targetLight) {
              targetSubChunk.setSkylight(x, y, targetZ, newStoredLight)
              queue.push({ x, y, z: targetZ, level: newInternalLight })
              changed = true
            }
          }
        }
      }
    }

    // Propagate the edge light further into target sub-chunk
    if (queue.length > 0) {
      this.processSubChunkQueue(targetSubChunk, queue)
    }

    return changed
  }
}
