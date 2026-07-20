import * as THREE from 'three'
import type { IBlockProperties, BlockFace } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { PineLogBlockItem } from '../../../../items/blocks/pine_log/PineLogBlockItem.ts'

// Reuse the pine log textures (registered in the atlas by the pine log block module)
import pineLogTexUrl from '../pine_log/assets/pine-log.webp'
import pineLogTopTexUrl from '../pine_log/assets/pine-log-top.webp'

const pineLogTexture = loadBlockTexture(pineLogTexUrl)
const pineLogTopTexture = loadBlockTexture(pineLogTopTexUrl)

const barkMaterial = new THREE.MeshLambertMaterial({ map: pineLogTexture })
const ringMaterial = new THREE.MeshLambertMaterial({ map: pineLogTopTexture })

const STUMP_HEIGHT = 0.4

/**
 * Short stump geometry occupying the bottom of the cell (slab pattern:
 * translated BoxGeometry so it sits on the cell floor).
 */
const stumpGeometry = new THREE.BoxGeometry(1, STUMP_HEIGHT, 1)
  .translate(0, -(1 - STUMP_HEIGHT) / 2, 0)

/**
 * Pine stump - a short (0.4 high) leftover trunk base, a worldgen
 * forest-floor decoration. Log-end rings on top, bark on the sides.
 *
 * Deliberately does NOT extend LogBlock: stumps are debris, not standing
 * trunks, and must not participate in the tree-felling support rule.
 */
export class PineStumpBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.PINE_STUMP,
    name: 'pine_stump',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 1.5,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 0,
    tags: [BlockTags.WOOD],
  }

  protected get defaultTextureId(): number {
    return TextureId.PINE_LOG_SIDE
  }

  protected getGeometry(): THREE.BufferGeometry {
    return stumpGeometry
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [
      barkMaterial, // +X (east) - bark
      barkMaterial, // -X (west) - bark
      ringMaterial, // +Y (top) - log end
      ringMaterial, // -Y (bottom) - log end (hidden against the ground)
      barkMaterial, // +Z (south) - bark
      barkMaterial, // -Z (north) - bark
    ]
  }

  /**
   * Face texture IDs (used for the face texture map even though the stump is
   * not greedy meshed). TOP=0, BOTTOM=1, rest are sides.
   */
  getTextureForFace(face: BlockFace): number {
    switch (face) {
      case 0: // TOP
      case 1: // BOTTOM
        return TextureId.PINE_LOG_END
      default:
        return TextureId.PINE_LOG_SIDE
    }
  }

  getInstanceGeometry(): THREE.BufferGeometry {
    return stumpGeometry
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getCollisionBox(): THREE.Box3 | null {
    return new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, STUMP_HEIGHT, 1)
    )
  }

  getInteractionBox(_metadata: number): THREE.Box3 | null {
    return new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, STUMP_HEIGHT, 1)
    )
  }

  getDrops(): IItem[] {
    return [new PineLogBlockItem()]
  }
}
