import * as THREE from 'three'
import type { IBlockProperties } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { SolidBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { registerEmissiveTexture } from '../../../../renderer/EmissiveTextures.ts'
import { SoulShardItem } from '../../../../items/materials/soul_shard/SoulShardItem.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import soulVeinTexUrl from './assets/soul-vein.webp'

registerTextureUrl(TextureId.SOUL_VEIN, soulVeinTexUrl)
// The pale-green veins glow; the ossified rock around them does not
registerEmissiveTexture(TextureId.SOUL_VEIN, { strength: 1.2, threshold: 0.3 })

const soulVeinMaterial = new THREE.MeshLambertMaterial({ map: loadBlockTexture(soulVeinTexUrl) })

/**
 * Soul vein - ossified rock threaded with glowing pale-green soul matter,
 * the Ossuary's unique resource. Diamond pickaxe (force 5) or better;
 * breaks into 1-3 soul shards.
 */
export class SoulVeinBlock extends SolidBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.SOUL_VEIN,
    name: 'soul_vein',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 6.0,
    lightLevel: 6, // Faint soul-light around exposed veins
    lightBlocking: 15,
    demolitionForceRequired: 5,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.SOUL_VEIN
  }

  protected getMaterials(): THREE.Material {
    return soulVeinMaterial
  }

  getDrops(): IItem[] {
    const count = 1 + Math.floor(Math.random() * 3) // 1-3
    const drops: IItem[] = []
    for (let i = 0; i < count; i++) drops.push(new SoulShardItem())
    return drops
  }
}
