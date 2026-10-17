import * as THREE from 'three'
import type { BlockFace, IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import topTexUrl from './assets/guardian-spawner-spent-top.webp'
import sideTexUrl from './assets/guardian-spawner-spent-side.webp'

registerTextureUrl(TextureId.GUARDIAN_SPAWNER_SPENT_TOP, topTexUrl)
registerTextureUrl(TextureId.GUARDIAN_SPAWNER_SPENT_SIDE, sideTexUrl)

const topMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(topTexUrl) })
const sideMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(sideTexUrl) })

/**
 * Spent guardian spawner - the altar after its guardian was defeated: the
 * runes have gone cold and the stone is cracked. Inert (no block entity), so
 * the dungeon's guardian never returns. Metadata keeps the guardian index.
 */
export class GuardianSpawnerSpentBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.GUARDIAN_SPAWNER_SPENT,
    name: 'guardian_spawner_spent',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 200.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 6, // infernium (dungeon structural)
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.GUARDIAN_SPAWNER_SPENT_SIDE
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [sideMaterial, sideMaterial, topMaterial, sideMaterial, sideMaterial, sideMaterial]
  }

  /** TOP=0, BOTTOM=1, NORTH=2, SOUTH=3, EAST=4, WEST=5 */
  getTextureForFace(face: BlockFace): number {
    return face === 0 ? TextureId.GUARDIAN_SPAWNER_SPENT_TOP : TextureId.GUARDIAN_SPAWNER_SPENT_SIDE
  }

  getDrops(): IItem[] {
    return []
  }
}
