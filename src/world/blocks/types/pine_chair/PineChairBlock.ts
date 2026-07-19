import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { PineChairBlockItem } from '../../../../items/blocks/pine_chair/PineChairBlockItem.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'

// Reuse the pine planks texture (registered by the planks block module)
import pinePlanksTexUrl from '../pine_planks/assets/pine-planks.webp'

const pinePlanksTexture = loadBlockTexture(pinePlanksTexUrl)
const pineChairMaterial = new THREE.MeshLambertMaterial({ map: pinePlanksTexture })

// Chair dimensions - geometry centered around Y=0 (renderer adds +0.5).
// Front faces +Z (SOUTH = identity rotation); backrest sits toward -Z.
const SEAT_WIDTH = 0.7            // Seat footprint (X and Z)
const SEAT_BOTTOM = -0.1          // Seat underside
const SEAT_TOP = 0.02             // Seat surface
const LEG_SIZE = 0.08             // Leg post thickness
const LEG_INSET = SEAT_WIDTH / 2 - LEG_SIZE / 2   // Legs flush with seat edges
const BACKREST_Z_MIN = -0.42      // Backrest panel front-to-back extent
const BACKREST_Z_MAX = -0.3
const BACKREST_TOP = 0.5          // Backrest rises to top of cell

const chairGeometry = (() => {
  const geometries: THREE.BufferGeometry[] = []

  // Seat
  const seat = new THREE.BoxGeometry(SEAT_WIDTH, SEAT_TOP - SEAT_BOTTOM, SEAT_WIDTH)
  seat.translate(0, (SEAT_TOP + SEAT_BOTTOM) / 2, 0)
  geometries.push(seat)

  // Four legs (from floor up to seat underside)
  const legHeight = SEAT_BOTTOM - -0.5
  for (const xSign of [-1, 1]) {
    for (const zSign of [-1, 1]) {
      const leg = new THREE.BoxGeometry(LEG_SIZE, legHeight, LEG_SIZE)
      leg.translate(xSign * LEG_INSET, -0.5 + legHeight / 2, zSign * LEG_INSET)
      geometries.push(leg)
    }
  }

  // Backrest panel (rises from seat top to y 0.5 along -Z edge of seat)
  const backrest = new THREE.BoxGeometry(
    SEAT_WIDTH,
    BACKREST_TOP - SEAT_TOP,
    BACKREST_Z_MAX - BACKREST_Z_MIN
  )
  backrest.translate(
    0,
    (BACKREST_TOP + SEAT_TOP) / 2,
    (BACKREST_Z_MIN + BACKREST_Z_MAX) / 2
  )
  geometries.push(backrest)

  return mergeGeometries(geometries, false)
})()

/**
 * Pine chair - seat with four legs and a backrest, open toward +Z (front).
 * Uses the pine planks texture. Facing rotation via placement metadata.
 */
export class PineChairBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.PINE_CHAIR,
    name: 'pine_chair',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 1.8,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.PINE_PLANKS
  }

  protected getGeometry(): THREE.BufferGeometry {
    return chairGeometry
  }

  protected getMaterials(): THREE.Material {
    return pineChairMaterial
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getCollisionBox(): THREE.Box3 | null {
    return new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0.55, 1)
    )
  }

  getDrops(): IItem[] {
    return [new PineChairBlockItem()]
  }
}
