import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { CrabShellBlockItem } from '../../../../items/blocks/crab_shell/CrabShellBlockItem.ts'
import crabShellTexUrl from './assets/crab-shell.webp'

// Face-map entry only (the block renders via its custom geometry below)
registerTextureUrl(TextureId.CRAB_SHELL, crabShellTexUrl, true)

// Colors and proportions mirror CrabEntity exactly, so the placed shell
// looks like the crab you caught (minus the animation)
const CRAB_SHELL = 0xd6472e
const CRAB_SHELL_DARK = 0xa93a26
const CRAB_LEG = 0x9e3a24
const CRAB_CLAW = 0xe0603c
const CRAB_EYE = 0x1a1a1a

// Proportions tuned in the scratchpad orthographic previewer
// (crabpreview.py) - slightly larger pixel scale than the entity and much
// chunkier splayed legs so the still trophy reads as a crab at block scale
const S = 0.08
const BODY_WIDTH = 5 * S
const BODY_HEIGHT = 2.5 * S
const BODY_DEPTH = 7 * S
const LEG_HEIGHT = 2 * S
const LEG_WIDTH = 1.1 * S
const LEG_LENGTH = 0.23
const LEG_TILT = 0.7
const ARM_LENGTH = 2 * S
const ARM_SIZE = 1.1 * S
const CLAW_SIZE = 1.8 * S
const EYE_STALK_HEIGHT = 1.5 * S
const EYE_STALK_WIDTH = 0.7 * S
const EYE_SIZE = 1 * S
const FLOOR = -0.5 // cell floor in geometry space

// Material groups: 0 shell, 1 dark plate, 2 legs/stalks/arms, 3 claws, 4 eyes
const crabShellGeometry = (() => {
  const parts: THREE.BufferGeometry[] = []
  // mergeGeometries(useGroups) assigns each part's materialIndex from its
  // ARRAY POSITION, ignoring the parts' own groups - record the intended
  // material per part and remap the merged groups afterwards
  const partMaterials: number[] = []
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, mat: number, rotX = 0) => {
    const g = new THREE.BoxGeometry(w, h, d)
    if (rotX !== 0) g.rotateX(rotX)
    g.translate(x, FLOOR + y, z)
    parts.push(g)
    partMaterials.push(mat)
  }

  // Flat, wide body with the darker plate on top
  add(BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH, 0, LEG_HEIGHT + BODY_HEIGHT / 2, 0, 0)
  add(BODY_WIDTH * 0.7, BODY_HEIGHT * 0.35, BODY_DEPTH * 0.7, 0, LEG_HEIGHT + BODY_HEIGHT, 0, 1)

  // Eye stalks with dark eyes on the front (+X) edge
  for (const zMult of [-1, 1]) {
    const stalkY = LEG_HEIGHT + BODY_HEIGHT + EYE_STALK_HEIGHT / 2
    add(EYE_STALK_WIDTH, EYE_STALK_HEIGHT, EYE_STALK_WIDTH,
      BODY_WIDTH / 2 - EYE_STALK_WIDTH, stalkY, zMult * BODY_DEPTH * 0.18, 2)
    add(EYE_SIZE, EYE_SIZE, EYE_SIZE,
      BODY_WIDTH / 2 - EYE_STALK_WIDTH, stalkY + EYE_STALK_HEIGHT / 2 + EYE_SIZE / 3,
      zMult * BODY_DEPTH * 0.18, 4)
  }

  // Claw arms extending from the front corners
  for (const zMult of [-1, 1]) {
    const armY = LEG_HEIGHT + BODY_HEIGHT * 0.4
    const armZ = zMult * BODY_DEPTH * 0.35
    add(ARM_LENGTH, ARM_SIZE, ARM_SIZE, BODY_WIDTH / 2 + ARM_LENGTH / 2, armY, armZ, 2)
    add(CLAW_SIZE, CLAW_SIZE * 0.9, CLAW_SIZE,
      BODY_WIDTH / 2 + ARM_LENGTH + CLAW_SIZE / 3, armY, armZ, 3)
  }

  // Three chunky splayed legs per side: feet planted on the floor, tops
  // tucked under the body edge, tilted well outward so they read clearly
  const legVertical = LEG_LENGTH * Math.cos(LEG_TILT)
  for (const zMult of [-1, 1]) {
    for (const xOffset of [-1.7, 0, 1.7]) {
      add(LEG_WIDTH, LEG_LENGTH, LEG_WIDTH,
        xOffset * S, legVertical / 2, zMult * (BODY_DEPTH / 2),
        2, zMult * LEG_TILT)
    }
  }

  const merged = mergeGeometries(parts, true)
  merged.groups.forEach((group, i) => { group.materialIndex = partMaterials[i] })
  return merged
})()

const crabShellMaterials = [
  new THREE.MeshLambertMaterial({ color: CRAB_SHELL }),
  new THREE.MeshLambertMaterial({ color: CRAB_SHELL_DARK }),
  new THREE.MeshLambertMaterial({ color: CRAB_LEG }),
  new THREE.MeshLambertMaterial({ color: CRAB_CLAW }),
  new THREE.MeshLambertMaterial({ color: CRAB_EYE }),
]

/**
 * Placeable crab shell trophy - a 1:1 still replica of CrabEntity (body,
 * plate, claws, legs, eye stalks) for the mantelpiece.
 * No collision; instant pick-up.
 */
export class CrabShellBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CRAB_SHELL,
    name: 'crab_shell',
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
    return TextureId.CRAB_SHELL
  }

  protected getGeometry(): THREE.BufferGeometry {
    return crabShellGeometry
  }

  protected getMaterials(): THREE.Material[] {
    return crabShellMaterials
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
      new THREE.Vector3(0.14, 0, 0.14),
      new THREE.Vector3(0.9, 0.5, 0.86)
    )
  }

  getDrops(): IItem[] {
    return [new CrabShellBlockItem()]
  }
}
