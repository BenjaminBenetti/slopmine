import * as THREE from 'three'
import type { BlockId } from '../world/interfaces/IBlock.ts'
import type { WorldManager } from '../world/WorldManager.ts'
import type { IPlayerState } from './PlayerState.ts'
import type { EntityManager } from '../entities/EntityManager.ts'
import { DroppedItemEntity } from '../entities/DroppedItemEntity.ts'
import type { IEntity } from '../entities/interfaces/IEntity.ts'
import type { IItem } from '../items/Item.ts'
import { BlockRaycaster, type IBlockRaycastHit } from './BlockRaycaster.ts'
import { MiningOverlay } from '../renderer/MiningOverlay.ts'
import { BlockIds } from '../world/blocks/BlockIds.ts'
import { calculateMiningDamage, describeRequiredTool } from './MiningDamage.ts'
import { hasToolStats, HAND_STATS } from '../items/interfaces/IToolStats.ts'
import { FloatingTextManager } from '../ui/floating-text/index.ts'
import { gameEvents } from '../events/GameEvents.ts'
import { getPlayerAttackCharge, isPlayerAttackReady, registerPlayerAttack } from '../combat/PlayerAttack.ts'
import { playBlockSound, playSound } from '../audio/SoundHooks.ts'

/** Maximum reach distance for block interaction */
export const MAX_REACH_DISTANCE = 5

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
  /** Seconds until the next strike sound. */
  strikeTimer: number
}

/** Mining strike cadence (seconds between hit sounds). */
const MINING_STRIKE_INTERVAL = 0.25

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

  /** Last block refused for lack of tool force (throttles the "Needs a ..." hint) */
  private lastRefusedKey = ''
  private lastRefusedAt = -Infinity
  /** Game time (s), for the hint throttle (matches the hint's own lifetime clock) */
  private gameTime = 0

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
    this.gameTime += deltaTime
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
    if (entityHit) {
      const entityDist = entityHit.distance
      const blockDist = blockHit?.distance ?? Infinity

      if (entityDist < blockDist) {
        // Entity in front - never mine the block behind it. A click hits
        // once; holding the button hits again whenever the attack is fully
        // charged (see src/combat/PlayerAttack.ts)
        this.cancelMining()
        if (!this.hasHitEntityThisClick || isPlayerAttackReady(this.getHeldItem())) {
          this.hitEntity(entityHit.entity)
          this.hasHitEntityThisClick = true
        }
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

    // Cannot mine this block with current tool: say which tool it needs
    if (!miningResult.canMine) {
      this.currentMining = null
      this.showMiningRefused(hit)
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
      strikeTimer: 0,
    }

    // Show overlay matching the block's interaction box
    this.miningOverlay.showBox(this.currentMining.interactionBox, 0)
  }

  /**
   * Floating "Needs a stone pickaxe" hint in front of a block the held tool
   * cannot mine. startMining() retries every frame while the button is held,
   * so the hint repeats at most every 2 s (game time) per block - after the
   * previous one has faded.
   */
  private showMiningRefused(hit: IBlockRaycastHit): void {
    const now = this.gameTime
    const key = `${hit.worldX},${hit.worldY},${hit.worldZ}`
    if (key === this.lastRefusedKey && now - this.lastRefusedAt < 2) return
    this.lastRefusedKey = key
    this.lastRefusedAt = now
    playSound('ui.refused')

    // Between the hit point and the camera, so it is not buried in the block
    const position = this.rayOrigin.clone().sub(hit.point)
    const length = position.length()
    position.multiplyScalar(length > 0 ? Math.min(0.8, length * 0.5) / length : 0).add(hit.point)
    position.y += 0.25
    FloatingTextManager.instance.spawn({
      text: describeRequiredTool(hit.block),
      position,
      mode: 'floating',
      duration: 1.6,
      floatSpeed: 0.25,
      scale: 0.55,
    })
  }

  private updateMining(deltaTime: number): void {
    if (!this.currentMining) return

    // Increase progress based on time
    this.currentMining.progress += deltaTime / this.currentMining.requiredTime

    // Strike sound on a steady cadence (the first one as the swing starts)
    this.currentMining.strikeTimer -= deltaTime
    if (this.currentMining.strikeTimer <= 0 && this.currentMining.progress < 1.0) {
      this.currentMining.strikeTimer = MINING_STRIKE_INTERVAL
      const { worldX, worldY, worldZ, blockId } = this.currentMining
      playBlockSound(blockId, 'hit', { x: Number(worldX) + 0.5, y: Number(worldY) + 0.5, z: Number(worldZ) + 0.5 })
    }

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

    // Transfer items held in block state (chest/bench slots) FIRST - if they
    // don't all fit, the block must survive so no contents are destroyed.
    // getStateDrops returns the LIVE state stacks, so writing the leftover
    // count back keeps the untransferred remainder inside the block.
    const stateDrops = block.getStateDrops?.(worldX, worldY, worldZ) ?? []
    let transferredAny = false
    let hasLeftover = false
    for (const stack of stateDrops) {
      const leftover = this.playerState.addItemCounted(stack.item, stack.count)
      if (leftover < stack.count) {
        transferredAny = true
      }
      if (leftover > 0) {
        hasLeftover = true
      }
      stack.count = leftover
    }

    if (hasLeftover) {
      // Inventory full - keep the block (with its remaining contents) intact
      block.compactStateSlots?.(worldX, worldY, worldZ)

      FloatingTextManager.instance.spawn({
        text: 'Inventory full!',
        position: new THREE.Vector3(Number(worldX) + 0.5, Number(worldY) + 1.2, Number(worldZ) + 0.5),
        mode: 'floating',
        duration: 2,
      })

      this.miningOverlay.hide()
      this.currentMining = null

      if (transferredAny) {
        this.onItemsCollected?.()
      }
      return
    }

    // Everything fit - clear the now-empty state slots before breaking
    block.compactStateSlots?.(worldX, worldY, worldZ)

    // Scatter the block's drops on the ground as dropped item entities
    const drops = block.getDrops?.() ?? []
    this.spawnDrops(drops, worldX, worldY, worldZ)

    // Notify listeners about the directly-transferred state drops
    // (regular drops notify later, when the dropped entity is picked up)
    if (stateDrops.length > 0) {
      this.onItemsCollected?.()
    }

    const heldForEvent = this.playerState.inventory.toolbar.getItem(
      this.playerState.inventory.toolbar.selectedIndex
    )
    gameEvents.emit({
      type: 'block-mined',
      blockId: block.properties.id,
      blockName: block.properties.name,
      x: Number(worldX),
      y: Number(worldY),
      z: Number(worldZ),
      toolId: heldForEvent?.id ?? null,
    })

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

  /**
   * Spawn drops as physical items scattered around the broken block's center.
   * Falls back to direct inventory pickup if no entity manager is available.
   */
  private spawnDrops(drops: IItem[], worldX: bigint, worldY: bigint, worldZ: bigint): void {
    if (drops.length === 0) return

    if (!this.entityManager) {
      for (const item of drops) {
        this.playerState.addItem(item)
      }
      this.onItemsCollected?.()
      return
    }

    for (const item of drops) {
      const drop = new DroppedItemEntity({
        item,
        position: new THREE.Vector3(
          Number(worldX) + 0.5,
          Number(worldY) + 0.4,
          Number(worldZ) + 0.5
        ),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 3,
          3.2,
          (Math.random() - 0.5) * 3
        ),
        onCollect: (collected, count) => {
          const leftover = this.playerState.addItemCounted(collected, count)
          if (leftover < count) {
            this.onItemsCollected?.()
          }
          return leftover
        },
      })
      this.entityManager.addEntity(drop)
    }
  }

  private cancelMining(): void {
    if (this.currentMining) {
      this.miningOverlay.hide()
      this.currentMining = null
    }
  }

  private getHeldItem(): IItem | null {
    const toolbar = this.playerState.inventory.toolbar
    return toolbar.getItem(toolbar.selectedIndex)
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

    const wasDown = !entity.isAlive || entity.isDying === true
    const charge = getPlayerAttackCharge(heldItem)

    // Call entity interaction hook (it takes its damage from
    // getPlayerAttackDamage), then restart the attack cooldown
    entity.onPlayerInteract?.(this.rayOrigin, true, heldItem)
    registerPlayerAttack(heldItem)

    gameEvents.emit({
      type: 'entity-hit',
      entityType: entity.type,
      x: entity.position.x,
      y: entity.position.y,
      z: entity.position.z,
      charge,
      killed: !wasDown && (!entity.isAlive || !!entity.isDying),
      blocked: entity.lastHitBlocked === true,
    })

    if (!wasDown && (!entity.isAlive || entity.isDying) && entity.countsAsKill !== false) {
      gameEvents.emit({
        type: 'entity-killed',
        entityType: entity.type,
        x: entity.position.x,
        y: entity.position.y,
        z: entity.position.z,
      })
    }

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
