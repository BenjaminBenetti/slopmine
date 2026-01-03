/**
 * Example usage of the PathfindingService.
 * This demonstrates how to use the pathfinding worker system.
 */

import { PathfindingService } from './PathfindingService.ts'
import type { PathfindingPosition } from './interfaces/IPathfinding.ts'

/**
 * Example: Find a path in a simple test environment.
 */
export function examplePathfinding(): void {
  // Create the pathfinding service with 2 workers
  const pathfindingService = new PathfindingService({
    workerCount: 2,
    debug: true,
  })

  // Create a simple test environment (10x10x10 block area)
  // 0 = air, 1 = solid block
  const dimensions: [number, number, number] = [10, 10, 10]
  const blocks = new Uint16Array(10 * 10 * 10)

  // Fill the bottom layer with solid blocks (y=0)
  for (let x = 0; x < 10; x++) {
    for (let z = 0; z < 10; z++) {
      const index = 0 * 10 * 10 + z * 10 + x // y=0
      blocks[index] = 1 // solid block
    }
  }

  // Add a wall in the middle (y=1, x=5)
  for (let z = 0; z < 8; z++) {
    const index = 1 * 10 * 10 + z * 10 + 5 // y=1, x=5
    blocks[index] = 1 // solid block
  }

  // Define start and goal positions
  const start: PathfindingPosition = { x: 0, y: 1, z: 0 }
  const goal: PathfindingPosition = { x: 9, y: 1, z: 0 }

  // The offset tells the pathfinder how to convert array indices to world coordinates
  const offset: PathfindingPosition = { x: 0, y: 0, z: 0 }

  // Request a path with a callback
  const requestId = pathfindingService.findPath(
    start,
    goal,
    blocks,
    dimensions,
    offset,
    (result) => {
      if (result.success) {
        console.log('Path found!')
        console.log('Path length:', result.path.length)
        console.log('Cost:', result.cost)
        console.log('Nodes explored:', result.nodesExplored)
        console.log('Path:', result.path)
      } else {
        console.log('No path found')
        console.log('Nodes explored:', result.nodesExplored)
      }

      // Clean up
      pathfindingService.dispose()
    },
    {
      maxDistance: 100,
      maxNodes: 10000,
      allowDiagonals: true,
      maxStepHeight: 1,
      maxFallDistance: 3,
    },
    10 // High priority
  )

  console.log('Pathfinding request submitted:', requestId)

  // You can cancel the request if needed:
  // pathfindingService.cancel(requestId)

  // Check service stats
  console.log('Service stats:', pathfindingService.getStats())
}

/**
 * Example: Multiple concurrent pathfinding requests.
 */
export function exampleMultiplePaths(): void {
  const pathfindingService = new PathfindingService({
    workerCount: 2,
    debug: true,
  })

  // Create a flat world for testing
  const dimensions: [number, number, number] = [32, 10, 32]
  const blocks = new Uint16Array(32 * 10 * 32)

  // Floor at y=0
  for (let x = 0; x < 32; x++) {
    for (let z = 0; z < 32; z++) {
      blocks[0 * 32 * 32 + z * 32 + x] = 1
    }
  }

  const offset: PathfindingPosition = { x: 0, y: 0, z: 0 }

  // Submit multiple pathfinding jobs
  const jobs = [
    { start: { x: 0, y: 1, z: 0 }, goal: { x: 31, y: 1, z: 31 }, priority: 5 },
    { start: { x: 0, y: 1, z: 31 }, goal: { x: 31, y: 1, z: 0 }, priority: 3 },
    { start: { x: 16, y: 1, z: 16 }, goal: { x: 8, y: 1, z: 8 }, priority: 10 },
  ]

  let completedJobs = 0

  jobs.forEach((job, index) => {
    pathfindingService.findPath(
      job.start,
      job.goal,
      blocks,
      dimensions,
      offset,
      (result) => {
        console.log(`Job ${index} completed:`, result.success ? 'Success' : 'Failed')
        completedJobs++

        if (completedJobs === jobs.length) {
          console.log('All jobs completed')
          pathfindingService.dispose()
        }
      },
      { maxDistance: 100, allowDiagonals: true },
      job.priority
    )
  })

  console.log('Submitted', jobs.length, 'pathfinding jobs')
}
