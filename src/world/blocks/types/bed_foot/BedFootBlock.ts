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
import bedFootTopTexUrl from './assets/bed-foot-top.webp'
import bedWoodTexUrl from './assets/bed-wood.webp'

// Register textures for atlas
registerTextureUrl(TextureId.BED_FOOT_TOP, bedFootTopTexUrl)
registerTextureUrl(TextureId.BED_FOOT_END, bedWoodTexUrl)

// Load textures
const bedFootTopTexture = loadBlockTexture(bedFootTopTexUrl)
const bedWoodTexture = loadBlockTexture(bedWoodTexUrl)

// Create materials
const bedTopMaterial = new THREE.MeshLambertMaterial({ map: bedFootTopTexture })
const bedWoodMaterial = new THREE.MeshLambertMaterial({ map: bedWoodTexture })

// Bed dimensions - must match BedHeadBlock
const LEG_SIZE = 3/16             // Leg post thickness
const LEG_HEIGHT = 5/16           // Space under bed
const MATTRESS_HEIGHT = 6/16      // Mattress thickness
const FOOTBOARD_HEIGHT = 5/16     // Footboard (shorter than headboard)
const BOARD_THICKNESS = 2/16

const MATTRESS_Y = LEG_HEIGHT
const BED_TOP = MATTRESS_Y + MATTRESS_HEIGHT

// Vertical offset - geometry needs to be centered around Y=0 since renderer adds +0.5
const Y_OFFSET = -0.5

// Create TWO separate geometries for proper multi-material rendering
// Wood geometry: legs + footboard
const bedFootWoodGeometry = (() => {
  const geometries: THREE.BufferGeometry[] = []

  // Front-left leg (at -Z side)
  const frontLeftLeg = new THREE.BoxGeometry(LEG_SIZE, LEG_HEIGHT, LEG_SIZE)
  frontLeftLeg.translate(-0.5 + LEG_SIZE/2, LEG_HEIGHT/2 + Y_OFFSET, -0.5 + LEG_SIZE/2)
  geometries.push(frontLeftLeg)

  // Front-right leg (at -Z side)
  const frontRightLeg = new THREE.BoxGeometry(LEG_SIZE, LEG_HEIGHT, LEG_SIZE)
  frontRightLeg.translate(0.5 - LEG_SIZE/2, LEG_HEIGHT/2 + Y_OFFSET, -0.5 + LEG_SIZE/2)
  geometries.push(frontRightLeg)

  // Footboard (shorter panel at -Z side)
  const footboard = new THREE.BoxGeometry(1, FOOTBOARD_HEIGHT, BOARD_THICKNESS)
  footboard.translate(0, BED_TOP + FOOTBOARD_HEIGHT/2 + Y_OFFSET, -0.5 + BOARD_THICKNESS/2)
  geometries.push(footboard)

  return mergeGeometries(geometries, false)
})()

// Mattress geometry: just the mattress
const bedFootMattressGeometry = (() => {
  const mattress = new THREE.BoxGeometry(1, MATTRESS_HEIGHT, 1)
  mattress.translate(0, MATTRESS_Y + MATTRESS_HEIGHT/2 + Y_OFFSET, 0)
  return mattress
})()

// Combined geometry for collision/interaction (not used for rendering)
const bedFootGeometry = (() => {
  return mergeGeometries([bedFootWoodGeometry.clone(), bedFootMattressGeometry.clone()], false)
})()

/**
 * Get the offset to the head block based on facing direction.
 */
function getHeadOffset(facing: BlockFacing): { dx: bigint; dz: bigint } {
  switch (facing) {
    case BlockFacing.NORTH:
      return { dx: 0n, dz: -1n }
    case BlockFacing.SOUTH:
      return { dx: 0n, dz: 1n }
    case BlockFacing.EAST:
      return { dx: 1n, dz: 0n }
    case BlockFacing.WEST:
      return { dx: -1n, dz: 0n }
    // UP/DOWN should never occur for beds - default to SOUTH behavior
    default:
      return { dx: 0n, dz: 1n }
  }
}

/**
 * Bed foot block - the blanket end of the bed with small footboard.
 */
export class BedFootBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.BED_FOOT,
    name: 'bed_foot',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 0.5,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.BED_FOOT_TOP
  }

  protected getGeometry(): THREE.BufferGeometry {
    return bedFootGeometry
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
      { geometry: bedFootWoodGeometry, material: bedWoodMaterial },
      { geometry: bedFootMattressGeometry, material: bedTopMaterial },
    ]
  }

  getTextureForFace(face: BlockFace): number {
    switch (face) {
      case 0:
        return TextureId.BED_FOOT_TOP
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
      new THREE.Vector3(1, BED_TOP + FOOTBOARD_HEIGHT, 1)
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

  onBreak(world: IWorld, x: bigint, y: bigint, z: bigint): void {
    const metadata = world.getMetadata?.(x, y, z) ?? 0
    const facing = getMetadataFacing(metadata)
    const offset = getHeadOffset(facing)
    const headX = x + offset.dx
    const headZ = z + offset.dz

    const headBlock = world.getBlock(headX, y, headZ)
    if (headBlock.properties.id === BlockIds.BED_HEAD) {
      world.setBlock(headX, y, headZ, BlockIds.AIR)
    }
  }
}
