import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { IBlockProperties, IWorld, BlockFace } from '../../../interfaces/IBlock.ts'
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
const LEG_SIZE = 2/16             // Thin leg posts
const LEG_HEIGHT = 6/16           // Visible space under bed
const MATTRESS_HEIGHT = 5/16      // Mattress thickness
const MATTRESS_Y = 6/16           // Mattress sits on top of legs
const FOOTBOARD_HEIGHT = 4/16     // Footboard is shorter than headboard
const BOARD_THICKNESS = 2/16      // Thickness of footboard panel

const BED_TOP = MATTRESS_Y + MATTRESS_HEIGHT  // Total collision height (11/16)

// Create bed foot geometry: 2 front legs + mattress + footboard
function createBedFootGeometry(): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = []

  // Material indices: 0 = wood (legs, sides, bottom, footboard), 1 = blanket top

  // === FRONT-LEFT LEG ===
  const frontLeftLeg = new THREE.BoxGeometry(LEG_SIZE, LEG_HEIGHT, LEG_SIZE)
  frontLeftLeg.translate(-0.5 + LEG_SIZE/2, LEG_HEIGHT/2, 0.5 - LEG_SIZE/2)
  frontLeftLeg.groups.forEach(g => { g.materialIndex = 0 })
  geometries.push(frontLeftLeg)

  // === FRONT-RIGHT LEG ===
  const frontRightLeg = new THREE.BoxGeometry(LEG_SIZE, LEG_HEIGHT, LEG_SIZE)
  frontRightLeg.translate(0.5 - LEG_SIZE/2, LEG_HEIGHT/2, 0.5 - LEG_SIZE/2)
  frontRightLeg.groups.forEach(g => { g.materialIndex = 0 })
  geometries.push(frontRightLeg)

  // === MATTRESS ===
  // BoxGeometry groups order: +X, -X, +Y, -Y, +Z, -Z (indices 0-5)
  const mattress = new THREE.BoxGeometry(1, MATTRESS_HEIGHT, 1)
  mattress.translate(0, MATTRESS_Y + MATTRESS_HEIGHT/2, 0)
  // Set all faces to wood first
  mattress.groups.forEach(g => { g.materialIndex = 0 })
  // Then set top face (+Y, group index 2) to blanket texture
  if (mattress.groups[2]) {
    mattress.groups[2].materialIndex = 1
  }
  geometries.push(mattress)

  // === FOOTBOARD (thin panel at the front, rising above the mattress) ===
  const footboard = new THREE.BoxGeometry(1, FOOTBOARD_HEIGHT, BOARD_THICKNESS)
  // Position: centered X, above mattress surface, at front edge
  footboard.translate(0, BED_TOP + FOOTBOARD_HEIGHT/2, 0.5 - BOARD_THICKNESS/2)
  footboard.groups.forEach(g => { g.materialIndex = 0 })
  geometries.push(footboard)

  return mergeGeometries(geometries, true)
}

const bedFootGeometry = createBedFootGeometry()
const bedFootMaterials = [bedWoodMaterial, bedTopMaterial]

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

  getGeometry(): THREE.BufferGeometry {
    return bedFootGeometry
  }

  protected getMaterials(): THREE.Material[] {
    return bedFootMaterials
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
