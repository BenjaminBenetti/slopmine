import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { GlimmercapBlockItem } from '../../../../items/blocks/glimmercap/GlimmercapBlockItem.ts'
import { createGroundCrossGeometry } from '../ember_shared/fungusSpriteGeometry.ts'
import { makeGlowDarkOnly } from '../../../../renderer/BioluminescentMaterial.ts'
import glimmercapTexUrl from './assets/glimmercap.webp'
import glimmercapGlowTexUrl from './assets/glimmercap_glow.webp'

registerTextureUrl(TextureId.GLIMMERCAP, glimmercapTexUrl)

const glimmercapGeometry = createGroundCrossGeometry(0.7, 0.8)

// Bioluminescent caps: dusty little mushrooms by day; in the dark the glow
// map (only the caps, stems stay unlit) lights them pink
const glimmercapMaterial = new THREE.MeshLambertMaterial({
  map: loadBlockTexture(glimmercapTexUrl),
  emissiveMap: loadBlockTexture(glimmercapGlowTexUrl),
  emissive: 0xffffff,
  emissiveIntensity: 1.0,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})
makeGlowDarkOnly(glimmercapMaterial)

/**
 * Glimmercap - a tuft of tiny dusty mushrooms on the swamp floor, thickest
 * on glowmoss, whose caps glow pink after dark. A faint light source (5):
 * enough to pool a little light around it at night (block light barely
 * shows in daylight), too little to keep night creatures away.
 */
export class GlimmercapBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.GLIMMERCAP,
    name: 'glimmercap',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0,
    lightLevel: 5,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.GLIMMERCAP
  }

  protected getGeometry(): THREE.BufferGeometry {
    return glimmercapGeometry
  }

  protected getMaterials(): THREE.Material {
    return glimmercapMaterial
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
    return new THREE.Box3(new THREE.Vector3(0.15, 0, 0.15), new THREE.Vector3(0.85, 0.65, 0.85))
  }

  getDrops(): IItem[] {
    return [new GlimmercapBlockItem()]
  }
}
