import * as THREE from 'three'
import type { BlockId } from '../world/interfaces/IBlock.ts'
import type { WorldManager } from '../world/WorldManager.ts'
import type { IPlayerState } from './PlayerState.ts'
import type { EntityManager } from '../entities/EntityManager.ts'
import type { IEntity } from '../entities/interfaces/IEntity.ts'
import { BlockRaycaster, type IBlockRaycastHit } from './BlockRaycaster.ts'
import { MiningOverlay } from '../renderer/MiningOverlay.ts'
import { BlockIds } from '../world/blocks/BlockIds.ts'
import { calculateMiningDamage } from './MiningDamage.ts'
import { hasToolStats, HAND_STATS } from '../items/interfaces/IToolStats.ts'

/** Maximum reach distance for block interaction */
const MAX_REACH_DISTANCE = 5

/**
 * Tracks the current mining progress.
 */
interface IMiningProgress {
  worldX: bigint
  worldY: bigint
  worldZ: bigint
  blockId: BlockId
  progress: number
  requiredTime: number
  /** Interaction box in world space (for overlay sizing) */
  interactionBox: THREE.Box3
}

/**
 * Configuration for block interaction.
 */
export interface IBlockInteractionConfig {
  maxReachDistance?: number
  /** Called after items are collected from a broken block */
  onItemsCollected?: () => void
  /** Entity manager for hitting entities */
  entityManager?: EntityManager
}

/**
 * Handles player interaction with blocks (breaking).
 * Coordinates raycasting, mining progress, visual feedback, and item drops.
 */
export class BlockInteraction {
  private readonly camera: THREE.PerspectiveCamera
  private readonly worldManager: WorldManager
  private readonly playerState: IPlayerState
  private readonly entityManager: EntityManager | null
  private readonly raycaster: BlockRaycaster
  private readonly miningOverlay: MiningOverlay
  private readonly domElement: HTMLElement

  private readonly maxReachDistance: number
  private readonly onItemsCollected?: () => void

  private isMouseDown = false
  private hasHitEntityThisClick = false
  private currentMining: IMiningProgress | null = null

  // Pre-allocated vectors for entity hit detection
  private readonly rayOrigin = new THREE.Vector3()
  private readonly rayDirection = new THREE.Vector3()
  private readonly aabbMin = new THREE.Vector3()
  private readonly aabbMax = new THREE.Vector3()

  constructor(
    camera: THREE.PerspectiveCamera,
    worldManager: WorldManager,
    playerState: IPlayerState,
    scene: THREE.Scene,
    domElement: HTMLElement,
    config: IBlockInteractionConfig = {}
  ) {
    this.camera = camera
    this.worldManager = worldManager
    this.playerState = playerState
    this.entityManager = config.entityManager ?? null
    this.domElement = domElement

    this.maxReachDistance = config.maxReachDistance ?? MAX_REACH_DISTANCE
    this.onItemsCollected = config.onItemsCollected

    this.raycaster = new BlockRaycaster(worldManager)
    this.miningOverlay = new MiningOverlay(scene)

    this.setupEventListeners()
  }

  /**
   * Update mining progress. Call this every frame.
   * @param deltaTime - Time since last frame in seconds
   */
  update(deltaTime: number): void {
    if (!this.isMouseDown) {
      return
    }

    // Only process when pointer is locked (in-game)
    if (document.pointerLockElement !== this.domElement) {
      this.cancelMining()
      return
    }

    // Get ray from camera for both block and entity detection
    this.camera.getWorldPosition(this.rayOrigin)
    this.camera.getWorldDirection(this.rayDirection)

    // Check for entity hit first
    const entityHit = this.checkEntityHit()

    // Perform raycast to find target block
    const blockHit = this.raycaster.castFromCamera(this.camera, this.maxReachDistance)

    // Determine what to interact with (closer target wins)
    // Only hit entity once per click (not continuously while held)
    if (entityHit && !this.hasHitEntityThisClick) {
      const entityDist = entityHit.distance
      const blockDist = blockHit?.distance ?? Infinity

      if (entityDist < blockDist) {
        // Hit entity - instant interaction, no mining progress
        this.cancelMining()
        this.hitEntity(entityHit.entity)
        this.hasHitEntityThisClick = true
        return
      }
    }

    // No entity hit or block is closer - proceed with block mining
    if (!blockHit) {
      // No block in range
      this.cancelMining()
      return
    }

    // Check if we're still targeting the same block
    if (this.currentMining) {
      if (
        blockHit.worldX !== this.currentMining.worldX ||
        blockHit.worldY !== this.currentMining.worldY ||
        blockHit.worldZ !== this.currentMining.worldZ
      ) {
        // Target changed, restart mining
        this.startMining(blockHit)
        return
      }
    } else {
      // Start mining new block
      this.startMining(blockHit)
      return
    }

    // Continue mining
    this.updateMining(deltaTime)
  }

  /**
   * Check if the player is performing a mining action (left mouse down).
   * Returns true when left mouse is down and pointer is locked,
   * regardless of whether a block is being targeted.
   */
  isMining(): boolean {
    return this.isMouseDown && document.pointerLockElement === this.domElement
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    this.removeEventListeners()
    this.miningOverlay.dispose()
  }

  private setupEventListeners(): void {
    this.domElement.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('mouseup', this.onMouseUp)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
  }

  private removeEventListeners(): void {
    this.domElement.removeEventListener('mousedown', this.onMouseDown)
    window.removeEventListener('mouseup', this.onMouseUp)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
  }

  private onMouseDown = (event: MouseEvent): void => {
    // Only handle left mouse button
    if (event.button !== 0) return

    // Only handle when pointer is locked
    if (document.pointerLockElement !== this.domElement) return

    this.isMouseDown = true
  }

  private onMouseUp = (event: MouseEvent): void => {
    // Only handle left mouse button
    if (event.button !== 0) return

    this.isMouseDown = false
    this.hasHitEntityThisClick = false
    this.cancelMining()
  }

  private onPointerLockChange = (): void => {
    // Cancel mining if pointer lock is released
    if (document.pointerLockElement !== this.domElement) {
      this.isMouseDown = false
      this.hasHitEntityThisClick = false
      this.cancelMining()
    }
  }

  private startMining(hit: IBlockRaycastHit): void {
    // Get currently held item's tool stats
    const selectedIndex = this.playerState.inventory.toolbar.selectedIndex
    const heldItem = this.playerState.inventory.toolbar.getItem(selectedIndex)
    const toolStats = heldItem && hasToolStats(heldItem) ? heldItem.toolStats : HAND_STATS

    // Calculate mining result based on tool vs block
    const miningResult = calculateMiningDamage(hit.block, toolStats)

    // Cannot mine this block with current tool
    if (!miningResult.canMine) {
      this.currentMining = null
      return
    }

    this.currentMining = {
      worldX: hit.worldX,
      worldY: hit.worldY,
      worldZ: hit.worldZ,
      blockId: hit.blockId,
      progress: 0,
      requiredTime: miningResult.miningTime,
      interactionBox: hit.interactionBox.clone(),
    }

    // Show overlay matching the block's interaction box
    this.miningOverlay.showBox(this.currentMining.interactionBox, 0)
  }

  private updateMining(deltaTime: number): void {
    if (!this.currentMining) return

    // Increase progress based on time
    this.currentMining.progress += deltaTime / this.currentMining.requiredTime

    // Update visual overlay matching the block's interaction box
    this.miningOverlay.showBox(
      this.currentMining.interactionBox,
      this.currentMining.progress
    )

    // Check if mining is complete
    if (this.currentMining.progress >= 1.0) {
      this.completeMining()
    }
  }

  private completeMining(): void {
    if (!this.currentMining) return

    const { worldX, worldY, worldZ } = this.currentMining
    const block = this.worldManager.getBlock(worldX, worldY, worldZ)

    // Get drops from block and add to inventory
    const drops = block.getDrops?.() ?? []
    for (const item of drops) {
      this.playerState.addItem(item)
    }

    // Notify listeners that items were collected
    if (drops.length > 0) {
      this.onItemsCollected?.()
    }

    // Remove block entity if it exists (before onBreak hook)
    this.worldManager.removeBlockEntityAt(worldX, worldY, worldZ)

    // Call the block's onBreak hook if it exists (before removing the block)
    if (block.onBreak) {
      block.onBreak(this.worldManager, worldX, worldY, worldZ)
    }

    // Set block to air (automatically queues affected sub-chunk for remeshing)
    this.worldManager.setBlock(worldX, worldY, worldZ, BlockIds.AIR)

    // Hide overlay and reset state
    this.miningOverlay.hide()
    this.currentMining = null
  }

  private cancelMining(): void {
    if (this.currentMining) {
      this.miningOverlay.hide()
      this.currentMining = null
    }
  }

  /**
   * Check for entity hit using ray-AABB intersection.
   * Returns the closest entity hit within reach distance.
   */
  private checkEntityHit(): { entity: IEntity; distance: number } | null {
    if (!this.entityManager) return null

    // Get nearby entities
    const nearbyEntities = this.entityManager.getEntitiesNear(this.rayOrigin, this.maxReachDistance)

    let closestHit: { entity: IEntity; distance: number } | null = null

    for (const entity of nearbyEntities) {
      // Skip if entity can't be interacted with
      if (!entity.canPlayerInteract?.(this.rayOrigin, this.maxReachDistance)) {
        continue
      }

      // Get entity AABB from physics body or estimate from position
      const physicsBody = entity.getPhysicsBody()
      if (!physicsBody) continue

      // Get hitbox AABBs and test intersection with each
      const aabbs = physicsBody.getAABBs()
      for (const aabb of aabbs) {
        const distance = this.rayIntersectsAABB(
          this.rayOrigin,
          this.rayDirection,
          aabb.min,
          aabb.max
        )

        if (distance !== null && distance <= this.maxReachDistance) {
          if (!closestHit || distance < closestHit.distance) {
            closestHit = { entity, distance }
          }
        }
      }
    }

    return closestHit
  }

  /**
   * Hit an entity - call its interaction hook and collect drops if it dies.
   */
  private hitEntity(entity: IEntity): void {
    // Get currently held item
    const selectedIndex = this.playerState.inventory.toolbar.selectedIndex
    const heldItem = this.playerState.inventory.toolbar.getItem(selectedIndex)

    // Call entity interaction hook
    entity.onPlayerInteract?.(this.rayOrigin, true, heldItem)

    // Check if entity died (or is dying) and collect drops
    // We check isDying because the entity plays a death animation before isAlive becomes false
    if ((!entity.isAlive || entity.isDying) && entity.getDrops) {
      const drops = entity.getDrops()
      for (const item of drops) {
        this.playerState.addItem(item)
      }

      // Notify listeners that items were collected
      if (drops.length > 0) {
        this.onItemsCollected?.()
      }
    }
  }

  /**
   * Ray-AABB intersection using slab method.
   * Returns distance to intersection, or null if no hit.
   */
  private rayIntersectsAABB(
    rayOrigin: THREE.Vector3,
    rayDir: THREE.Vector3,
    aabbMin: THREE.Vector3,
    aabbMax: THREE.Vector3
  ): number | null {
    let tMin = 0
    let tMax = Infinity

    for (let i = 0; i < 3; i++) {
      const axis = i === 0 ? 'x' : i === 1 ? 'y' : 'z'
      const origin = rayOrigin[axis]
      const dir = rayDir[axis]
      const min = aabbMin[axis]
      const max = aabbMax[axis]

      if (Math.abs(dir) < 1e-8) {
        // Ray is parallel to slab
        if (origin < min || origin > max) {
          return null
        }
      } else {
        // Compute intersection t values
        let t1 = (min - origin) / dir
        let t2 = (max - origin) / dir

        if (t1 > t2) {
          const temp = t1
          t1 = t2
          t2 = temp
        }

        tMin = Math.max(tMin, t1)
        tMax = Math.min(tMax, t2)

        if (tMin > tMax) {
          return null
        }
      }
    }

    // Return distance if intersection is in front of ray
    return tMin >= 0 ? tMin : (tMax >= 0 ? tMax : null)
  }
}
