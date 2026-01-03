# PathfindingService

The PathfindingService provides A* pathfinding capabilities using Web Workers for off-main-thread computation. It manages a pool of workers and queues pathfinding jobs with priority support.

## Quick Start

```typescript
import { PathfindingService } from './world/PathfindingService'
import type { PathfindingPosition } from './world/interfaces/IPathfinding'

// Create service with 2 worker threads
const pathfinder = new PathfindingService({ workerCount: 2 })

// Define start and goal
const start: PathfindingPosition = { x: 0, y: 1, z: 0 }
const goal: PathfindingPosition = { x: 10, y: 1, z: 10 }

// Get block data for the area (see "Preparing Block Data" below)
const blocks = getBlocksForArea(start, goal)
const dimensions: [number, number, number] = [32, 10, 32]
const offset: PathfindingPosition = { x: -5, y: 0, z: -5 }

// Request a path
pathfinder.findPath(
  start,
  goal,
  blocks,
  dimensions,
  offset,
  (result) => {
    if (result.success) {
      console.log('Path found:', result.path)
      console.log('Cost:', result.cost)
      console.log('Nodes explored:', result.nodesExplored)
    } else {
      console.log('No path found')
    }
  }
)

// Clean up when done
pathfinder.dispose()
```

## API Reference

### PathfindingService

#### Constructor

```typescript
new PathfindingService(config?: PathfindingServiceConfig)
```

Configuration options:
- `workerCount`: Number of worker threads (default: 2)
- `debug`: Enable debug logging (default: false)

#### findPath()

```typescript
findPath(
  start: PathfindingPosition,
  goal: PathfindingPosition,
  blocks: Uint16Array,
  dimensions: [number, number, number],
  offset: PathfindingPosition,
  callback: PathfindingCallback,
  config?: PathfindingConfig,
  priority?: number
): string
```

Request a path from start to goal. Returns a request ID that can be used to cancel.

**Parameters:**
- `start`: Starting position in world coordinates
- `goal`: Goal position in world coordinates
- `blocks`: Block data as Uint16Array (0 = air, non-zero = solid)
- `dimensions`: Size of blocks array [width, height, depth]
- `offset`: World coordinate offset for the blocks array
- `callback`: Function called when pathfinding completes
- `config`: Optional pathfinding configuration
- `priority`: Job priority (higher = processed first, default: 0)

**PathfindingConfig options:**
- `maxDistance`: Maximum Manhattan distance to search (default: 100)
- `maxNodes`: Maximum nodes to explore (default: 10000)
- `allowDiagonals`: Enable diagonal movement (default: false)
- `maxStepHeight`: Maximum blocks to step up (default: 1)
- `maxFallDistance`: Maximum blocks to fall (default: 3)

#### cancel()

```typescript
cancel(requestId: string): boolean
```

Cancel a pathfinding request. Returns true if cancelled.

#### getStats()

```typescript
getStats(): {
  queued: number
  processing: number
  workerCount: number
  busyWorkers: number
}
```

Get service statistics.

#### dispose()

```typescript
dispose(): void
```

Terminate all workers and clean up resources.

## Preparing Block Data

The pathfinding worker needs block data for the area around the path. The blocks should be provided as a Uint16Array where:
- `0` = air (walkable)
- Non-zero = solid block (not walkable)

The array uses Y-major ordering: `index = y * width * depth + z * width + x`

### Example: Extracting blocks from WorldManager

```typescript
function getBlocksForPath(
  world: WorldManager,
  start: PathfindingPosition,
  goal: PathfindingPosition,
  padding: number = 5
): {
  blocks: Uint16Array
  dimensions: [number, number, number]
  offset: PathfindingPosition
} {
  // Calculate bounding box
  const minX = Math.min(start.x, goal.x) - padding
  const maxX = Math.max(start.x, goal.x) + padding
  const minY = Math.min(start.y, goal.y) - padding
  const maxY = Math.max(start.y, goal.y) + padding
  const minZ = Math.min(start.z, goal.z) - padding
  const maxZ = Math.max(start.z, goal.z) + padding

  const width = maxX - minX + 1
  const height = maxY - minY + 1
  const depth = maxZ - minZ + 1

  const blocks = new Uint16Array(width * height * depth)

  // Fill blocks array
  for (let y = 0; y < height; y++) {
    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) {
        const worldX = BigInt(minX + x)
        const worldY = BigInt(minY + y)
        const worldZ = BigInt(minZ + z)
        
        const blockId = world.getBlockId(worldX, worldY, worldZ)
        const index = y * width * depth + z * width + x
        blocks[index] = blockId
      }
    }
  }

  return {
    blocks,
    dimensions: [width, height, depth],
    offset: { x: minX, y: minY, z: minZ },
  }
}
```

## Pathfinding Algorithm

The service uses the A* algorithm with these features:

- **Heuristic**: Manhattan distance
- **Movement**: Cardinal directions (+ diagonals if enabled)
- **Step up**: Can climb blocks up to `maxStepHeight`
- **Step down**: Can fall up to `maxFallDistance`
- **Headroom**: Requires 2 blocks of vertical space (player height)
- **Cost**: 1.0 for cardinal moves, 1.4 for diagonals

## Performance Considerations

### Worker Pool Size

- Use 2-4 workers for most cases
- More workers = more concurrent paths but higher memory usage
- Workers idle when no jobs are queued

### Block Data Size

- Larger areas = more memory and slower pathfinding
- Limit search area to what's needed (use padding parameter)
- Consider `maxDistance` to prevent excessive exploration

### Priority System

- Higher priority jobs are processed first
- Use priorities to ensure important paths (player, nearby entities) complete quickly
- Low priority for background/AI pathfinding

### Cancellation

- Cancel requests that are no longer needed (e.g., entity died, goal changed)
- Reduces wasted computation and memory

## Example: Entity AI

```typescript
class Entity {
  private pathfinder: PathfindingService
  private currentPathRequest: string | null = null
  private currentPath: PathfindingPosition[] = []
  private pathIndex = 0

  moveTo(goal: PathfindingPosition): void {
    // Cancel existing path request
    if (this.currentPathRequest) {
      this.pathfinder.cancel(this.currentPathRequest)
    }

    const start = this.getPosition()
    const { blocks, dimensions, offset } = getBlocksForPath(
      this.world,
      start,
      goal,
      10
    )

    this.currentPathRequest = this.pathfinder.findPath(
      start,
      goal,
      blocks,
      dimensions,
      offset,
      (result) => {
        this.currentPathRequest = null
        
        if (result.success) {
          this.currentPath = result.path
          this.pathIndex = 0
          this.followPath()
        } else {
          console.log('No path to goal')
        }
      },
      {
        allowDiagonals: true,
        maxStepHeight: 1,
        maxFallDistance: 3,
      },
      5 // Medium priority
    )
  }

  private followPath(): void {
    // Move along the path each frame
    if (this.pathIndex < this.currentPath.length) {
      const target = this.currentPath[this.pathIndex]
      // Move entity toward target...
      this.pathIndex++
    }
  }
}
```

## Debugging

Enable debug mode to see detailed logs:

```typescript
const pathfinder = new PathfindingService({ debug: true })
```

This logs:
- Worker initialization
- Job queuing and assignment
- Pathfinding results (success/failure, nodes explored, path length)
- Job cancellation

## Architecture

### Components

1. **PathfindingWorker.ts**: Web Worker that runs A* algorithm
2. **PathfindingService.ts**: Main thread service managing worker pool
3. **IPathfinding.ts**: Shared interfaces and types

### Message Flow

```
Main Thread                    Worker Thread
    |                               |
    | findPath() call               |
    | - Create job                  |
    | - Queue/assign to worker      |
    |------- PathfindingRequest --->|
    |                               | A* algorithm
    |                               | - Explore nodes
    |                               | - Find path
    |<------ PathfindingResponse ---|
    | Invoke callback               |
    | - Pass result to caller       |
```

### Zero-Copy Transfer

Block data is transferred to workers using ArrayBuffer transfer (zero-copy):
- Main thread loses access to the buffer
- Worker gets direct access without copying
- Reduces memory usage and improves performance

## Best Practices

1. **Reuse service instance**: Create one PathfindingService and use it for all paths
2. **Limit search area**: Only include blocks relevant to the path
3. **Cancel obsolete requests**: Free up workers when goals change
4. **Use priority**: Ensure important paths complete quickly
5. **Dispose on cleanup**: Call `dispose()` when shutting down

## Limitations

- Pathfinding is 3D grid-based (no flying/swimming physics)
- Assumes entity is 1 block wide and 2 blocks tall
- Does not consider entity velocity or momentum
- Does not handle dynamic obstacles (blocks changing during pathfinding)
