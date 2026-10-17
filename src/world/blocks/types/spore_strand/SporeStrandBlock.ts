import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { createHangingCrossGeometry } from '../ember_shared/fungusSpriteGeometry.ts'
import strandTexUrl from './assets/spore-strand.webp'

registerTextureUrl(TextureId.SPORE_STRAND, strandTexUrl)

const strandTexture = loadBlockTexture(strandTexUrl)
const strandGeometry = createHangingCrossGeometry(0.8)

// The teal spore beads glow faintly
const strandMaterial = new THREE.MeshLambertMaterial({
  map: strandTexture,
  emissiveMap: strandTexture,
  emissive: 0xffffff,
  emissiveIntensity: 0.45,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/**
 * Spore strand - threads of spore beads hanging from the gills of giant
 * fungi. No collision; climbable like vines.
 */
export class SporeStrandBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.SPORE_STRAND,
    name: 'spore_strand',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0.1,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [BlockTags.LEAVES, BlockTags.CLIMBABLE],
  }

  protected get defaultTextureId(): number {
    return TextureId.SPORE_STRAND
  }

  protected getGeometry(): THREE.BufferGeometry {
    return strandGeometry
  }

  protected getMaterials(): THREE.Material {
    return strandMaterial
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
    return new THREE.Box3(new THREE.Vector3(0.1, 0, 0.1), new THREE.Vector3(0.9, 1, 0.9))
  }

  getDrops(): IItem[] {
    return []
  }
}
