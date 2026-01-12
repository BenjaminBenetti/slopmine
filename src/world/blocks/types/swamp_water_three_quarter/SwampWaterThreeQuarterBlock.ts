import * as THREE from 'three'
import type { IBlockProperties, BlockFace, IBlock } from '../../../interfaces/IBlock.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import swampWaterTexUrl from './assets/swamp-water.webp'

registerTextureUrl(TextureId.SWAMP_WATER_THREE_QUARTER, swampWaterTexUrl, true)

const swampWaterTexture = loadBlockTexture(swampWaterTexUrl)

function createGeometry(): THREE.BufferGeometry {
  const height = 0.75
  const yOffset = -0.125
  const geometry = new THREE.BoxGeometry(1, height, 1)
  geometry.translate(0, yOffset, 0)

  const uvAttr = geometry.getAttribute('uv')
  const uvArray = uvAttr.array as Float32Array
  const sideFaceIndices = [0, 1, 2, 3, 4, 5, 6, 7, 16, 17, 18, 19, 20, 21, 22, 23]
  for (const vertIdx of sideFaceIndices) {
    const vIdx = vertIdx * 2 + 1
    uvArray[vIdx] = uvArray[vIdx] * height
  }
  uvAttr.needsUpdate = true
  return geometry
}

const geometry = createGeometry()
const material = new THREE.MeshLambertMaterial({
  map: swampWaterTexture,
  transparent: true,
  opacity: 0.8,
  side: THREE.DoubleSide,
})

export class SwampWaterThreeQuarterBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.SWAMP_WATER_THREE_QUARTER,
    name: 'swamp_water_three_quarter',
    isOpaque: false,
    isSolid: false,
    isLiquid: true,
    hardness: 100,
    lightLevel: 0,
    lightBlocking: 2,
    demolitionForceRequired: Infinity,
    tags: [],
    liquidFamily: 'swamp_water',
    liquidLevel: 6,
  }

  protected get defaultTextureId(): number {
    return TextureId.SWAMP_WATER_THREE_QUARTER
  }

  protected getGeometry(): THREE.BufferGeometry {
    return geometry
  }

  protected getMaterials(): THREE.Material {
    return material
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  override shouldRenderFace(_face: BlockFace, neighbor: IBlock): boolean {
    if (neighbor.properties.id === BlockIds.AIR) return true
    if (neighbor.properties.liquidFamily === 'swamp_water') return false
    return true
  }
}
