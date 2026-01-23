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
const LEG_SIZE = 2/16             // Thin leg posts
const LEG_HEIGHT = 6/16           // Visible space under bed
const MATTRESS_HEIGHT = 5/16      // Mattress thickness
const MATTRESS_Y = 6/16           // Mattress sits on top of legs
const HEADBOARD_HEIGHT = 7/16     // Headboard rises above mattress
const BOARD_THICKNESS = 2/16      // Thickness of headboard panel

const BED_TOP = MATTRESS_Y + MATTRESS_HEIGHT  // Total collision height (11/16)

// Create bed head geometry: 2 back legs + mattress + headboard
function createBedHeadGeometry(): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = []

  // Material indices: 0 = wood (legs, sides, bottom, headboard), 1 = pillow top

  // === BACK-LEFT LEG ===
  const backLeftLeg = new THREE.BoxGeometry(LEG_SIZE, LEG_HEIGHT, LEG_SIZE)
  backLeftLeg.translate(-0.5 + LEG_SIZE/2, LEG_HEIGHT/2, -0.5 + LEG_SIZE/2)
  backLeftLeg.groups.forEach(g => { g.materialIndex = 0 })
  geometries.push(backLeftLeg)

  // === BACK-RIGHT LEG ===
  const backRightLeg = new THREE.BoxGeometry(LEG_SIZE, LEG_HEIGHT, LEG_SIZE)
  backRightLeg.translate(0.5 - LEG_SIZE/2, LEG_HEIGHT/2, -0.5 + LEG_SIZE/2)
  backRightLeg.groups.forEach(g => { g.materialIndex = 0 })
  geometries.push(backRightLeg)

  // === MATTRESS ===
  // BoxGeometry groups order: +X, -X, +Y, -Y, +Z, -Z (indices 0-5)
  const mattress = new THREE.BoxGeometry(1, MATTRESS_HEIGHT, 1)
  mattress.translate(0, MATTRESS_Y + MATTRESS_HEIGHT/2, 0)
  // Set all faces to wood first
  mattress.groups.forEach(g => { g.materialIndex = 0 })
  // Then set top face (+Y, group index 2) to pillow texture
  if (mattress.groups[2]) {
    mattress.groups[2].materialIndex = 1
  }
  geometries.push(mattress)

  // === HEADBOARD (thin panel at the back, rising above the mattress) ===
  const headboard = new THREE.BoxGeometry(1, HEADBOARD_HEIGHT, BOARD_THICKNESS)
  // Position: centered X, above mattress surface, at back edge
  headboard.translate(0, BED_TOP + HEADBOARD_HEIGHT/2, -0.5 + BOARD_THICKNESS/2)
  headboard.groups.forEach(g => { g.materialIndex = 0 })
  geometries.push(headboard)

  return mergeGeometries(geometries, true)
}

const bedHeadGeometry = createBedHeadGeometry()
const bedHeadMaterials = [bedWoodMaterial, bedTopMaterial]

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

  getGeometry(): THREE.BufferGeometry {
    return bedHeadGeometry
  }

  protected getMaterials(): THREE.Material[] {
    return bedHeadMaterials
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

  onPlace(world: IWorld, x: bigint, y: bigint, z: bigint, facing?: BlockFacing): void {
    const actualFacing = facing ?? BlockFacing.SOUTH
    const offset = getFootOffset(actualFacing)
    const footX = x + offset.dx
    const footZ = z + offset.dz

    const footBlock = world.getBlock(footX, y, footZ)
    if (footBlock.properties.id !== BlockIds.AIR) {
      world.setBlock(x, y, z, BlockIds.AIR)
      console.log('Cannot place bed - foot position is blocked')
      return
    }

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
