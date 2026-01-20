import * as THREE from 'three'
import type { IPhysicsWorld } from '../../../physics/interfaces/IPhysicsWorld.ts'
import { BlockIds } from '../../../world/blocks/BlockIds.ts'

/**
 * Represents a valid point on a pillar where a Hell Bug can cling.
 */
export interface PillarClingPoint {
  /** Position where the entity should be when clinging */
  position: THREE.Vector3
  /** Normal direction pointing away from the pillar surface */
  normal: THREE.Vector3
}

// Hell block IDs that bugs can cling to
const HELL_BLOCK_IDS = new Set([
  BlockIds.HELL_ROCK,
  BlockIds.HELL_MAGMA,
  BlockIds.CORRUPTED_HELL_ROCK,
])

// Directions to check for exposed faces (horizontal only for wall clinging)
const FACE_DIRECTIONS: readonly THREE.Vector3[] = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
]

/**
 * Utility class for detecting valid cling points on Hell pillars.
 * Scans for Hell blocks with exposed faces that bugs can attach to.
 */
export class PillarDetector {
  private readonly physicsWorld: IPhysicsWorld
  private readonly getBlockIdFn: (x: number, y: number, z: number) => number

  // Cache for cling points to avoid rescanning frequently
  private cachedPoints: PillarClingPoint[] = []
  private cacheCenter = new THREE.Vector3()
  private cacheValidDistance = 10 // Rescan if entity moves >10 blocks from cache center

  constructor(
    physicsWorld: IPhysicsWorld,
    getBlockIdFn: (x: number, y: number, z: number) => number
  ) {
    this.physicsWorld = physicsWorld
    this.getBlockIdFn = getBlockIdFn
  }

  /**
   * Check if a block is a Hell block that bugs can cling to.
   */
  private isHellBlock(x: number, y: number, z: number): boolean {
    const blockId = this.getBlockIdFn(x, y, z)
    return HELL_BLOCK_IDS.has(blockId)
  }

  /**
   * Check if a position has air (no solid block).
   */
  private isAir(x: number, y: number, z: number): boolean {
    return !this.physicsWorld.isSolidBlock(x, y, z)
  }

  /**
   * Find nearby pillar cling points.
   * Uses caching to avoid expensive rescans.
   *
   * @param entityPos Current entity position
   * @param maxDistance Maximum distance to search
   * @returns Array of valid cling points sorted by distance
   */
  findNearbyPillarClingPoints(
    entityPos: THREE.Vector3,
    maxDistance: number = 30
  ): PillarClingPoint[] {
    // Check if cache is still valid
    const distFromCache = entityPos.distanceTo(this.cacheCenter)
    if (distFromCache < this.cacheValidDistance && this.cachedPoints.length > 0) {
      // Filter and sort cached points by distance
      return this.filterAndSortPoints(entityPos, this.cachedPoints, maxDistance)
    }

    // Rescan for cling points
    this.cachedPoints = this.scanForClingPoints(entityPos, maxDistance)
    this.cacheCenter.copy(entityPos)

    return this.filterAndSortPoints(entityPos, this.cachedPoints, maxDistance)
  }

  /**
   * Check if a position is part of a thin pillar structure (not terrain floor).
   * A pillar has air on at least 2 opposite sides or 3+ sides total.
   */
  private isPillarBlock(x: number, y: number, z: number): boolean {
    // Must be a Hell block
    if (!this.isHellBlock(x, y, z)) return false

    // Count air on each horizontal side
    const airPosX = this.isAir(x + 1, y, z)
    const airNegX = this.isAir(x - 1, y, z)
    const airPosZ = this.isAir(x, y, z + 1)
    const airNegZ = this.isAir(x, y, z - 1)

    const airCount = (airPosX ? 1 : 0) + (airNegX ? 1 : 0) + (airPosZ ? 1 : 0) + (airNegZ ? 1 : 0)

    // A pillar block has air on at least 2 sides
    // AND must have air below (it's elevated, not ground)
    const hasAirBelow = this.isAir(x, y - 1, z)

    // Either: air on 3+ sides (definitely a pillar)
    // Or: air on 2 opposite sides (thin pillar) AND air somewhere below
    if (airCount >= 3) return true
    if (airCount >= 2 && hasAirBelow) return true

    // Check if this is high up (Y > 70) and has at least 2 air sides
    // Pillars extend high into the air gap
    if (y > 70 && airCount >= 2) return true

    return false
  }

  /**
   * Scan an area for valid cling points on Hell pillars.
   * Only finds points on thin vertical structures in the air gap, not terrain.
   */
  private scanForClingPoints(
    center: THREE.Vector3,
    maxDistance: number
  ): PillarClingPoint[] {
    const points: PillarClingPoint[] = []

    // Calculate scan bounds - focus on the air gap (Y=64-120)
    const minX = Math.floor(center.x - maxDistance)
    const maxX = Math.ceil(center.x + maxDistance)
    const minY = Math.max(64, Math.floor(center.y - maxDistance)) // Start at air gap (Y=64)
    const maxY = Math.min(120, Math.ceil(center.y + maxDistance)) // Below ceiling
    const minZ = Math.floor(center.z - maxDistance)
    const maxZ = Math.ceil(center.z + maxDistance)

    // Sample at intervals to reduce cost (every 2 blocks)
    const step = 2

    for (let x = minX; x <= maxX; x += step) {
      for (let z = minZ; z <= maxZ; z += step) {
        for (let y = minY; y <= maxY; y += step) {
          // Skip if not a pillar block (filters out terrain)
          if (!this.isPillarBlock(x, y, z)) continue

          // Check each horizontal face for exposure to air
          for (const dir of FACE_DIRECTIONS) {
            const airX = x + dir.x
            const airZ = z + dir.z

            // Check if this face is exposed to air
            if (!this.isAir(airX, y, airZ)) continue

            // Also need air above the cling position for the bug's body
            if (!this.isAir(airX, y + 1, airZ)) continue

            // Valid cling point found on a pillar!
            const clingPos = new THREE.Vector3(
              airX + 0.5, // Center of the air block
              y + 0.5,   // Vertically centered on the block
              airZ + 0.5
            )

            // Offset slightly toward the wall
            clingPos.x -= dir.x * 0.3
            clingPos.z -= dir.z * 0.3

            points.push({
              position: clingPos,
              normal: dir.clone(),
            })
          }
        }
      }
    }

    return points
  }

  /**
   * Filter points by distance and sort by proximity.
   */
  private filterAndSortPoints(
    entityPos: THREE.Vector3,
    points: PillarClingPoint[],
    maxDistance: number
  ): PillarClingPoint[] {
    return points
      .filter((p) => p.position.distanceTo(entityPos) <= maxDistance)
      .sort((a, b) => {
        return a.position.distanceTo(entityPos) - b.position.distanceTo(entityPos)
      })
  }

  /**
   * Find the nearest valid cling point.
   *
   * @param entityPos Current entity position
   * @param excludeNearDistance Don't return points within this distance (to avoid re-landing on same spot)
   * @param maxDistance Maximum distance to search
   */
  findNearestClingPoint(
    entityPos: THREE.Vector3,
    excludeNearDistance: number = 3,
    maxDistance: number = 30
  ): PillarClingPoint | null {
    const points = this.findNearbyPillarClingPoints(entityPos, maxDistance)

    for (const point of points) {
      const dist = point.position.distanceTo(entityPos)
      if (dist >= excludeNearDistance) {
        return point
      }
    }

    return null
  }

  /**
   * Find a random cling point from available options.
   * Useful for adding variety to bug behavior.
   */
  findRandomClingPoint(
    entityPos: THREE.Vector3,
    minDistance: number = 5,
    maxDistance: number = 25
  ): PillarClingPoint | null {
    const points = this.findNearbyPillarClingPoints(entityPos, maxDistance)
      .filter((p) => p.position.distanceTo(entityPos) >= minDistance)

    if (points.length === 0) return null

    // Weight toward closer points (but not too close)
    const randomIndex = Math.floor(Math.random() * Math.min(points.length, 5))
    return points[randomIndex]
  }

  /**
   * Invalidate the cache, forcing a rescan on next query.
   */
  invalidateCache(): void {
    this.cachedPoints = []
  }
}
