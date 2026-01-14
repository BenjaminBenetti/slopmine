import type * as THREE from 'three'
import type { IPhysicsBody } from '../../physics/interfaces/IPhysicsBody.ts'
import type { IItem } from '../../items/Item.ts'

/**
 * Unique identifier for entities.
 */
export type EntityId = string

/**
 * Entity state for lifecycle management.
 */
export enum EntityState {
  /** Entity exists but is not active in the world */
  INACTIVE = 0,
  /** Entity is active and being updated */
  ACTIVE = 1,
  /** Entity is marked for removal */
  DESPAWNING = 2,
  /** Entity has been disposed and should not be accessed */
  DISPOSED = 3,
}

/**
 * Core entity interface - all entities must implement this.
 *
 * Entities are game objects that exist in the world with:
 * - Position and optional velocity
 * - Visual representation (THREE.Object3D mesh)
 * - Per-frame update logic
 * - Lifecycle management (spawn, despawn, dispose)
 * - Optional physics integration
 * - Optional player interaction
 */
export interface IEntity {
  /** Unique identifier for this entity */
  readonly id: EntityId

  /** Human-readable type name (e.g., 'zombie', 'item_drop', 'projectile') */
  readonly type: string

  /** Current position in world space (center-bottom / feet position) */
  readonly position: THREE.Vector3

  /** Current velocity in blocks per second (null if static entity) */
  readonly velocity: THREE.Vector3 | null

  /** Current lifecycle state */
  state: EntityState

  /** Whether this entity is alive and should be updated */
  readonly isAlive: boolean

  /**
   * Get the visual mesh for this entity.
   * Returns null for invisible entities.
   * The returned Object3D is managed by EntityManager for scene add/remove.
   */
  getMesh(): THREE.Object3D | null

  /**
   * Get the physics body for this entity.
   * Returns null for entities without physics.
   * Physics body is managed by EntityManager for physics engine add/remove.
   */
  getPhysicsBody(): IPhysicsBody | null

  /**
   * Update the entity for this frame.
   * Called every frame while entity is ACTIVE.
   * @param deltaTime Time since last frame in seconds
   */
  update(deltaTime: number): void

  /**
   * Called when entity is spawned into the world.
   * Mesh and physics body have already been added by EntityManager.
   */
  onSpawn(): void

  /**
   * Called when entity is about to be removed from the world.
   * Return false to cancel despawn, true to proceed.
   * Mesh and physics body will be removed after this returns true.
   */
  onDespawn(): boolean

  /**
   * Clean up all resources (meshes, materials, geometries, etc.).
   * Called after entity is removed from world.
   * Entity should not be used after dispose() is called.
   */
  dispose(): void

  /**
   * Handle player interaction with this entity.
   * @param playerPosition Player's current position
   * @param isLeftClick True for attack/use, false for interact
   * @param heldItem Currently held item (for damage calculation)
   * @returns True if interaction was handled
   */
  onPlayerInteract?(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean

  /**
   * Check if player can interact with this entity.
   * @param playerPosition Player's current position
   * @param maxDistance Maximum interaction distance
   */
  canPlayerInteract?(playerPosition: THREE.Vector3, maxDistance: number): boolean
}

/**
 * Extended interface for entities that need neighbor awareness.
 */
export interface INeighborAwareEntity extends IEntity {
  /**
   * Called when a nearby block changes.
   */
  onNearbyBlockChange?(worldX: bigint, worldY: bigint, worldZ: bigint): void

  /**
   * Called when another entity enters proximity.
   */
  onEntityNearby?(other: IEntity, distance: number): void
}
