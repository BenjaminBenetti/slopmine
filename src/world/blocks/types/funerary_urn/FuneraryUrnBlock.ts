import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { FuneraryUrnBlockItem } from '../../../../items/blocks/funerary_urn/FuneraryUrnBlockItem.ts'

// Urn: foot, swelling body, dark band, neck, lid with a knob (y -0.5 = floor)
const part = (w: number, h: number, y: number, material: number): THREE.BufferGeometry => {
  const g = new THREE.BoxGeometry(w, h, w)
  g.translate(0, y + h / 2, 0)
  g.groups.forEach((group) => { group.materialIndex = material })
  return g
}
const urnGeometry = mergeGeometries([
  part(0.34, 0.08, -0.5, 1), // foot
  part(0.46, 0.14, -0.42, 0), // lower body
  part(0.56, 0.2, -0.28, 0), // belly
  part(0.58, 0.06, -0.18, 1), // dark band
  part(0.5, 0.12, -0.12, 0), // shoulder
  part(0.3, 0.1, 0.0, 0), // neck
  part(0.4, 0.06, 0.1, 1), // lid rim
  part(0.32, 0.06, 0.16, 0), // lid
  part(0.1, 0.07, 0.22, 1), // knob
], true)

const urnMaterials = [
  new THREE.MeshLambertMaterial({ color: 0xcbbfa3 }), // bone-pale glazed clay
  new THREE.MeshLambertMaterial({ color: 0x4a4e45 }), // dark stone bands
]

/**
 * Funerary urn - a pale glazed burial urn with dark bands, set on ledges and
 * floors of the Catacombs embalming rooms and sarcophagus chambers.
 */
export class FuneraryUrnBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.FUNERARY_URN,
    name: 'funerary_urn',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 0.6,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.FUNERARY_URN
  }

  protected getGeometry(): THREE.BufferGeometry {
    return urnGeometry
  }

  protected getMaterials(): THREE.Material[] {
    return urnMaterials
  }

  shouldRenderFace(_face: BlockFace): boolean {
    return true
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getCollisionBox(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0.21, 0, 0.21), new THREE.Vector3(0.79, 0.76, 0.79))
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0.21, 0, 0.21), new THREE.Vector3(0.79, 0.76, 0.79))
  }

  getDrops(): IItem[] {
    return [new FuneraryUrnBlockItem()]
  }
}
