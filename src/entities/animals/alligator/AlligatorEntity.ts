import * as THREE from 'three'
import { PeacefulEntity } from '../../PeacefulEntity.ts'
import type { IPeacefulEntityConfig } from '../../PeacefulEntity.ts'
import type { IItem } from '../../../items/Item.ts'
import { RawAlligatorMeatItem } from '../../../items/food/raw_alligator_meat/RawAlligatorMeatItem.ts'
import { AlligatorLeatherItem } from '../../../items/materials/alligator_leather/AlligatorLeatherItem.ts'

// Import alligator texture
import alligatorTextureUrl from './assets/alligator-texture.webp'

// Alligator colors
const GATOR_GREEN = 0x355e3b // Dark green
const GATOR_BELLY = 0x8b9556 // Lighter yellow-green belly
const GATOR_DARK = 0x1a1a1a // Eyes/details
const GATOR_TEETH = 0xf5f5dc // Beige teeth

// Alligator dimensions (in world units) - long, low profile
const SCALE = 0.0625 // Each "pixel" is 1/16th of a block
const BODY_WIDTH = 12 * SCALE // ~0.75 blocks wide
const BODY_HEIGHT = 6 * SCALE // ~0.375 blocks tall (low profile)
const BODY_DEPTH = 32 * SCALE // 2 blocks long body
const HEAD_WIDTH = 8 * SCALE
const HEAD_HEIGHT = 5 * SCALE
const HEAD_DEPTH = 6 * SCALE
const SNOUT_WIDTH = 6 * SCALE
const SNOUT_HEIGHT = 3 * SCALE
const SNOUT_DEPTH = 12 * SCALE // Long snout
const JAW_WIDTH = 5 * SCALE
const JAW_HEIGHT = 2 * SCALE
const JAW_DEPTH = 10 * SCALE
const LEG_WIDTH = 3 * SCALE
const LEG_HEIGHT = 4 * SCALE // Short, stubby legs
const LEG_DEPTH = 4 * SCALE
const TAIL_WIDTH = 8 * SCALE
const TAIL_HEIGHT = 5 * SCALE
const TAIL_DEPTH = 20 * SCALE // Long tail
const TAIL_TIP_WIDTH = 4 * SCALE
const TAIL_TIP_HEIGHT = 3 * SCALE
const TAIL_TIP_DEPTH = 12 * SCALE
const EYE_SIZE = 2 * SCALE

// Combat constants
const DEFAULT_BASE_DAMAGE = 2

// Aggressive behavior constants
const AGGRESSIVE_DURATION = 10.0 // seconds to chase
const AGGRESSIVE_SPEED = 5.0 // faster than walk
const ATTACK_RANGE = 2.0 // blocks
const ATTACK_COOLDOWN = 1.5 // seconds between attacks
const PUSHBACK_HORIZONTAL = 3.0 // horizontal knockback force
const PUSHBACK_VERTICAL = 5.0 // vertical knockback force

/**
 * An alligator entity that lives in swamps.
 * Unlike other peaceful mobs, alligators become aggressive when hit
 * and will chase and attack the player.
 */
export class AlligatorEntity extends PeacefulEntity {
  readonly type = 'alligator'

  // Animation state
  private legAnimPhase = 0
  private tailSwayPhase = 0
  private bitePhase = 0
  private isBiting = false

  // Mesh references for animation
  private legs: THREE.Mesh[] = []
  private head: THREE.Object3D | null = null
  private tail: THREE.Object3D | null = null
  private jaw: THREE.Object3D | null = null

  // Aggressive behavior state
  private aggressiveTimer = 0
  private aggressiveTarget: THREE.Vector3 | null = null
  private attackCooldown = 0
  private playerCallback: ((damage: number, knockback: THREE.Vector3) => void) | null = null

  // Reference to live player position (updated each frame by EntityManager)
  private playerPositionRef: THREE.Vector3 | null = null

  // Shared texture (loaded once)
  private static texture: THREE.Texture | null = null
  private static textureLoading = false
  private textureApplied = false

  constructor(config: IPeacefulEntityConfig) {
    super('alligator', {
      ...config,
      hasPhysics: true,
      hitboxSize: new THREE.Vector3(1.0, 0.6, 2.5), // Long, low hitbox
      walkSpeed: 1.5, // Slow when wandering
      fleeSpeed: 0, // No fleeing - replaced with aggression
      fleeDuration: 0,
      maxHealth: 20, // Tougher than most animals
      drops: [
        { createItem: () => new RawAlligatorMeatItem(), minCount: 2, maxCount: 4 },
        { createItem: () => new AlligatorLeatherItem(), minCount: 1, maxCount: 2 },
      ],
    })
  }

  /**
   * Set a callback for when the alligator attacks the player.
   * This allows the game to apply damage to the player when health system is implemented.
   */
  setPlayerAttackCallback(callback: (damage: number, knockback: THREE.Vector3) => void): void {
    this.playerCallback = callback
  }

  /**
   * Set the player position reference for continuous tracking while aggressive.
   * The alligator will follow this position reference while in aggressive mode.
   */
  setPlayerPositionRef(positionRef: THREE.Vector3): void {
    this.playerPositionRef = positionRef
  }

  protected createMesh(): THREE.Object3D {
    const group = new THREE.Group()

    // Load texture if not already loaded
    if (!AlligatorEntity.texture && !AlligatorEntity.textureLoading) {
      AlligatorEntity.textureLoading = true
      const loader = new THREE.TextureLoader()
      loader.load(alligatorTextureUrl, (texture) => {
        texture.magFilter = THREE.NearestFilter
        texture.minFilter = THREE.NearestFilter
        // Enable tiling for scaly texture
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        texture.repeat.set(4, 4) // Tile the scales across body
        AlligatorEntity.texture = texture
      })
    }

    // Create materials
    const bodyMaterial = this.createMaterial(GATOR_GREEN)
    const bellyMaterial = new THREE.MeshLambertMaterial({ color: GATOR_BELLY })
    const darkMaterial = new THREE.MeshLambertMaterial({ color: GATOR_DARK })
    const teethMaterial = new THREE.MeshLambertMaterial({ color: GATOR_TEETH })

    // Body (long, low rectangle)
    const bodyGeometry = new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH)
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
    body.position.y = LEG_HEIGHT + BODY_HEIGHT / 2
    body.castShadow = true
    body.receiveShadow = true
    group.add(body)

    // Belly (lighter underside)
    const bellyGeometry = new THREE.BoxGeometry(BODY_WIDTH * 0.8, BODY_HEIGHT * 0.3, BODY_DEPTH * 0.9)
    const belly = new THREE.Mesh(bellyGeometry, bellyMaterial)
    belly.position.y = LEG_HEIGHT + BODY_HEIGHT * 0.2
    group.add(belly)

    // Scaly ridges on back (small bumps)
    const ridgeGeometry = new THREE.BoxGeometry(BODY_WIDTH * 0.3, BODY_HEIGHT * 0.2, BODY_DEPTH * 0.08)
    for (let i = 0; i < 8; i++) {
      const ridge = new THREE.Mesh(ridgeGeometry, bodyMaterial)
      ridge.position.set(0, LEG_HEIGHT + BODY_HEIGHT + BODY_HEIGHT * 0.05, BODY_DEPTH * 0.4 - i * BODY_DEPTH * 0.1)
      ridge.castShadow = true
      group.add(ridge)
    }

    // Head group
    const headGroup = new THREE.Group()

    // Head base
    const headGeometry = new THREE.BoxGeometry(HEAD_WIDTH, HEAD_HEIGHT, HEAD_DEPTH)
    const headMesh = new THREE.Mesh(headGeometry, bodyMaterial)
    headMesh.castShadow = true
    headMesh.receiveShadow = true
    headGroup.add(headMesh)

    // Upper snout (long, flat)
    const snoutGeometry = new THREE.BoxGeometry(SNOUT_WIDTH, SNOUT_HEIGHT, SNOUT_DEPTH)
    const snout = new THREE.Mesh(snoutGeometry, bodyMaterial)
    snout.position.z = HEAD_DEPTH / 2 + SNOUT_DEPTH / 2
    snout.position.y = -HEAD_HEIGHT / 6
    snout.castShadow = true
    headGroup.add(snout)

    // Nostrils (at tip of snout)
    const nostrilGeometry = new THREE.BoxGeometry(1 * SCALE, 1 * SCALE, 0.5 * SCALE)
    const leftNostril = new THREE.Mesh(nostrilGeometry, darkMaterial)
    leftNostril.position.set(-SNOUT_WIDTH / 4, SNOUT_HEIGHT / 3, SNOUT_DEPTH / 2)
    snout.add(leftNostril)

    const rightNostril = new THREE.Mesh(nostrilGeometry, darkMaterial)
    rightNostril.position.set(SNOUT_WIDTH / 4, SNOUT_HEIGHT / 3, SNOUT_DEPTH / 2)
    snout.add(rightNostril)

    // Teeth on upper jaw
    const toothGeometry = new THREE.BoxGeometry(0.5 * SCALE, 1 * SCALE, 0.5 * SCALE)
    for (let i = 0; i < 6; i++) {
      const toothLeft = new THREE.Mesh(toothGeometry, teethMaterial)
      toothLeft.position.set(-SNOUT_WIDTH / 2 + 0.3 * SCALE, -SNOUT_HEIGHT / 2 - 0.3 * SCALE, SNOUT_DEPTH * 0.3 - i * SNOUT_DEPTH * 0.1)
      snout.add(toothLeft)

      const toothRight = new THREE.Mesh(toothGeometry, teethMaterial)
      toothRight.position.set(SNOUT_WIDTH / 2 - 0.3 * SCALE, -SNOUT_HEIGHT / 2 - 0.3 * SCALE, SNOUT_DEPTH * 0.3 - i * SNOUT_DEPTH * 0.1)
      snout.add(toothRight)
    }

    // Lower jaw (for bite animation)
    const jawGroup = new THREE.Group()
    const jawGeometry = new THREE.BoxGeometry(JAW_WIDTH, JAW_HEIGHT, JAW_DEPTH)
    const jawMesh = new THREE.Mesh(jawGeometry, bodyMaterial)
    jawMesh.castShadow = true
    jawGroup.add(jawMesh)

    // Teeth on lower jaw
    for (let i = 0; i < 5; i++) {
      const toothLeft = new THREE.Mesh(toothGeometry, teethMaterial)
      toothLeft.position.set(-JAW_WIDTH / 2 + 0.3 * SCALE, JAW_HEIGHT / 2 + 0.3 * SCALE, JAW_DEPTH * 0.3 - i * JAW_DEPTH * 0.12)
      jawMesh.add(toothLeft)

      const toothRight = new THREE.Mesh(toothGeometry, teethMaterial)
      toothRight.position.set(JAW_WIDTH / 2 - 0.3 * SCALE, JAW_HEIGHT / 2 + 0.3 * SCALE, JAW_DEPTH * 0.3 - i * JAW_DEPTH * 0.12)
      jawMesh.add(toothRight)
    }

    // Position jaw below snout, pivot at back
    jawGroup.position.z = HEAD_DEPTH / 2 + JAW_DEPTH / 2
    jawGroup.position.y = -HEAD_HEIGHT / 3 - JAW_HEIGHT / 2
    headGroup.add(jawGroup)
    this.jaw = jawGroup

    // Eyes (on top/sides of head - reptilian style, bulging out)
    const eyeGeometry = new THREE.BoxGeometry(EYE_SIZE * 0.8, EYE_SIZE * 0.6, EYE_SIZE * 0.8)
    const eyeBaseGeometry = new THREE.BoxGeometry(EYE_SIZE * 1.2, EYE_SIZE * 0.4, EYE_SIZE * 1.2)

    // Left eye bump
    const leftEyeBase = new THREE.Mesh(eyeBaseGeometry, bodyMaterial)
    leftEyeBase.position.set(-HEAD_WIDTH / 3, HEAD_HEIGHT / 2, HEAD_DEPTH / 4)
    headGroup.add(leftEyeBase)

    const leftEye = new THREE.Mesh(eyeGeometry, darkMaterial)
    leftEye.position.set(-HEAD_WIDTH / 3, HEAD_HEIGHT / 2 + EYE_SIZE * 0.3, HEAD_DEPTH / 4)
    headGroup.add(leftEye)

    // Right eye bump
    const rightEyeBase = new THREE.Mesh(eyeBaseGeometry, bodyMaterial)
    rightEyeBase.position.set(HEAD_WIDTH / 3, HEAD_HEIGHT / 2, HEAD_DEPTH / 4)
    headGroup.add(rightEyeBase)

    const rightEye = new THREE.Mesh(eyeGeometry, darkMaterial)
    rightEye.position.set(HEAD_WIDTH / 3, HEAD_HEIGHT / 2 + EYE_SIZE * 0.3, HEAD_DEPTH / 4)
    headGroup.add(rightEye)

    // Eye slits (vertical pupils)
    const pupilGeometry = new THREE.BoxGeometry(EYE_SIZE * 0.15, EYE_SIZE * 0.5, EYE_SIZE * 0.3)
    const pupilMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 })

    const leftPupil = new THREE.Mesh(pupilGeometry, pupilMaterial)
    leftPupil.position.set(-HEAD_WIDTH / 3, HEAD_HEIGHT / 2 + EYE_SIZE * 0.35, HEAD_DEPTH / 4 + EYE_SIZE * 0.3)
    headGroup.add(leftPupil)

    const rightPupil = new THREE.Mesh(pupilGeometry, pupilMaterial)
    rightPupil.position.set(HEAD_WIDTH / 3, HEAD_HEIGHT / 2 + EYE_SIZE * 0.35, HEAD_DEPTH / 4 + EYE_SIZE * 0.3)
    headGroup.add(rightPupil)

    // Position head at front of body
    headGroup.position.y = LEG_HEIGHT + BODY_HEIGHT / 2
    headGroup.position.z = BODY_DEPTH / 2 + HEAD_DEPTH / 3
    group.add(headGroup)
    this.head = headGroup

    // Tail group
    const tailGroup = new THREE.Group()

    // Main tail segment
    const tailGeometry = new THREE.BoxGeometry(TAIL_WIDTH, TAIL_HEIGHT, TAIL_DEPTH)
    const tailMesh = new THREE.Mesh(tailGeometry, bodyMaterial)
    tailMesh.castShadow = true
    tailMesh.receiveShadow = true
    tailGroup.add(tailMesh)

    // Tail tip (smaller, tapered)
    const tailTipGeometry = new THREE.BoxGeometry(TAIL_TIP_WIDTH, TAIL_TIP_HEIGHT, TAIL_TIP_DEPTH)
    const tailTip = new THREE.Mesh(tailTipGeometry, bodyMaterial)
    tailTip.position.z = -TAIL_DEPTH / 2 - TAIL_TIP_DEPTH / 2
    tailTip.castShadow = true
    tailGroup.add(tailTip)

    // Position tail at back of body
    tailGroup.position.y = LEG_HEIGHT + BODY_HEIGHT / 2
    tailGroup.position.z = -BODY_DEPTH / 2 - TAIL_DEPTH / 3
    group.add(tailGroup)
    this.tail = tailGroup

    // Legs (4 short, stubby legs splayed outward)
    const legGeometry = new THREE.BoxGeometry(LEG_WIDTH, LEG_HEIGHT, LEG_DEPTH)
    const legPositions = [
      { x: BODY_WIDTH / 2 + LEG_WIDTH / 4, z: BODY_DEPTH / 3, rotZ: -0.4 }, // Front right (splayed)
      { x: -BODY_WIDTH / 2 - LEG_WIDTH / 4, z: BODY_DEPTH / 3, rotZ: 0.4 }, // Front left (splayed)
      { x: BODY_WIDTH / 2 + LEG_WIDTH / 4, z: -BODY_DEPTH / 3, rotZ: -0.4 }, // Back right
      { x: -BODY_WIDTH / 2 - LEG_WIDTH / 4, z: -BODY_DEPTH / 3, rotZ: 0.4 }, // Back left
    ]

    this.legs = []
    for (const pos of legPositions) {
      const leg = new THREE.Mesh(legGeometry, bodyMaterial)
      leg.position.set(pos.x, LEG_HEIGHT / 2, pos.z)
      leg.rotation.z = pos.rotZ // Splay legs outward
      leg.castShadow = true
      leg.receiveShadow = true
      group.add(leg)
      this.legs.push(leg)
    }

    // Mark texture as applied if it was available during mesh creation
    if (AlligatorEntity.texture) {
      this.textureApplied = true
    }

    return group
  }

  private createMaterial(color: number): THREE.MeshLambertMaterial {
    const material = new THREE.MeshLambertMaterial({ color })
    if (AlligatorEntity.texture) {
      material.map = AlligatorEntity.texture
    }
    return material
  }

  private updateMaterials(group: THREE.Object3D): void {
    if (!AlligatorEntity.texture) return

    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshLambertMaterial) {
        const color = child.material.color.getHex()
        if (color === GATOR_GREEN) {
          child.material.map = AlligatorEntity.texture
          child.material.needsUpdate = true
        }
      }
    })
  }

  /**
   * Override onPlayerInteract to trigger aggressive behavior instead of fleeing.
   */
  onPlayerInteract(playerPosition: THREE.Vector3, isLeftClick: boolean, heldItem: IItem | null): boolean {
    if (!isLeftClick) return false
    if (!this.isAlive) return false

    // Calculate damage from held item
    let damage = DEFAULT_BASE_DAMAGE
    if (heldItem && 'toolStats' in heldItem) {
      const toolItem = heldItem as { toolStats: { damage: number } }
      damage = toolItem.toolStats.damage
    }

    // Apply damage
    this.health -= damage

    // Calculate knockback direction (away from player)
    const knockbackDir = new THREE.Vector3()
      .copy(this.position)
      .sub(playerPosition)
    knockbackDir.y = 0
    if (knockbackDir.lengthSq() > 0) {
      knockbackDir.normalize()
    } else {
      knockbackDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize()
    }

    // Apply knockback to physics body
    const body = this.getPhysicsBody()
    if (body) {
      body.velocity.x = knockbackDir.x * 6.0
      body.velocity.z = knockbackDir.z * 6.0
      body.velocity.y = 5.0
    }

    // Check death
    if (this.health <= 0) {
      this._isDying = true
      this.deathTimer = 0
      this.knockbackTimer = 0
      this.aggressiveTimer = 0
      this.aggressiveTarget = null
    } else {
      // AGGRESSIVE BEHAVIOR instead of flee
      this.knockbackTimer = 0.4 // Short stun
      this.aggressiveTimer = AGGRESSIVE_DURATION
      this.aggressiveTarget = playerPosition.clone()
    }

    return true
  }

  update(deltaTime: number): void {
    // Apply texture if it's loaded but not yet applied
    if (AlligatorEntity.texture && !this.textureApplied) {
      const mesh = this.getMesh()
      if (mesh) {
        this.updateMaterials(mesh)
        this.textureApplied = true
      }
    }

    // Handle death animation (from parent)
    if (this._isDying) {
      this.deathTimer += deltaTime
      const mesh = this.getMesh()
      const body = this.getPhysicsBody()

      if (body) {
        body.velocity.x = 0
        body.velocity.z = 0
      }

      if (mesh) {
        const fallProgress = Math.min(this.deathTimer / 0.5, 1.0)
        const easedProgress = 1 - Math.pow(1 - fallProgress, 2)
        mesh.rotation.z = easedProgress * (Math.PI / 2)
      }

      if (this.deathTimer >= 1.5) {
        this.kill()
      }

      return
    }

    // Handle knockback stun
    if (this.knockbackTimer > 0) {
      this.knockbackTimer -= deltaTime
      this.updateAnimations(deltaTime)
      return
    }

    // Handle AGGRESSIVE state - continuously track player's current position
    if (this.aggressiveTimer > 0) {
      this.aggressiveTimer -= deltaTime
      this.attackCooldown = Math.max(0, this.attackCooldown - deltaTime)

      // Use live player position reference if available, otherwise use last known position
      const targetPosition = this.playerPositionRef || this.aggressiveTarget
      if (!targetPosition) {
        // No target, exit aggressive mode
        this.aggressiveTimer = 0
        super.update(deltaTime)
        return
      }

      // Calculate direction TO player's CURRENT position
      const chaseDirection = new THREE.Vector3()
        .copy(targetPosition)
        .sub(this.position)
      chaseDirection.y = 0
      const distanceToTarget = chaseDirection.length()

      if (distanceToTarget > 0.1) {
        chaseDirection.normalize()
      }

      const body = this.getPhysicsBody()
      if (body) {
        if (distanceToTarget <= ATTACK_RANGE) {
          // Stop moving when in attack range
          body.velocity.x = 0
          body.velocity.z = 0
          this.isWalking = false

          // Attack if cooldown is ready
          if (this.attackCooldown <= 0) {
            this.performAttack()
            this.attackCooldown = ATTACK_COOLDOWN
          }
        } else {
          // Chase player at aggressive speed
          body.velocity.x = chaseDirection.x * AGGRESSIVE_SPEED
          body.velocity.z = chaseDirection.z * AGGRESSIVE_SPEED
          this.isWalking = true
        }
      }

      // Face chase direction
      const mesh = this.getMesh()
      if (mesh && (chaseDirection.x !== 0 || chaseDirection.z !== 0)) {
        mesh.rotation.y = Math.atan2(chaseDirection.x, chaseDirection.z)
      }

      this.updateAnimations(deltaTime)

      // Sync position from physics body (aggressive mode bypasses super.update)
      if (body) {
        this.position.copy(body.position)
      }
      if (mesh) {
        mesh.position.copy(this.position)
      }

      // Reset aggressive state when timer runs out
      if (this.aggressiveTimer <= 0) {
        this.aggressiveTarget = null
      }

      return
    }

    // Normal wandering behavior (call parent)
    super.update(deltaTime)
  }

  private performAttack(): void {
    // Trigger bite animation
    this.isBiting = true
    this.bitePhase = 0

    // Use live player position for accurate knockback direction
    const targetPosition = this.playerPositionRef || this.aggressiveTarget
    if (targetPosition) {
      const knockbackDir = new THREE.Vector3()
        .copy(targetPosition)
        .sub(this.position)
      knockbackDir.y = 0
      if (knockbackDir.lengthSq() > 0) {
        knockbackDir.normalize()
      }
      // Apply horizontal and vertical knockback separately
      knockbackDir.multiplyScalar(PUSHBACK_HORIZONTAL)
      knockbackDir.y = PUSHBACK_VERTICAL

      // Call player damage callback if set
      if (this.playerCallback) {
        this.playerCallback(4, knockbackDir) // 4 damage (2 hearts)
      }
    }
  }

  protected updateAnimations(deltaTime: number): void {
    // Bite animation
    if (this.isBiting) {
      this.bitePhase += deltaTime * 12 // Fast bite
      if (this.jaw) {
        if (this.bitePhase < Math.PI) {
          // Open jaw
          this.jaw.rotation.x = Math.sin(this.bitePhase) * 0.6
        } else {
          // Close jaw
          this.jaw.rotation.x = 0
          this.isBiting = false
        }
      }
    }

    if (this.isWalking) {
      // Leg animation while walking - alligator waddle
      this.legAnimPhase += deltaTime * 6
      const legSwing = Math.sin(this.legAnimPhase) * 0.3

      if (this.legs.length >= 4) {
        // Alligator walk: diagonal pairs move together
        this.legs[0].rotation.x = legSwing // Front right
        this.legs[3].rotation.x = legSwing // Back left
        this.legs[1].rotation.x = -legSwing // Front left
        this.legs[2].rotation.x = -legSwing // Back right
      }

      // Tail sway while moving
      this.tailSwayPhase += deltaTime * 4
      if (this.tail) {
        this.tail.rotation.y = Math.sin(this.tailSwayPhase) * 0.2
      }
    } else {
      // Reset legs when standing
      for (const leg of this.legs) {
        leg.rotation.x *= 0.9
      }

      // Gentle tail sway while idle
      this.tailSwayPhase += deltaTime * 1.5
      if (this.tail) {
        this.tail.rotation.y = Math.sin(this.tailSwayPhase) * 0.1
      }
    }
  }

  dispose(): void {
    this.legs = []
    this.head = null
    this.tail = null
    this.jaw = null
    this.aggressiveTarget = null
    this.playerCallback = null
    super.dispose()
  }
}
