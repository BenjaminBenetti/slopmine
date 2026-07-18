import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { SeaShellBlockItem } from '../../../../items/blocks/sea_shell/SeaShellBlockItem.ts'
import seaShellTexUrl from './assets/sea-shell.webp'

// Face-map entry only (the block renders via its custom geometry below)
registerTextureUrl(TextureId.SEA_SHELL, seaShellTexUrl, true)

// Colors mirror SeaShellEntity so placed shells match beach shells
const SHELL_CREAM = 0xf1e3c8
const SHELL_PINK = 0xe6b0a4
const SHELL_CREAM_DARK = 0xd8c5a5

// Small spiral conch sitting on the cell floor: a shrinking whorl of boxes
// climbing and drifting sideways, with an opening lip at the base.
// Material groups: 0 = cream, 1 = pink bands, 2 = dark lip
const seaShellGeometry = (() => {
  const parts: THREE.BufferGeometry[] = []
  // mergeGeometries(useGroups) assigns each part's materialIndex from its
  // ARRAY POSITION, ignoring the parts' own groups - record the intended
  // material per part and remap the merged groups afterwards
  const partMaterials: number[] = []
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, mat: number) => {
    const g = new THREE.BoxGeometry(w, h, d)
    g.translate(x, y, z)
    parts.push(g)
    partMaterials.push(mat)
  }
  add(0.30, 0.20, 0.26, -0.02, -0.40, 0, 0)     // main whorl
  add(0.22, 0.16, 0.20, 0.06, -0.31, 0.02, 1)   // second whorl (pink band)
  add(0.15, 0.12, 0.14, 0.12, -0.24, 0.05, 0)   // third whorl
  add(0.09, 0.08, 0.09, 0.16, -0.19, 0.07, 1)   // spire tip (pink band)
  add(0.10, 0.13, 0.18, -0.19, -0.435, 0, 2)    // opening lip
  const merged = mergeGeometries(parts, true)
  merged.groups.forEach((group, i) => { group.materialIndex = partMaterials[i] })
  return merged
})()

const seaShellMaterials = [
  new THREE.MeshLambertMaterial({ color: SHELL_CREAM }),
  new THREE.MeshLambertMaterial({ color: SHELL_PINK }),
  new THREE.MeshLambertMaterial({ color: SHELL_CREAM_DARK }),
]

/**
 * Placeable sea shell - a small decorative conch for shelves and floors.
 * No collision; instant pick-up.
 */
export class SeaShellBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.SEA_SHELL,
    name: 'sea_shell',
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
    return TextureId.SEA_SHELL
  }

  protected getGeometry(): THREE.BufferGeometry {
    return seaShellGeometry
  }

  protected getMaterials(): THREE.Material[] {
    return seaShellMaterials
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
      new THREE.Vector3(0.2, 0, 0.25),
      new THREE.Vector3(0.8, 0.35, 0.75)
    )
  }

  getDrops(): IItem[] {
    return [new SeaShellBlockItem()]
  }
}
