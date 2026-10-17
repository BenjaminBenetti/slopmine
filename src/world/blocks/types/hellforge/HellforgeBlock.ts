import * as THREE from 'three'
import type { IBlockProperties, IWorld, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IBlockState } from '../../../blockstate/interfaces/IBlockState.ts'
import type { IWorldCoordinate } from '../../../interfaces/ICoordinates.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { HellforgeBlockItem } from '../../../../items/blocks/hellforge/HellforgeBlockItem.ts'
import { HellforgeState } from './HellforgeState.ts'
import { BlockStateManager } from '../../../blockstate/BlockStateManager.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'

import hellforgeFrontTexUrl from './assets/hellforge-front.webp'
import hellforgeSideTexUrl from './assets/hellforge-side.webp'
import hellforgeTopTexUrl from './assets/hellforge-top.webp'
import hellforgeFrontGlowUrl from './assets/hellforge-front-glow.webp'
import hellforgeSideGlowUrl from './assets/hellforge-side-glow.webp'
import hellforgeTopGlowUrl from './assets/hellforge-top-glow.webp'

// Register textures (LOD palette / face lookups; the block itself is instanced,
// so these cost no texture-array layers)
registerTextureUrl(TextureId.HELLFORGE_FRONT, hellforgeFrontTexUrl)
registerTextureUrl(TextureId.HELLFORGE_SIDE, hellforgeSideTexUrl)
registerTextureUrl(TextureId.HELLFORGE_TOP, hellforgeTopTexUrl)

/**
 * Face material with its molten texels self-lit: the glow map holds only the
 * hot texels (fire mouth, crucible, seams), added as emissive light so the
 * forge burns in the dark like the lava around it. Emissive is outside the
 * instanced world-light patch, so it stays bright at any light level.
 */
function glowingFaceMaterial(mapUrl: string, glowUrl: string): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    map: loadBlockTexture(mapUrl),
    emissive: 0xffffff,
    emissiveMap: loadBlockTexture(glowUrl),
    emissiveIntensity: 0.9,
  })
}

const hellforgeFrontMaterial = glowingFaceMaterial(hellforgeFrontTexUrl, hellforgeFrontGlowUrl)
const hellforgeSideMaterial = glowingFaceMaterial(hellforgeSideTexUrl, hellforgeSideGlowUrl)
const hellforgeTopMaterial = glowingFaceMaterial(hellforgeTopTexUrl, hellforgeTopGlowUrl)

/**
 * The Hellforge: an obsidian-and-infernium crafting station that forges
 * infernium and hellbane gear (recipes in hellforgeRegistry).
 *
 * Interactable: press E to open the Hellforge UI, which crafts from the
 * player's inventory. Directional like the forge (fire mouth faces the
 * player who placed it) and glowing (light level 10).
 */
export class HellforgeBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.HELLFORGE,
    name: 'hellforge',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 6,
    lightLevel: 10,
    lightBlocking: 15,
    demolitionForceRequired: 3,
    tags: [BlockTags.ROCK],
  }

  /** Mark this block as interactable */
  readonly isInteractable = true

  protected get defaultTextureId(): number {
    return TextureId.HELLFORGE_FRONT
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [
      hellforgeSideMaterial,  // +X (right) - side
      hellforgeSideMaterial,  // -X (left) - side
      hellforgeTopMaterial,   // +Y (top) - crucible grate
      hellforgeSideMaterial,  // -Y (bottom)
      hellforgeFrontMaterial, // +Z (front) - fire mouth
      hellforgeSideMaterial,  // -Z (back) - side
    ]
  }

  /**
   * Texture ID per face (TOP=0, BOTTOM=1, NORTH=2, SOUTH=3, EAST=4, WEST=5).
   */
  getTextureForFace(face: BlockFace): number {
    switch (face) {
      case 0: // TOP
        return TextureId.HELLFORGE_TOP
      case 3: // SOUTH (+Z) - fire mouth
        return TextureId.HELLFORGE_FRONT
      default:
        return TextureId.HELLFORGE_SIDE
    }
  }

  getDrops(): IItem[] {
    return [new HellforgeBlockItem()]
  }

  /**
   * Hellforge blocks use instanced rendering (not greedy meshing) to support rotation.
   */
  isGreedyMeshable(): boolean {
    return false
  }

  /**
   * Create a block state instance for this Hellforge (nothing is persisted).
   */
  createState(position: IWorldCoordinate): IBlockState {
    return new HellforgeState(position)
  }

  onPlace(_world: IWorld, x: bigint, y: bigint, z: bigint): void {
    this.ensureState(x, y, z)
  }

  onLoad(_world: IWorld, x: bigint, y: bigint, z: bigint): void {
    this.ensureState(x, y, z)
  }

  /** The UI opens on a block state - make sure one exists. */
  prepareInteractionState(_world: IWorld, x: bigint, y: bigint, z: bigint): void {
    this.ensureState(x, y, z)
  }

  onBreak(_world: IWorld, x: bigint, y: bigint, z: bigint): void {
    BlockStateManager.getInstance().removeState({ x, y, z })
  }

  private ensureState(x: bigint, y: bigint, z: bigint): void {
    const position = { x, y, z }
    const manager = BlockStateManager.getInstance()
    if (!manager.hasState(position)) {
      manager.setState(position, this.createState(position))
    }
  }
}
