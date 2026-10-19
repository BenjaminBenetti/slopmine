import * as THREE from 'three'
import { mergeTaggedParts } from '../model_shared/mergeTaggedParts.ts'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { SoulCandelabraBlockItem } from '../../../../items/blocks/soul_candelabra/SoulCandelabraBlockItem.ts'

const box = (w: number, h: number, d: number, x: number, y: number, z: number, material: number): THREE.BufferGeometry => {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(x, y, z)
  g.groups.forEach((group) => { group.materialIndex = material })
  return g
}
// Iron foot and stem, a crossbar with three bone candles under soul flames
const candelabraGeometry = mergeTaggedParts([
  box(0.4, 0.06, 0.4, 0, -0.47, 0, 0), // foot
  box(0.2, 0.06, 0.2, 0, -0.41, 0, 0),
  box(0.07, 0.7, 0.07, 0, -0.04, 0, 0), // stem
  box(0.62, 0.05, 0.07, 0, 0.27, 0, 0), // crossbar
  box(0.07, 0.12, 0.07, -0.28, 0.33, 0, 0), // cups
  box(0.07, 0.12, 0.07, 0.28, 0.33, 0, 0),
  box(0.09, 0.2, 0.09, -0.28, 0.43, 0, 1), // candles
  box(0.09, 0.26, 0.09, 0, 0.42, 0, 1),
  box(0.09, 0.2, 0.09, 0.28, 0.43, 0, 1),
  box(0.08, 0.1, 0.08, -0.28, 0.58, 0, 2), // flames
  box(0.08, 0.1, 0.08, 0, 0.6, 0, 2),
  box(0.08, 0.1, 0.08, 0.28, 0.58, 0, 2),
])

const candelabraMaterials = [
  new THREE.MeshLambertMaterial({ color: 0x3c3d42 }), // wrought iron
  new THREE.MeshLambertMaterial({ color: 0xe0d8c4 }), // bone-white wax
  new THREE.MeshBasicMaterial({ color: 0x7dffa6 }), // soul flame
]

/**
 * Soul candelabra - a wrought-iron candelabra of three bone candles burning
 * with soul fire. Lights the Catacombs halls in pairs.
 */
export class SoulCandelabraBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.SOUL_CANDELABRA,
    name: 'soul_candelabra',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 1.0,
    lightLevel: 12,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.SOUL_CANDELABRA
  }

  protected getGeometry(): THREE.BufferGeometry {
    return candelabraGeometry
  }

  protected getMaterials(): THREE.Material[] {
    return candelabraMaterials
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
    return new THREE.Box3(new THREE.Vector3(0.18, 0, 0.18), new THREE.Vector3(0.82, 1.0, 0.82))
  }

  getDrops(): IItem[] {
    return [new SoulCandelabraBlockItem()]
  }
}
