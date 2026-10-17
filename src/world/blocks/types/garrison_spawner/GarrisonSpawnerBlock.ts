import * as THREE from 'three'
import type { BlockFace, IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import type { IWorldCoordinate } from '../../../interfaces/ICoordinates.ts'
import type { IBlockEntity } from '../../../../entities/interfaces/IBlockEntity.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { registerEmissiveTexture } from '../../../../renderer/EmissiveTextures.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { GarrisonSpawnerBlockEntity } from './GarrisonSpawnerBlockEntity.ts'
import topTexUrl from './assets/garrison-spawner-top.webp'
import sideTexUrl from './assets/garrison-spawner-side.webp'

registerTextureUrl(TextureId.GARRISON_SPAWNER_TOP, topTexUrl)
registerTextureUrl(TextureId.GARRISON_SPAWNER_SIDE, sideTexUrl)
// Embers smoulder under the grate
registerEmissiveTexture(TextureId.GARRISON_SPAWNER_TOP, { strength: 1.3, threshold: 0.18 })

const topMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(topTexUrl) })
const sideMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(sideTexUrl) })

/**
 * Garrison spawner - a heavy iron grate set flush into a dungeon floor,
 * embers smouldering below. Kit modules place it in guard rooms with the
 * garrison index in its metadata (src/dungeons/GarrisonRegistry.ts); when
 * the player comes near, the room's garrison climbs out. Dungeon
 * structural: infernium force, very hard, never drops.
 */
export class GarrisonSpawnerBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.GARRISON_SPAWNER,
    name: 'garrison_spawner',
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
    return TextureId.GARRISON_SPAWNER_SIDE
  }

  protected getMaterials(): THREE.Material[] {
    // Order: +X, -X, +Y, -Y, +Z, -Z
    return [sideMaterial, sideMaterial, topMaterial, sideMaterial, sideMaterial, sideMaterial]
  }

  /** TOP=0, BOTTOM=1, NORTH=2, SOUTH=3, EAST=4, WEST=5 */
  getTextureForFace(face: BlockFace): number {
    return face === 0 ? TextureId.GARRISON_SPAWNER_TOP : TextureId.GARRISON_SPAWNER_SIDE
  }

  getDrops(): IItem[] {
    return []
  }

  createBlockEntity(position: IWorldCoordinate, _world: IWorld): IBlockEntity {
    return new GarrisonSpawnerBlockEntity(position)
  }
}
