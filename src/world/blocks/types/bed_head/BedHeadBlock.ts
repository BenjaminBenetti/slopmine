import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { IBlockProperties, IWorld, BlockFace, IBlockMeshPart } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { BedBlockItem } from '../../../../items/blocks/bed/BedBlockItem.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { BlockFacing, getMetadataFacing } from '../../BlockFacing.ts'

// Import textures
import bedHeadTopTexUrl from './assets/bed-head-top.webp'
import bedWoodTexUrl from './assets/bed-wood.webp'

// Register textures for atlas
registerTextureUrl(TextureId.BED_HEAD_TOP, bedHeadTopTexUrl)
registerTextureUrl(TextureId.BED_HEAD_FRONT, bedWoodTexUrl)
registerTextureUrl(TextureId.BED_SIDE, bedWoodTexUrl)
registerTextureUrl(TextureId.BED_BOTTOM, bedWoodTexUrl)

// Load textures
const bedHeadTopTexture = loadBlockTexture(bedHeadTopTexUrl)
const bedWoodTexture = loadBlockTexture(bedWoodTexUrl)

// Create materials
const bedTopMaterial = new THREE.MeshLambertMaterial({ map: bedHeadTopTexture })
const bedWoodMaterial = new THREE.MeshLambertMaterial({ map: bedWoodTexture })

// Bed dimensions
const LEG_SIZE = 3/16             // Leg post thickness
const LEG_HEIGHT = 5/16           // Space under bed
const MATTRESS_HEIGHT = 6/16      // Mattress thickness
const HEADBOARD_HEIGHT = 8/16     // Headboard rises above mattress
const BOARD_THICKNESS = 2/16

const MATTRESS_Y = LEG_HEIGHT
const BED_TOP = MATTRESS_Y + MATTRESS_HEIGHT

// Vertical offset - geometry needs to be centered around Y=0 since renderer adds +0.5
const Y_OFFSET = -0.5

// Create TWO separate geometries for proper multi-material rendering
// Wood geometry: legs + headboard
const bedHeadWoodGeometry = (() => {
  const geometries: THREE.BufferGeometry[] = []

  // Back-left leg (at +Z side)
  const backLeftLeg = new THREE.BoxGeometry(LEG_SIZE, LEG_HEIGHT, LEG_SIZE)
  backLeftLeg.translate(-0.5 + LEG_SIZE/2, LEG_HEIGHT/2 + Y_OFFSET, 0.5 - LEG_SIZE/2)
  geometries.push(backLeftLeg)

  // Back-right leg (at +Z side)
  const backRightLeg = new THREE.BoxGeometry(LEG_SIZE, LEG_HEIGHT, LEG_SIZE)
  backRightLeg.translate(0.5 - LEG_SIZE/2, LEG_HEIGHT/2 + Y_OFFSET, 0.5 - LEG_SIZE/2)
  geometries.push(backRightLeg)

  // Headboard (tall panel at +Z side)
  const headboard = new THREE.BoxGeometry(1, HEADBOARD_HEIGHT, BOARD_THICKNESS)
  headboard.translate(0, BED_TOP + HEADBOARD_HEIGHT/2 + Y_OFFSET, 0.5 - BOARD_THICKNESS/2)
  geometries.push(headboard)

  return mergeGeometries(geometries, false)
})()

// Mattress geometry: just the mattress
const bedHeadMattressGeometry = (() => {
  const mattress = new THREE.BoxGeometry(1, MATTRESS_HEIGHT, 1)
  mattress.translate(0, MATTRESS_Y + MATTRESS_HEIGHT/2 + Y_OFFSET, 0)
  return mattress
})()

// Combined geometry for collision/interaction (not used for rendering)
const bedHeadGeometry = (() => {
  return mergeGeometries([bedHeadWoodGeometry.clone(), bedHeadMattressGeometry.clone()], false)
})()

/**
 * Get the offset to the foot block based on facing direction.
 */
function getFootOffset(facing: BlockFacing): { dx: bigint; dz: bigint } {
  switch (facing) {
    case BlockFacing.NORTH:
      return { dx: 0n, dz: 1n }
    case BlockFacing.SOUTH:
      return { dx: 0n, dz: -1n }
    case BlockFacing.EAST:
      return { dx: -1n, dz: 0n }
    case BlockFacing.WEST:
      return { dx: 1n, dz: 0n }
  }
}

/**
 * Bed head block - the pillow end of the bed with headboard.
 */
export class BedHeadBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.BED_HEAD,
    name: 'bed_head',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 0.5,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  readonly isInteractable = true

  protected get defaultTextureId(): number {
    return TextureId.BED_HEAD_TOP
  }

  protected getGeometry(): THREE.BufferGeometry {
    return bedHeadGeometry
  }

  protected getMaterials(): THREE.Material {
    return bedTopMaterial
  }

  /**
   * Returns separate geometry/material pairs for multi-mesh rendering.
   * Used by the renderer to create proper multi-material beds.
   */
  getMultiMeshParts(): IBlockMeshPart[] {
    return [
      { geometry: bedHeadWoodGeometry, material: bedWoodMaterial },
      { geometry: bedHeadMattressGeometry, material: bedTopMaterial },
    ]
  }

  getTextureForFace(face: BlockFace): number {
    switch (face) {
      case 0:
        return TextureId.BED_HEAD_TOP
      case 1:
        return TextureId.BED_BOTTOM
      default:
        return TextureId.BED_SIDE
    }
  }

  getDrops(): IItem[] {
    return [new BedBlockItem()]
  }

  getInteractionBox(_metadata: number): THREE.Box3 | null {
    return new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, BED_TOP + HEADBOARD_HEIGHT, 1)
    )
  }

  getCollisionBox(): THREE.Box3 | null {
    return new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, BED_TOP, 1)
    )
  }

  isGreedyMeshable(): boolean {
    return false
  }

  canPlace(world: IWorld, x: bigint, y: bigint, z: bigint, facing?: BlockFacing): boolean {
    const actualFacing = facing ?? BlockFacing.SOUTH
    const offset = getFootOffset(actualFacing)
    const footX = x + offset.dx
    const footZ = z + offset.dz

    const footBlock = world.getBlock(footX, y, footZ)
    if (footBlock.properties.id !== BlockIds.AIR) {
      console.log('Cannot place bed - foot position is blocked')
      return false
    }
    return true
  }

  onPlace(world: IWorld, x: bigint, y: bigint, z: bigint, facing?: BlockFacing): void {
    const actualFacing = facing ?? BlockFacing.SOUTH
    const offset = getFootOffset(actualFacing)
    const footX = x + offset.dx
    const footZ = z + offset.dz

    const metadata = world.getMetadata?.(x, y, z) ?? 0
    world.setBlock(footX, y, footZ, BlockIds.BED_FOOT, metadata)
  }

  onBreak(world: IWorld, x: bigint, y: bigint, z: bigint): void {
    const metadata = world.getMetadata?.(x, y, z) ?? 0
    const facing = getMetadataFacing(metadata)
    const offset = getFootOffset(facing)
    const footX = x + offset.dx
    const footZ = z + offset.dz

    const footBlock = world.getBlock(footX, y, footZ)
    if (footBlock.properties.id === BlockIds.BED_FOOT) {
      world.setBlock(footX, y, footZ, BlockIds.AIR)
    }
  }
}
