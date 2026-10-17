import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { createCrossGeometry } from '../soul_bloom/crossGeometry.ts'
import cobwebTexUrl from './assets/crypt-cobweb.webp'

registerTextureUrl(TextureId.CRYPT_COBWEB, cobwebTexUrl)

const cobwebGeometry = createCrossGeometry(1.0, 1.0)
const cobwebMaterial = new THREE.MeshLambertMaterial({
  map: loadBlockTexture(cobwebTexUrl),
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/**
 * Crypt cobweb - dusty webs in the corners of forgotten crypts. Pure
 * dressing: no collision, breaks instantly and drops nothing.
 */
export class CryptCobwebBlock extends TransparentBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.CRYPT_COBWEB,
    name: 'crypt_cobweb',
    isOpaque: false,
    isSolid: false,
    isLiquid: false,
    hardness: 0.2,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [],
  }

  protected get defaultTextureId(): number {
    return TextureId.CRYPT_COBWEB
  }

  protected getGeometry(): THREE.BufferGeometry {
    return cobwebGeometry
  }

  protected getMaterials(): THREE.Material {
    return cobwebMaterial
  }

  getCollisionBox(): THREE.Box3 | null {
    return null
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1))
  }

  getDrops(): IItem[] {
    return []
  }
}
