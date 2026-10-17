import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { EmberLanternBlockItem } from '../../../../items/blocks/ember_lantern/EmberLanternBlockItem.ts'
import { buildDecorGeometry, CEILING, type DecorBox } from '../molten_decor/DecorGeometry.ts'

// A black-iron cage hanging from the top of the cell (hook + cap + 4 posts
// + base), a burning ember core inside
const TOP = CEILING
const boxes: DecorBox[] = [
  { w: 0.06, h: 0.22, d: 0.06, x: 0, y: TOP - 0.22, z: 0, m: 0 }, // hook
  { w: 0.42, h: 0.08, d: 0.42, x: 0, y: TOP - 0.3, z: 0, m: 0 }, // cap
  { w: 0.28, h: 0.06, d: 0.28, x: 0, y: TOP - 0.24, z: 0, m: 0 }, // cap top
  { w: 0.44, h: 0.06, d: 0.44, x: 0, y: TOP - 0.86, z: 0, m: 0 }, // base
  ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]): DecorBox => ({ w: 0.06, h: 0.5, d: 0.06, x: sx * 0.18, y: TOP - 0.8, z: sz * 0.18, m: 0 })),
  { w: 0.26, h: 0.36, d: 0.26, x: 0, y: TOP - 0.76, z: 0, m: 1 }, // ember core
  { w: 0.14, h: 0.2, d: 0.14, x: 0, y: TOP - 0.62, z: 0, m: 2 }, // white-hot heart
]
const geometry = buildDecorGeometry(boxes)
const materials = [
  new THREE.MeshLambertMaterial({ color: 0x2b2522 }),
  new THREE.MeshBasicMaterial({ color: 0xff7a24 }),
  new THREE.MeshBasicMaterial({ color: 0xffd27a }),
]

/**
 * Ember lantern: an iron cage of burning embers hanging from a chain or a
 * ceiling - the Infernal Bastion's hall and corridor light (14).
 * Walk-through like a torch.
 */
export class EmberLanternBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.EMBER_LANTERN,
    name: 'ember_lantern',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 1.0,
    lightLevel: 14,
    lightBlocking: 0,
    demolitionForceRequired: 1,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.EMBER_LANTERN
  }

  protected getGeometry(): THREE.BufferGeometry {
    return geometry
  }

  protected getMaterials(): THREE.Material[] {
    return materials
  }

  isGreedyMeshable(): boolean {
    return false
  }

  shouldRenderFace(_face: BlockFace): boolean {
    return true
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0.27, 0.14, 0.27), new THREE.Vector3(0.73, 1, 0.73))
  }

  getDrops(): IItem[] {
    return [new EmberLanternBlockItem()]
  }
}
