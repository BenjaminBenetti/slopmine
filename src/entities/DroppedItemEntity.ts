import * as THREE from 'three'
import { Entity } from './Entity.ts'
import type { IItem } from '../items/Item.ts'
import {
  getBlockForItem,
  createBlockDisplayMesh,
  disposeItemDisplayObject,
} from '../renderer/itemdisplay/index.ts'
import { buildExtrudedToolMesh } from '../renderer/helditem/meshes/ToolMesh.ts'

/** Physics hitbox size (cube, in blocks) */
const HITBOX_SIZE = 0.25

/** Visual scale for block-item cubes */
const BLOCK_SCALE = 0.3

/** Visual scale for extruded icon meshes (icon geometry is 0.7 blocks wide) */
const ICON_SCALE = 0.6

/** Height of the display mesh center above the physics feet position */
const DISPLAY_HEIGHT = 0.28

/** Idle bob animation */
const BOB_SPEED = 2.0 // radians/s
const BOB_AMPLITUDE = 0.05 // blocks

/** Idle spin animation */
const SPIN_SPEED = 1.2 // radians/s

/** Seconds after spawning before the item can be picked up (lets the drop pop out visibly) */
const PICKUP_DELAY = 0.5

/** Distance at which the item is collected into the inventory */
const PICKUP_RADIUS = 1.1

/** Distance at which the item starts flying toward the player */
const ATTRACT_RADIUS = 3.0

/** Speed of attraction flight (blocks/s) */
const ATTRACT_SPEED = 7.0

/** Retry interval after a failed collect (inventory full) */
const COLLECT_RETRY_INTERVAL = 1.0

/** Vertical offset from player feet to attraction target (torso height) */
const PLAYER_TORSO_HEIGHT = 0.9

/** Extra margin beyond ATTRACT_RADIUS the player must exit to arm a thrown drop */
const THROWN_ARM_MARGIN = 0.5

/** Thrown drops arm automatically after this many seconds regardless */
const THROWN_ARM_TIMEOUT = 5.0

/**
 * Configuration for spawning a dropped item.
 */
export interface IDroppedItemConfig {
  /** The item this drop represents */
  item: IItem
  /** Number of items in this drop (default 1) */
  count?: number
  /** Spawn position (feet, world coordinates) */
  position: THREE.Vector3
  /** Initial pop velocity (optional) */
  velocity?: THREE.Vector3
  /**
   * Seconds before the drop can be picked up (default PICKUP_DELAY).
   * Items thrown by the player use a longer delay so they aren't
   * vacuumed straight back into the inventory.
   */
  pickupDelay?: number
  /**
   * When true (items thrown by the player), the drop stays inert until the
   * player has once moved outside the attraction radius - or a short timeout
   * passes - so a throw that lands nearby isn't vacuumed straight back.
   */
  requirePlayerExit?: boolean
  /**
   * Called when the player is close enough to collect the drop.
   * Receives the item and the drop's current count; returns the leftover
   * count that did NOT fit in the inventory. Returning 0 despawns the
   * drop; a positive leftover keeps it in the world and is retried later.
   */
  onCollect: (item: IItem, count: number) => number
}

/**
 * An item lying on the ground, waiting to be picked up.
 *
 * Rendered the same way as the held-item view: block items appear as a
 * miniature of the block's REAL geometry and materials (torches, flowers,
 * slabs keep their shapes - see src/renderer/itemdisplay), everything else
 * as an extruded 3D pixel icon. The mesh bobs and spins above the physics
 * body, which falls and rests on the ground like any other entity.
 *
 * When the player comes within ATTRACT_RADIUS the drop flies toward them,
 * and within PICKUP_RADIUS it is collected via the onCollect callback.
 * Drops are cleaned up by EntityManager on chunk unload
 * (removeDroppedItemsInChunk) and by the standard distance despawn.
 */
export class DroppedItemEntity extends Entity {
  readonly type = 'dropped_item'

  private readonly item: IItem
  private count: number
  private readonly onCollect: (item: IItem, count: number) => number
  private readonly pickupDelay: number

  private playerPositionRef: THREE.Vector3 | null = null

  private display: THREE.Group | null = null
  private age = 0
  private bobPhase = Math.random() * Math.PI * 2
  private collectCooldown = 0
  private armed: boolean

  constructor(config: IDroppedItemConfig) {
    super('dropped_item', {
      position: config.position,
      velocity: config.velocity,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(HITBOX_SIZE, HITBOX_SIZE, HITBOX_SIZE),
    })

    this.item = config.item
    this.count = config.count ?? 1
    this.onCollect = config.onCollect
    this.pickupDelay = config.pickupDelay ?? PICKUP_DELAY
    this.armed = !(config.requirePlayerExit ?? false)

    // Apply the initial pop velocity to the physics body
    if (config.velocity) {
      const body = this.getPhysicsBody()
      body?.velocity.copy(config.velocity)
    }
  }

  /**
   * Called by EntityManager on spawn - gives us a live reference to the
   * player's position for attraction/pickup checks.
   */
  setPlayerPositionRef(positionRef: THREE.Vector3): void {
    this.playerPositionRef = positionRef
  }

  protected createMesh(): THREE.Object3D {
    const group = new THREE.Group()

    // Inner group carries the bob/spin animation so the outer group can be
    // freely position-synced with the physics body by Entity.update()
    const display = new THREE.Group()
    display.position.y = DISPLAY_HEIGHT
    group.add(display)
    this.display = display

    const block = getBlockForItem(this.item)

    if (block) {
      // Miniature of the block's real geometry and materials - the same ones
      // the world renderer uses, so custom shapes (torches, flowers, slabs)
      // look identical on the ground (shared resources, flagged for disposal)
      const mesh = createBlockDisplayMesh(block)
      mesh.scale.setScalar(BLOCK_SCALE)
      display.add(mesh)
    } else if (this.item.iconUrl) {
      // Extruded 3D pixel icon (shared cached geometry/material - do not dispose)
      buildExtrudedToolMesh(this.item.iconUrl)
        .then((mesh) => {
          mesh.scale.setScalar(ICON_SCALE)
          display.add(mesh)
        })
        .catch(() => {
          display.add(this.createFallbackMesh())
        })
    } else {
      display.add(this.createFallbackMesh())
    }

    return group
  }

  private createFallbackMesh(): THREE.Mesh {
    // Owned (unflagged) resources - disposeItemDisplayObject will free them
    const geometry = new THREE.BoxGeometry(BLOCK_SCALE, BLOCK_SCALE, BLOCK_SCALE)
    const material = new THREE.MeshLambertMaterial({ color: 0x888888 })
    return new THREE.Mesh(geometry, material)
  }

  update(deltaTime: number): void {
    super.update(deltaTime)

    this.age += deltaTime
    if (this.collectCooldown > 0) {
      this.collectCooldown -= deltaTime
    }

    // Idle bob and spin
    if (this.display) {
      this.bobPhase += deltaTime * BOB_SPEED
      this.display.position.y = DISPLAY_HEIGHT + Math.sin(this.bobPhase) * BOB_AMPLITUDE
      this.display.rotation.y += SPIN_SPEED * deltaTime
    }

    if (!this.playerPositionRef || this.age < this.pickupDelay) {
      return
    }

    // Vector from drop to the player's torso
    const dx = this.playerPositionRef.x - this.position.x
    const dy = this.playerPositionRef.y + PLAYER_TORSO_HEIGHT - this.position.y
    const dz = this.playerPositionRef.z - this.position.z
    const distSq = dx * dx + dy * dy + dz * dz

    // Thrown drops arm once the player has stepped outside the attraction
    // radius (or after a timeout), so a throw that lands close by isn't
    // vacuumed straight back into the inventory
    if (!this.armed) {
      const armRadius = ATTRACT_RADIUS + THROWN_ARM_MARGIN
      if (distSq > armRadius * armRadius || this.age >= THROWN_ARM_TIMEOUT) {
        this.armed = true
      } else {
        const body = this.getPhysicsBody()
        if (body?.isOnGround) {
          body.velocity.x = 0
          body.velocity.z = 0
        }
        return
      }
    }

    // Close enough to collect
    if (distSq <= PICKUP_RADIUS * PICKUP_RADIUS) {
      if (this.collectCooldown <= 0) {
        const leftover = this.onCollect(this.item, this.count)
        if (leftover <= 0) {
          this.kill()
          return
        }
        // Inventory full (or partially full) - keep the remainder and back
        // off before retrying (also pauses attraction so the drop settles
        // instead of orbiting the player)
        this.count = leftover
        this.collectCooldown = COLLECT_RETRY_INTERVAL
      }
      return
    }

    // Fly toward the player when in attraction range
    const body = this.getPhysicsBody()
    if (!body) return

    if (this.collectCooldown <= 0 && distSq <= ATTRACT_RADIUS * ATTRACT_RADIUS) {
      const dist = Math.sqrt(distSq)
      body.velocity.x = (dx / dist) * ATTRACT_SPEED
      body.velocity.y = (dy / dist) * ATTRACT_SPEED
      body.velocity.z = (dz / dist) * ATTRACT_SPEED
    } else if (body.isOnGround) {
      // The engine applies no ground friction - stop the pop/attraction
      // momentum once the drop lands so it doesn't slide forever
      body.velocity.x = 0
      body.velocity.z = 0
    }
  }

  /**
   * Deliberately does NOT call super.dispose(): the base class disposes the
   * mesh tree naively, but our display meshes reference SHARED resources
   * (block registry geometry/materials, the extruded-icon cache). The
   * flag-aware helper disposes only resources this entity owns.
   */
  dispose(): void {
    const mesh = this.getMesh()
    if (mesh) {
      disposeItemDisplayObject(mesh)
    }
    this.display = null
  }
}
