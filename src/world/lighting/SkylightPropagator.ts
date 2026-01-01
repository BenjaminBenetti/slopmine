import type { IChunkData } from '../interfaces/IChunkData.ts'
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT } from '../interfaces/IChunk.ts'
import { BlockIds } from '../blocks/BlockIds.ts'
import { getBlock } from '../blocks/BlockRegistry.ts'

interface LightNode {
  x: number
  y: number
  z: number
  level: number
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
}
