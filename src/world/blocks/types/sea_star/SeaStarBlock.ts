import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { SeaStarBlockItem } from '../../../../items/blocks/sea_star/SeaStarBlockItem.ts'
import seaStarTexUrl from './assets/sea-star.webp'

// Face-map entry only (the block renders via its custom geometry below)
registerTextureUrl(TextureId.SEA_STAR, seaStarTexUrl, true)

// Colors and shape mirror SeaStarEntity; slightly larger pixel scale so the
// still trophy reads clearly at block distance (same trick as the crab shell)
const STAR_ORANGE = 0xe87f3a
const STAR_DARK = 0xc75f28
const STAR_BUMP = 0xf3a55e

const S = 0.08
const CENTER_SIZE = 2 * S
const CENTER_HEIGHT = 1.2 * S
const ARM_WIDTH = 1.4 * S
const ARM_HEIGHT = 1 * S
const ARM_LENGTH = 2.5 * S
const TIP_SIZE = 0.9 * S
const ARM_COUNT = 5
const FLOOR = -0.5 // cell floor in geometry space

// Material groups: 0 orange body, 1 dark arm tips, 2 center bump highlight
const seaStarGeometry = (() => {
  const parts: THREE.BufferGeometry[] = []
  // mergeGeometries(useGroups) assigns each part's materialIndex from its
  // ARRAY POSITION - record the intended material per part and remap after
  const partMaterials: number[] = []
  const add = (g: THREE.BufferGeometry, mat: number) => {
    parts.push(g)
    partMaterials.push(mat)
  }

  // Central disc with the lighter bump on top
  const center = new THREE.BoxGeometry(CENTER_SIZE, CENTER_HEIGHT, CENTER_SIZE)
  center.translate(0, FLOOR + CENTER_HEIGHT / 2, 0)
  add(center, 0)

  const bump = new THREE.BoxGeometry(CENTER_SIZE * 0.5, CENTER_HEIGHT * 0.4, CENTER_SIZE * 0.5)
  bump.translate(0, FLOOR + CENTER_HEIGHT + CENTER_HEIGHT * 0.1, 0)
  add(bump, 2)

  // Five arms radiating at 72°, each with a narrower dark tip. Translate
  // outward along +Z first, then rotateY orbits the arm around the center.
  for (let i = 0; i < ARM_COUNT; i++) {
    const angle = (i / ARM_COUNT) * Math.PI * 2

    const arm = new THREE.BoxGeometry(ARM_WIDTH, ARM_HEIGHT, ARM_LENGTH)
    arm.translate(0, ARM_HEIGHT / 2, CENTER_SIZE / 2 + ARM_LENGTH / 2 - ARM_WIDTH * 0.25)
    arm.rotateY(angle)
    arm.translate(0, FLOOR, 0)
    add(arm, 0)

    const tip = new THREE.BoxGeometry(TIP_SIZE, ARM_HEIGHT * 0.8, TIP_SIZE)
    tip.translate(0, ARM_HEIGHT * 0.4, CENTER_SIZE / 2 + ARM_LENGTH + TIP_SIZE * 0.2)
    tip.rotateY(angle)
    tip.translate(0, FLOOR, 0)
    add(tip, 1)
  }

  const merged = mergeGeometries(parts, true)
  merged.groups.forEach((group, i) => { group.materialIndex = partMaterials[i] })
  return merged
})()

const seaStarMaterials = [
  new THREE.MeshLambertMaterial({ color: STAR_ORANGE }),
  new THREE.MeshLambertMaterial({ color: STAR_DARK }),
  new THREE.MeshLambertMaterial({ color: STAR_BUMP }),
]

/**
 * Placeable sea star - a still replica of SeaStarEntity, completing the
 * beach-combing decoration set with the sea shell and crab shell.
 * No collision; instant pick-up.
 */
export class SeaStarBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.SEA_STAR,
    name: 'sea_star',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.SEA_STAR
  }

  protected getGeometry(): THREE.BufferGeometry {
    return seaStarGeometry
  }

  protected getMaterials(): THREE.Material[] {
    return seaStarMaterials
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  shouldRenderFace(_face: BlockFace): boolean {
    return true
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(
      new THREE.Vector3(0.12, 0, 0.12),
      new THREE.Vector3(0.88, 0.2, 0.88)
    )
  }

  getDrops(): IItem[] {
    return [new SeaStarBlockItem()]
  }
}
