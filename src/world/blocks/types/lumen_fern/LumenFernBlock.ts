import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { LumenFernBlockItem } from '../../../../items/blocks/lumen_fern/LumenFernBlockItem.ts'
import { createGroundCrossGeometry } from '../ember_shared/fungusSpriteGeometry.ts'
import { makeGlowDarkOnly } from '../../../../renderer/BioluminescentMaterial.ts'
import lumenFernTexUrl from './assets/lumen_fern.webp'
import lumenFernGlowTexUrl from './assets/lumen_fern_glow.webp'

registerTextureUrl(TextureId.LUMEN_FERN, lumenFernTexUrl)

const lumenFernGeometry = createGroundCrossGeometry(0.9, 0.95)

// Bioluminescent tips: a plain fern by day; in the dark the glow map (only
// the fiddleheads and frond tips) lights them cyan
const lumenFernMaterial = new THREE.MeshLambertMaterial({
  map: loadBlockTexture(lumenFernTexUrl),
  emissiveMap: loadBlockTexture(lumenFernGlowTexUrl),
  emissive: 0xffffff,
  emissiveIntensity: 1.0,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})
makeGlowDarkOnly(lumenFernMaterial)

/**
 * Lumen fern - a swamp fern whose curled fiddleheads and frond tips glow
 * cyan after dark. A faint light source (4), like the glimmercap: it never
 * keeps night creatures away.
 */
export class LumenFernBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.LUMEN_FERN,
    name: 'lumen_fern',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0,
    lightLevel: 4,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.LUMEN_FERN
  }

  protected getGeometry(): THREE.BufferGeometry {
    return lumenFernGeometry
  }

  protected getMaterials(): THREE.Material {
    return lumenFernMaterial
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
    return new THREE.Box3(new THREE.Vector3(0.15, 0, 0.15), new THREE.Vector3(0.85, 0.85, 0.85))
  }

  getDrops(): IItem[] {
    return [new LumenFernBlockItem()]
  }
}
