/**
 * Web Worker for pathfinding queries.
 * Offloads expensive A* pathfinding calculations from the main thread.
 */

import type { PathfindingPosition, PathfindingConfig, PathfindingResult } from '../world/interfaces/IPathfinding.ts'

/**
 * Request to compute a path.
 */
export interface PathfindingRequest {
  type: 'findPath'
  /** Unique ID for this request */
  requestId: string
  /** Starting position */
  start: PathfindingPosition
  /** Goal position */
  goal: PathfindingPosition
  /** Blocks data: compressed representation of the world around the path */
  blocks: Uint16Array
  /** Dimensions of the blocks data [width, height, depth] */
  dimensions: [number, number, number]
  /** Offset to convert local indices to world coordinates */
  offset: PathfindingPosition
  /** Configuration for pathfinding behavior */
  config: PathfindingConfig
}

/**
 * Response with the computed path.
 */
export interface PathfindingResponse {
  type: 'pathResult'
  /** Request ID that this response corresponds to */
  requestId: string
  /** The pathfinding result */
  result: PathfindingResult
}

/**
 * Error response from worker.
 */
export interface PathfindingError {
  type: 'pathError'
  requestId: string
  error: string
}

/**
 * A node in the A* search.
 */
interface AStarNode {
  pos: PathfindingPosition
  g: number // Cost from start
  h: number // Heuristic to goal
  f: number // Total cost (g + h)
  parent: AStarNode | null
}

/**
 * Priority queue for A* (simple binary heap).
 */
class PriorityQueue {
  private heap: AStarNode[] = []

  push(node: AStarNode): void {
    this.heap.push(node)
    this.bubbleUp(this.heap.length - 1)
  }

  pop(): AStarNode | undefined {
    if (this.heap.length === 0) return undefined
    if (this.heap.length === 1) return this.heap.pop()

    const result = this.heap[0]
    this.heap[0] = this.heap.pop()!
    this.bubbleDown(0)
    return result
  }

  isEmpty(): boolean {
    return this.heap.length === 0
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2)
      if (this.heap[index].f >= this.heap[parentIndex].f) break
      ;[this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]]
      index = parentIndex
    }
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length
    while (true) {
      const leftChild = 2 * index + 1
      const rightChild = 2 * index + 2
      let smallest = index

      if (leftChild < length && this.heap[leftChild].f < this.heap[smallest].f) {
        smallest = leftChild
      }
      if (rightChild < length && this.heap[rightChild].f < this.heap[smallest].f) {
        smallest = rightChild
      }
      if (smallest === index) break

      ;[this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]]
      index = smallest
    }
  }
}

/**
 * Manhattan distance heuristic.
 */
function manhattanDistance(a: PathfindingPosition, b: PathfindingPosition): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z)
}

/**
 * Create a position key for the closed set.
 */
function positionKey(pos: PathfindingPosition): string {
  return `${pos.x},${pos.y},${pos.z}`
}

/**
 * Check if a position is within bounds.
 */
function inBounds(
  pos: PathfindingPosition,
  dimensions: [number, number, number],
  offset: PathfindingPosition
): boolean {
  const localX = pos.x - offset.x
  const localY = pos.y - offset.y
  const localZ = pos.z - offset.z
  
  return (
    localX >= 0 && localX < dimensions[0] &&
    localY >= 0 && localY < dimensions[1] &&
    localZ >= 0 && localZ < dimensions[2]
  )
}

/**
 * Get block ID at position (returns 0 if out of bounds = air).
 */
function getBlockAt(
  pos: PathfindingPosition,
  blocks: Uint16Array,
  dimensions: [number, number, number],
  offset: PathfindingPosition
): number {
  if (!inBounds(pos, dimensions, offset)) {
    return 0 // Treat out of bounds as air
  }

  const localX = pos.x - offset.x
  const localY = pos.y - offset.y
  const localZ = pos.z - offset.z

  // Y-major order: y * width * depth + z * width + x
  const index = localY * dimensions[0] * dimensions[2] + localZ * dimensions[0] + localX
  return blocks[index]
}

/**
 * Check if a position is walkable (air with solid block below).
 */
function isWalkable(
  pos: PathfindingPosition,
  blocks: Uint16Array,
  dimensions: [number, number, number],
  offset: PathfindingPosition
): boolean {
  // Position must be air
  if (getBlockAt(pos, blocks, dimensions, offset) !== 0) {
    return false
  }

  // Block above must be air (headroom)
  const above = { x: pos.x, y: pos.y + 1, z: pos.z }
  if (getBlockAt(above, blocks, dimensions, offset) !== 0) {
    return false
  }

  // Block below must be solid
  const below = { x: pos.x, y: pos.y - 1, z: pos.z }
  return getBlockAt(below, blocks, dimensions, offset) !== 0
}

/**
 * Get valid neighbors for A* pathfinding.
 */
function getNeighbors(
  pos: PathfindingPosition,
  blocks: Uint16Array,
  dimensions: [number, number, number],
  offset: PathfindingPosition,
  config: PathfindingConfig
): PathfindingPosition[] {
  const neighbors: PathfindingPosition[] = []
  const maxStepHeight = config.maxStepHeight ?? 1
  const maxFallDistance = config.maxFallDistance ?? 3
  const allowDiagonals = config.allowDiagonals ?? false

  // Cardinal directions
  const directions = [
    { x: 1, y: 0, z: 0 },
    { x: -1, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 0, z: -1 },
  ]

  // Add diagonal directions if allowed
  if (allowDiagonals) {
    directions.push(
      { x: 1, y: 0, z: 1 },
      { x: 1, y: 0, z: -1 },
      { x: -1, y: 0, z: 1 },
      { x: -1, y: 0, z: -1 }
    )
  }

  for (const dir of directions) {
    const newPos = {
      x: pos.x + dir.x,
      y: pos.y + dir.y,
      z: pos.z + dir.z,
    }

    // Check if we can walk on the same level
    if (isWalkable(newPos, blocks, dimensions, offset)) {
      neighbors.push(newPos)
      continue
    }

    // Try stepping up
    for (let step = 1; step <= maxStepHeight; step++) {
      const upPos = { x: newPos.x, y: pos.y + step, z: newPos.z }
      if (isWalkable(upPos, blocks, dimensions, offset)) {
        neighbors.push(upPos)
        break
      }
    }

    // Try stepping down
    for (let fall = 1; fall <= maxFallDistance; fall++) {
      const downPos = { x: newPos.x, y: pos.y - fall, z: newPos.z }
      if (isWalkable(downPos, blocks, dimensions, offset)) {
        neighbors.push(downPos)
        break
      }
    }
  }

  return neighbors
}

/**
 * Reconstruct path from A* node.
 */
function reconstructPath(node: AStarNode): PathfindingPosition[] {
  const path: PathfindingPosition[] = []
  let current: AStarNode | null = node
  
  while (current !== null) {
    path.unshift(current.pos)
    current = current.parent
  }
  
  return path
}

/**
 * Perform A* pathfinding.
 */
function findPath(request: PathfindingRequest): PathfindingResult {
  const { start, goal, blocks, dimensions, offset, config } = request
  const maxDistance = config.maxDistance ?? 100
  const maxNodes = config.maxNodes ?? 10000

  // Check if start and goal are valid
  if (!isWalkable(start, blocks, dimensions, offset)) {
    return {
      success: false,
      path: [],
      cost: 0,
      nodesExplored: 0,
    }
  }

  if (!isWalkable(goal, blocks, dimensions, offset)) {
    return {
      success: false,
      path: [],
      cost: 0,
      nodesExplored: 0,
    }
  }

  // Check distance constraint
  if (manhattanDistance(start, goal) > maxDistance) {
    return {
      success: false,
      path: [],
      cost: 0,
      nodesExplored: 0,
    }
  }

  const openSet = new PriorityQueue()
  const closedSet = new Set<string>()

  const startNode: AStarNode = {
    pos: start,
    g: 0,
    h: manhattanDistance(start, goal),
    f: manhattanDistance(start, goal),
    parent: null,
  }

  openSet.push(startNode)
  let nodesExplored = 0

  while (!openSet.isEmpty()) {
    const current = openSet.pop()!
    nodesExplored++

    // Check if we reached the goal
    if (
      current.pos.x === goal.x &&
      current.pos.y === goal.y &&
      current.pos.z === goal.z
    ) {
      const path = reconstructPath(current)
      return {
        success: true,
        path,
        cost: current.g,
        nodesExplored,
      }
    }

    // Check node limit
    if (nodesExplored >= maxNodes) {
      break
    }

    const key = positionKey(current.pos)
    if (closedSet.has(key)) continue
    closedSet.add(key)

    // Explore neighbors
    const neighbors = getNeighbors(current.pos, blocks, dimensions, offset, config)
    
    for (const neighborPos of neighbors) {
      const neighborKey = positionKey(neighborPos)
      if (closedSet.has(neighborKey)) continue

      // Cost is 1 for cardinal moves, 1.4 for diagonal
      const isDiagonal = 
        Math.abs(neighborPos.x - current.pos.x) === 1 &&
        Math.abs(neighborPos.z - current.pos.z) === 1
      const moveCost = isDiagonal ? 1.4 : 1

      const g = current.g + moveCost
      const h = manhattanDistance(neighborPos, goal)
      const f = g + h

      const neighbor: AStarNode = {
        pos: neighborPos,
        g,
        h,
        f,
        parent: current,
      }

      openSet.push(neighbor)
    }
  }

  // No path found
  return {
    success: false,
    path: [],
    cost: 0,
    nodesExplored,
  }
}

/**
 * Process a pathfinding request.
 */
function processRequest(request: PathfindingRequest): PathfindingResponse {
  const result = findPath(request)

  return {
    type: 'pathResult',
    requestId: request.requestId,
    result,
  }
}

// Worker message handler
self.onmessage = (event: MessageEvent<PathfindingRequest>) => {
  const request = event.data

  try {
    const response = processRequest(request)
    self.postMessage(response)
  } catch (error) {
    const errorResponse: PathfindingError = {
      type: 'pathError',
      requestId: request.requestId,
      error: error instanceof Error ? error.message : String(error),
    }
    self.postMessage(errorResponse)
  }
}
