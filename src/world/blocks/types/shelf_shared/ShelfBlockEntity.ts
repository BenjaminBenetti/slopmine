import * as THREE from 'three'
import { BlockEntity } from '../../../../entities/BlockEntity.ts'
import type { IWorld, IBlock } from '../../../interfaces/IBlock.ts'
import type { IWorldCoordinate } from '../../../interfaces/ICoordinates.ts'
import type { IItemStack } from '../../../../player/PlayerState.ts'
import { BlockStateManager } from '../../../blockstate/BlockStateManager.ts'
import { getMetadataFacing, facingToRotationY } from '../../BlockFacing.ts'
import { buildExtrudedToolMesh } from '../../../../renderer/helditem/meshes/ToolMesh.ts'
import { getBlockForItem } from '../../../../renderer/itemdisplay/index.ts'
import { ShelfBlockState, SHELF_SLOT_COUNT } from './ShelfBlockState.ts'
import { SHELF_BOARD_TOP_Y } from './ShelfGeometry.ts'

/** Local X offset of each display slot on the board */
const SLOT_X_OFFSETS: readonly number[] = [-0.3, 0, 0.3]

/** Local Z position of display items (board spans z -0.5..0.38, center -0.06) */
const ITEM_Z = -0.06

/** Small gap between the board top and the item bottom */
const REST_EPSILON = 0.01

/** Scale for block-item display cubes */
const BLOCK_DISPLAY_SCALE = 0.28

/** Scale for flat (extruded icon) item displays */
const FLAT_DISPLAY_SCALE = 0.35

/**
 * Block entity that renders a shelf's slot contents as small in-world meshes.
 *
 * The entity polls its ShelfBlockState's `revision` counter each frame and
 * rebuilds the display meshes whenever the contents change:
 * - Block items ("*_block" ids with a registered block) render as scaled-down
 *   clones of the block's instance geometry/materials. Geometry and materials
 *   are CLONED (never the block singletons) and disposed on rebuild.
 * - Flat items (tools, materials) render as extruded-pixel meshes built from
 *   their icon via buildExtrudedToolMesh. That builder returns meshes backed
 *   by SHARED cached geometry and a SHARED tool material (which the held-item
 *   renderer mutates and disposes), so this entity immediately replaces both
 *   with OWNED clones - a `geometry.clone()` and a fresh cloned material with
 *   emissive reset - tracked in the owned-resource lists and disposed on
 *   rebuild/dispose, same as block-item clones.
 *
 * The whole display group is rotated to match the shelf's facing metadata.
 */
export class ShelfBlockEntity extends BlockEntity {
  readonly type = 'shelf'

  private readonly world: IWorld

  /** Root group returned from createMesh(); children are the display meshes */
  private displayGroup: THREE.Group | null = null

  /** Last seen state revision (-1 = never synced / cleared) */
  private lastRevision = -1

  /** Incremented on every rebuild/clear to invalidate stale async mesh builds */
  private rebuildToken = 0

  /** Cloned geometries owned by the current display build (disposed on rebuild) */
  private readonly ownedGeometries: THREE.BufferGeometry[] = []

  /** Cloned materials owned by the current display build (disposed on rebuild) */
  private readonly ownedMaterials: THREE.Material[] = []

  constructor(position: IWorldCoordinate, world: IWorld) {
    super('shelf', position)
    this.world = world
  }

  /**
   * The shelf board itself is rendered by the chunk mesh; this entity only
   * contributes a group holding the small display meshes for slot contents.
   */
  protected override createMesh(): THREE.Object3D | null {
    this.displayGroup = new THREE.Group()
    return this.displayGroup
  }

  update(deltaTime: number): void {
    super.update(deltaTime)

    if (!this.displayGroup) return

    const state = BlockStateManager.getInstance().getState<ShelfBlockState>(this.blockPosition)

    if (!state) {
      // State gone (e.g. block broken this frame) - clear any stale display
      if (this.lastRevision !== -1) {
        this.rebuildToken++
        this.clearDisplayMeshes()
        this.lastRevision = -1
      }
      return
    }

    if (state.revision !== this.lastRevision) {
      this.lastRevision = state.revision
      this.rebuild(state)
    }
  }

  override dispose(): void {
    // Detach display meshes before the base class recursively disposes the
    // mesh tree, then dispose the owned geometry/material clones explicitly.
    // All display meshes (block and flat) use owned clones by the time they
    // are attached, so nothing shared is ever disposed.
    this.rebuildToken++
    this.clearDisplayMeshes()
    super.dispose()
  }

  /**
   * Rebuild all display meshes from the current state contents.
   */
  private rebuild(state: ShelfBlockState): void {
    const token = ++this.rebuildToken
    this.clearDisplayMeshes()

    const group = this.displayGroup
    if (!group) return

    // Rotate the whole group to match the shelf's facing
    const metadata =
      this.world.getMetadata?.(
        this.blockPosition.x,
        this.blockPosition.y,
        this.blockPosition.z
      ) ?? 0
    group.rotation.y = facingToRotationY(getMetadataFacing(metadata))

    for (let i = 0; i < SHELF_SLOT_COUNT; i++) {
      const stack = state.getStack(i)
      if (!stack) continue
      this.addSlotDisplay(stack, i, token)
    }
  }

  /**
   * Build and attach the display mesh for a single slot.
   */
  private addSlotDisplay(stack: IItemStack, slotIndex: number, token: number): void {
    // Central item->block resolution (src/renderer/itemdisplay) so shelves
    // agree with the held-item and dropped-item views on what is block-shaped
    const block = getBlockForItem(stack.item)

    if (block) {
      this.addBlockDisplay(block, slotIndex)
      return
    }

    // Flat items: extrude the icon into a small standing mesh
    const iconUrl = stack.item.iconUrl
    if (iconUrl) {
      this.addFlatDisplay(iconUrl, slotIndex, token)
      return
    }

    this.addFallbackDisplay(slotIndex)
  }

  /**
   * Display a block item as a small clone of the block's instance mesh.
   * Geometry and materials are cloned so the block singletons stay untouched.
   */
  private addBlockDisplay(block: IBlock, slotIndex: number): void {
    const group = this.displayGroup
    if (!group) return

    const geometry = block.getInstanceGeometry().clone()
    this.ownedGeometries.push(geometry)

    const sourceMaterial = block.getInstanceMaterial()
    let material: THREE.Material | THREE.Material[]
    if (Array.isArray(sourceMaterial)) {
      material = sourceMaterial.map((m) => m.clone())
      this.ownedMaterials.push(...material)
    } else {
      material = sourceMaterial.clone()
      this.ownedMaterials.push(material)
    }

    const mesh = new THREE.Mesh(geometry, material)
    mesh.scale.setScalar(BLOCK_DISPLAY_SCALE)

    geometry.computeBoundingBox()
    const minY = geometry.boundingBox ? geometry.boundingBox.min.y : -0.5

    mesh.position.set(
      SLOT_X_OFFSETS[slotIndex],
      SHELF_BOARD_TOP_Y + REST_EPSILON - minY * BLOCK_DISPLAY_SCALE,
      ITEM_Z
    )
    group.add(mesh)
  }

  /**
   * Display a flat item (tool, material) as an extruded-pixel icon mesh.
   *
   * buildExtrudedToolMesh returns a mesh backed by SHARED cached geometry and
   * the SHARED tool material; the held-item renderer mutates that material's
   * emissive (cave glow) and disposes shared resources on hotbar switch. To
   * stay isolated, this entity swaps in OWNED clones of both and tracks them
   * for disposal on rebuild/dispose.
   */
  private addFlatDisplay(iconUrl: string, slotIndex: number, token: number): void {
    buildExtrudedToolMesh(iconUrl)
      .then((mesh) => {
        // Contents changed (or entity disposed) while loading - drop silently.
        // Nothing to dispose: no clones were taken yet, and the mesh still
        // references only shared cache resources.
        if (token !== this.rebuildToken || !this.displayGroup) return

        // Take ownership: replace shared geometry/material with clones this
        // entity disposes itself (and clear the shared-resource flag so
        // flag-aware disposal helpers treat the clones as owned).
        mesh.userData.sharedDisplayResources = false
        const geometry = mesh.geometry.clone()
        this.ownedGeometries.push(geometry)
        mesh.geometry = geometry

        const sourceMaterial = mesh.material
        let material: THREE.Material | THREE.Material[]
        if (Array.isArray(sourceMaterial)) {
          material = sourceMaterial.map((m) => this.cloneNonEmissive(m))
          this.ownedMaterials.push(...material)
        } else {
          material = this.cloneNonEmissive(sourceMaterial)
          this.ownedMaterials.push(material)
        }
        mesh.material = material

        mesh.scale.setScalar(FLAT_DISPLAY_SCALE)
        // Stand upright with a slight fixed yaw per slot
        mesh.rotation.y = -0.3 + 0.3 * slotIndex

        if (!mesh.geometry.boundingBox) {
          mesh.geometry.computeBoundingBox()
        }
        const minY = mesh.geometry.boundingBox ? mesh.geometry.boundingBox.min.y : 0

        mesh.position.set(
          SLOT_X_OFFSETS[slotIndex],
          SHELF_BOARD_TOP_Y + REST_EPSILON - minY * FLAT_DISPLAY_SCALE,
          ITEM_Z
        )
        this.displayGroup.add(mesh)
      })
      .catch(() => {
        if (token !== this.rebuildToken || !this.displayGroup) return
        this.addFallbackDisplay(slotIndex)
      })
  }

  /**
   * Clone a material for exclusive ownership, resetting any emissive glow the
   * held-item renderer may have applied to the shared source (emissive back
   * to black, intensity 0).
   */
  private cloneNonEmissive(source: THREE.Material): THREE.Material {
    const material = source.clone()
    if ('emissive' in material) {
      ;(material as THREE.MeshStandardMaterial).emissive.setHex(0x000000)
      ;(material as THREE.MeshStandardMaterial).emissiveIntensity = 0
    }
    return material
  }

  /**
   * Gray placeholder cube for items with no icon (owned resources).
   */
  private addFallbackDisplay(slotIndex: number): void {
    const group = this.displayGroup
    if (!group) return

    const geometry = new THREE.BoxGeometry(0.16, 0.16, 0.16)
    const material = new THREE.MeshLambertMaterial({ color: 0x888888 })
    this.ownedGeometries.push(geometry)
    this.ownedMaterials.push(material)

    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(
      SLOT_X_OFFSETS[slotIndex],
      SHELF_BOARD_TOP_Y + REST_EPSILON + 0.08,
      ITEM_Z
    )
    group.add(mesh)
  }

  /**
   * Remove all display meshes and dispose the geometry/material clones owned
   * by this entity (block displays, flat extruded-icon displays, fallbacks).
   * Shared cache resources are never in the owned lists.
   */
  private clearDisplayMeshes(): void {
    const group = this.displayGroup
    if (group) {
      while (group.children.length > 0) {
        group.remove(group.children[group.children.length - 1])
      }
    }

    for (const geometry of this.ownedGeometries) {
      geometry.dispose()
    }
    this.ownedGeometries.length = 0

    for (const material of this.ownedMaterials) {
      material.dispose()
    }
    this.ownedMaterials.length = 0
  }
}
