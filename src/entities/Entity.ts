import * as THREE from 'three'
import { PhysicsBody } from '../physics/PhysicsBody.ts'
import type { IPhysicsBody } from '../physics/interfaces/IPhysicsBody.ts'
import type { IEntity, EntityId } from './interfaces/IEntity.ts'
import { EntityState } from './interfaces/IEntity.ts'
import type { IEntityConfig } from './interfaces/IEntityConfig.ts'
import { applyObjectWorldLight, setObjectLight, type ObjectLightUniform } from '../renderer/ObjectWorldLight.ts'

/**
 * Counter for generating unique entity IDs.
 */
let entityIdCounter = 0

/**
 * Generate a unique entity ID.
 */
function generateEntityId(type: string): EntityId {
  return `${type}_${++entityIdCounter}`
}

/**
 * Base class for entities.
 * Provides common functionality for position, velocity, mesh, and physics.
 *
 * Subclasses should:
 * 1. Override createMesh() to return their visual representation
 * 2. Override update() for custom behavior (call super.update(dt) first)
 * 3. Override dispose() to clean up custom resources (call super.dispose() last)
 */
export abstract class Entity implements IEntity {
  readonly id: EntityId
  abstract readonly type: string

  readonly position: THREE.Vector3
  readonly velocity: THREE.Vector3 | null

  private _state: EntityState = EntityState.INACTIVE
  private _isAlive = true

  private mesh: THREE.Object3D | null = null
  private meshCreated = false

  private physicsBody: IPhysicsBody | null = null

  /**
   * Materials registered for world lighting, each with its light-level
   * uniform (see ObjectWorldLight.ts).
   */
  private readonly litMaterials: Map<THREE.MeshLambertMaterial, ObjectLightUniform> = new Map()

  /**
   * Packed world light currently applied to the materials (-1 = none yet).
   * Used to skip redundant uniform updates; daylight and the light floor are
   * global shader uniforms and need no refresh here.
   */
  private currentWorldLight = -1

  constructor(type: string, config: IEntityConfig) {
    this.id = generateEntityId(type)
    this.position = config.position.clone()
    this.velocity = config.velocity?.clone() ?? new THREE.Vector3()

    if (config.hasPhysics && config.hitboxSize) {
      this.physicsBody = new PhysicsBody(this.position, config.hitboxSize)
    }
  }

  get state(): EntityState {
    return this._state
  }

  set state(value: EntityState) {
    this._state = value
  }

  get isAlive(): boolean {
    return this._isAlive
  }

  /**
   * Mark this entity as dead (will be removed on next update).
   */
  protected kill(): void {
    this._isAlive = false
  }

  getMesh(): THREE.Object3D | null {
    if (!this.meshCreated) {
      this.mesh = this.createMesh()
      this.meshCreated = true

      if (this.mesh) {
        this.mesh.position.copy(this.position)
      }
    }
    return this.mesh
  }

  /**
   * Create the visual mesh for this entity.
   * Override in subclasses to provide custom geometry.
   * @returns THREE.Object3D or null for invisible entities
   */
  protected abstract createMesh(): THREE.Object3D | null

  getPhysicsBody(): IPhysicsBody | null {
    return this.physicsBody
  }

  /**
   * Update the entity for this frame.
   * Base implementation syncs mesh position with physics body.
   * Override in subclasses for custom behavior.
   */
  update(_deltaTime: number): void {
    if (this.physicsBody) {
      this.position.copy(this.physicsBody.position)
    }

    if (this.mesh) {
      this.mesh.position.copy(this.position)
    }
  }

  onSpawn(): void {
    // Override in subclasses for spawn behavior
  }

  onDespawn(): boolean {
    return true
  }

  /**
   * Clean up all resources.
   * Subclasses should override and call super.dispose() at the end.
   */
  dispose(): void {
    if (this.mesh) {
      this.disposeMeshRecursive(this.mesh)
      this.mesh = null
    }
    this.meshCreated = false
  }

  /**
   * Recursively dispose mesh geometries and materials.
   */
  private disposeMeshRecursive(object: THREE.Object3D): void {
    if (object instanceof THREE.Mesh) {
      object.geometry?.dispose()
      if (Array.isArray(object.material)) {
        object.material.forEach((m) => m.dispose())
      } else if (object.material) {
        object.material.dispose()
      }
    }
    object.children.forEach((child) => this.disposeMeshRecursive(child))
  }

  /**
   * Register a material for world lighting.
   * Call this from createMesh() for each material that should respond to world
   * light levels. The material (owned by this entity - never a shared one) is
   * patched to shade like terrain: the scene lights scaled by the sky light at
   * the entity, plus warm block light and the light floor (ObjectWorldLight).
   * Materials that should glow in the dark (eyes) are simply not registered.
   *
   * @param material The MeshLambertMaterial to register
   */
  protected registerMaterialForLighting(material: THREE.MeshLambertMaterial): void {
    if (!this.litMaterials.has(material)) {
      this.litMaterials.set(material, applyObjectWorldLight(material))
      // Apply the current light to the new material on the next update
      this.currentWorldLight = -1
    }
  }

  /**
   * Update the entity's lighting from the world light at its position, shaded
   * like the terrain (dim in caves, warm under torches).
   *
   * @param packedLight Sky and block light packed as `sky << 4 | block`
   */
  updateWorldLight(packedLight: number): void {
    if (packedLight === this.currentWorldLight) {
      return
    }
    this.currentWorldLight = packedLight
    for (const uniform of this.litMaterials.values()) {
      setObjectLight(uniform, packedLight)
    }
  }
}
