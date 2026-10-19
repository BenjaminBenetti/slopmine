import * as THREE from 'three'
import { mergeTaggedParts } from '../model_shared/mergeTaggedParts.ts'
import type { IBlockProperties, BlockFace, IWorld } from '../../../interfaces/IBlock.ts'
import type { IWorldCoordinate } from '../../../interfaces/ICoordinates.ts'
import type { IBlockEntity } from '../../../../entities/interfaces/IBlockEntity.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { WardLanternBlockItem } from '../../../../items/blocks/ward_lantern/WardLanternBlockItem.ts'
import { cellBox } from '../cocytus_shared/CrossSpriteGeometry.ts'
import { WardLanternBlockEntity } from './WardLanternBlockEntity.ts'

// Model (cell space 0..1): a squat bronze lantern around a pale moonlight
// core under a crescent-moon finial, its corners hung with small
// night-trophy charms (fang, antler tine, straw tuft, scythe tip).
// Material groups: 0 = bronze, 1 = moonlight core (unlit), 2 = bone charms, 3 = straw/blade charms
const IRON = 0
const CORE = 1
const BONE = 2
const CHARM = 3
const HEIGHT = 0.82

const geometry = mergeTaggedParts([
  cellBox(0.2, 0, 0.2, 0.6, 0.08, 0.6, IRON), // base
  cellBox(0.24, 0.08, 0.24, 0.06, 0.52, 0.06, IRON), // corner posts
  cellBox(0.7, 0.08, 0.24, 0.06, 0.52, 0.06, IRON),
  cellBox(0.24, 0.08, 0.7, 0.06, 0.52, 0.06, IRON),
  cellBox(0.7, 0.08, 0.7, 0.06, 0.52, 0.06, IRON),
  cellBox(0.3, 0.32, 0.24, 0.4, 0.04, 0.02, IRON), // mid bands
  cellBox(0.3, 0.32, 0.74, 0.4, 0.04, 0.02, IRON),
  cellBox(0.24, 0.32, 0.3, 0.02, 0.04, 0.4, IRON),
  cellBox(0.74, 0.32, 0.3, 0.02, 0.04, 0.4, IRON),
  cellBox(0.18, 0.6, 0.18, 0.64, 0.07, 0.64, IRON), // roof
  cellBox(0.3, 0.67, 0.3, 0.4, 0.06, 0.4, IRON),
  cellBox(0.46, 0.73, 0.46, 0.08, 0.05, 0.08, IRON), // finial stem
  cellBox(0.36, 0.78, 0.47, 0.06, 0.12, 0.06, CORE), // crescent moon: back of the C
  cellBox(0.4, 0.88, 0.47, 0.12, 0.05, 0.06, CORE), // upper horn
  cellBox(0.4, 0.75, 0.47, 0.12, 0.05, 0.06, CORE), // lower horn
  cellBox(0.32, 0.1, 0.32, 0.36, 0.48, 0.36, CORE), // moonlight core
  // Charms hanging under the roof corners
  cellBox(0.12, 0.4, 0.12, 0.07, 0.2, 0.07, BONE), // fang
  cellBox(0.81, 0.42, 0.12, 0.06, 0.18, 0.06, BONE), // antler tine
  cellBox(0.86, 0.5, 0.12, 0.06, 0.05, 0.06, BONE),
  cellBox(0.12, 0.42, 0.81, 0.08, 0.18, 0.08, CHARM), // straw tuft
  cellBox(0.82, 0.4, 0.82, 0.04, 0.2, 0.07, CHARM), // scythe tip
])

const ironMaterial = new THREE.MeshLambertMaterial({ color: 0x6b5232 })
const coreMaterial = new THREE.MeshBasicMaterial({ color: 0xeef2ff })
const boneMaterial = new THREE.MeshLambertMaterial({ color: 0xe6dcc4 })
const charmMaterial = new THREE.MeshLambertMaterial({ color: 0xc9a24e })
const materials = [ironMaterial, coreMaterial, boneMaterial, charmMaterial]

/**
 * Ward Lantern - a bronze lantern around a pale moonlight core, crowned with
 * a crescent moon and hung with trophies of the night. Bright light (15), and no night creature rises
 * within 32 blocks of it (see nightfall/WardLanterns.ts): the way to make a
 * camp safe after dark. Crafted from two night trophies, an iron bar and a
 * torch.
 */
export class WardLanternBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.WARD_LANTERN,
    name: 'ward_lantern',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0.6,
    lightLevel: 15,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.WARD_LANTERN
  }

  protected getGeometry(): THREE.BufferGeometry {
    return geometry
  }

  protected getMaterials(): THREE.Material[] {
    return materials
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
    return new THREE.Box3(new THREE.Vector3(0.15, 0, 0.15), new THREE.Vector3(0.85, HEIGHT, 0.85))
  }

  getDrops(): IItem[] {
    return [new WardLanternBlockItem()]
  }

  createBlockEntity(position: IWorldCoordinate, _world: IWorld): IBlockEntity {
    return new WardLanternBlockEntity(position)
  }
}
