import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { LensApparatusBlockItem } from '../../../../items/blocks/lens_apparatus/LensApparatusBlockItem.ts'
import { mergeByMaterial, part, sanctumGoldMaterial, sanctumStoneMaterial, nonIndexed } from '../sanctum_shared/sanctumMaterials.ts'

// A gold octagonal ring (in the XY plane, the lens facing +Z) on a gold post
// and a stone foot; a translucent violet lens fills the ring.
const RING_R = 0.36
const RING_Y = 0.12
const ring: THREE.BufferGeometry[] = []
for (let i = 0; i < 8; i++) {
  const angle = (i * Math.PI) / 4
  const seg = new THREE.BoxGeometry(0.3, 0.06, 0.07)
  seg.rotateZ(angle + Math.PI / 2)
  seg.translate(Math.cos(angle) * RING_R, RING_Y + Math.sin(angle) * RING_R, 0)
  ring.push(nonIndexed(seg))
}
const lensFront = new THREE.CircleGeometry(RING_R - 0.02, 8).rotateZ(Math.PI / 8).translate(0, RING_Y, 0)
const lensBack = lensFront.clone().rotateY(Math.PI)
const geometry = mergeByMaterial([
  [part(0.5, 0.1, 0.36, 0, -0.45, 0)],
  [part(0.08, 0.36, 0.08, 0, -0.24, 0), ...ring],
  [nonIndexed(lensFront), nonIndexed(lensBack)],
])
const lensMaterial = new THREE.MeshBasicMaterial({
  color: 0xb48af0,
  transparent: true,
  opacity: 0.45,
  depthWrite: false,
  side: THREE.DoubleSide,
})
const materials = [sanctumStoneMaterial, sanctumGoldMaterial, lensMaterial]

/**
 * Lens apparatus - a gold lens ring with a violet lens on a stand: the
 * acolytes' instruments in reliquaries, the observatory and the Warden's
 * lens chamber. Faces the way it was placed. Decor.
 */
export class LensApparatusBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.LENS_APPARATUS,
    name: 'lens_apparatus',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 2.0,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 1,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.LENS_APPARATUS
  }

  protected getGeometry(): THREE.BufferGeometry {
    return geometry
  }

  protected getMaterials(): THREE.Material[] {
    return materials
  }

  shouldRenderFace(): boolean {
    return true
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getCollisionBox(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0.25, 0, 0.25), new THREE.Vector3(0.75, 1, 0.75))
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0.1, 0, 0.1), new THREE.Vector3(0.9, 1, 0.9))
  }

  getDrops(): IItem[] {
    return [new LensApparatusBlockItem()]
  }
}
