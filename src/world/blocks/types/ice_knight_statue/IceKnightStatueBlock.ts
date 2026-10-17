import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { IceKnightStatueBlockItem } from '../../../../items/blocks/ice_knight_statue/IceKnightStatueBlockItem.ts'
import { cellBox } from '../cocytus_shared/CrossSpriteGeometry.ts'
import glacialIceTexUrl from '../glacial_ice/assets/glacial-ice.webp'

// A knight in frozen plate kneeling on one knee, both hands on a greatsword
// planted point-down before him - the Frozen Knights of the citadel, carved
// in ice. Cell space 0..1, faces +Z (SOUTH) at facing SOUTH; rises 1.85
// blocks (the cell above must stay clear). Groups: 0 = ice, 1 = darker ice
const ICE = 0
const DARK = 1

const geometry = mergeGeometries([
  cellBox(0.1, 0, 0.1, 0.8, 0.12, 0.8, DARK), // plinth slab
  // kneeling legs: right knee down (shin along the floor), left knee up
  cellBox(0.52, 0.12, 0.18, 0.18, 0.16, 0.5, ICE), // right shin on the ground
  cellBox(0.52, 0.12, 0.5, 0.18, 0.42, 0.18, ICE), // right thigh up to the hips
  cellBox(0.28, 0.12, 0.56, 0.18, 0.36, 0.18, ICE), // left shin (upright)
  cellBox(0.28, 0.46, 0.4, 0.18, 0.14, 0.34, ICE), // left thigh (forward)
  // torso, belt, pauldrons, helmet with a crest
  cellBox(0.26, 0.54, 0.36, 0.48, 0.5, 0.3, ICE),
  cellBox(0.25, 0.54, 0.35, 0.5, 0.08, 0.32, DARK),
  cellBox(0.16, 0.92, 0.33, 0.2, 0.16, 0.36, DARK),
  cellBox(0.64, 0.92, 0.33, 0.2, 0.16, 0.36, DARK),
  cellBox(0.36, 1.04, 0.38, 0.28, 0.3, 0.28, ICE),
  cellBox(0.38, 1.12, 0.65, 0.24, 0.06, 0.02, DARK), // visor slit
  cellBox(0.47, 1.34, 0.4, 0.06, 0.16, 0.24, DARK), // crest
  // arms reaching forward to the sword hilt
  cellBox(0.2, 0.7, 0.5, 0.14, 0.14, 0.3, ICE),
  cellBox(0.66, 0.7, 0.5, 0.14, 0.14, 0.3, ICE),
  // greatsword planted point-down in front: blade, guard, grip, pommel
  cellBox(0.46, 0.12, 0.8, 0.08, 0.66, 0.04, ICE),
  cellBox(0.34, 0.78, 0.78, 0.32, 0.05, 0.08, DARK),
  cellBox(0.47, 0.83, 0.79, 0.06, 0.16, 0.06, DARK),
  cellBox(0.46, 0.99, 0.78, 0.08, 0.06, 0.08, ICE),
], true)

const iceTexture = loadBlockTexture(glacialIceTexUrl)
const iceMaterial = new THREE.MeshLambertMaterial({ map: iceTexture, color: 0xe6f1fa })
const darkMaterial = new THREE.MeshLambertMaterial({ map: iceTexture, color: 0x8ea6bd })
const materials = [iceMaterial, darkMaterial]

/**
 * Ice knight statue - a Frozen Knight kneeling in carved ice: the Hall of
 * Kings, the chapel and the courtyards of the Frozen Citadel. Faces the
 * way its facing metadata says.
 */
export class IceKnightStatueBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.ICE_KNIGHT_STATUE,
    name: 'ice_knight_statue',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 4,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 2,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.ICE_KNIGHT_STATUE
  }

  protected getGeometry(): THREE.BufferGeometry {
    return geometry
  }

  protected getMaterials(): THREE.Material[] {
    return materials
  }

  getCollisionBox(): THREE.Box3 | null {
    return new THREE.Box3(new THREE.Vector3(0.1, 0, 0.1), new THREE.Vector3(0.9, 1, 0.9))
  }

  shouldRenderFace(_face: BlockFace): boolean {
    return true
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0.1, 0, 0.1), new THREE.Vector3(0.9, 1.5, 0.9))
  }

  getDrops(): IItem[] {
    return [new IceKnightStatueBlockItem()]
  }
}
