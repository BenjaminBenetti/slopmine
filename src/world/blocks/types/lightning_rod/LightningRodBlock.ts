import type { IWorld } from '../../../interfaces/IBlock.ts'
import type { IWorldCoordinate } from '../../../interfaces/ICoordinates.ts'
import type { IBlockEntity } from '../../../../entities/interfaces/IBlockEntity.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { FLOOR as F } from '../molten_decor/DecorGeometry.ts'
import { PoiDecorBlock } from '../poi_shared/PoiDecorBlock.ts'
import { LightningRodBlockEntity } from './LightningRodBlockEntity.ts'

/**
 * Lightning Rod - a slim copper rod with a pointed tip on a square base,
 * banded with verdigris. Every lightning strike that would land within 48
 * blocks of a loaded rod hits its tip instead (weather/LightningRods.ts), so
 * a rod on the roof keeps storms off a base. Crafted from three copper bars.
 */
export class LightningRodBlock extends PoiDecorBlock {
  constructor() {
    super({
      id: BlockIds.LIGHTNING_ROD, name: 'lightning_rod', displayName: 'Lightning Rod', textureId: TextureId.LIGHTNING_ROD,
      // 0 dark copper, 1 bright copper, 2 verdigris, 3 polished tip
      colors: [{ color: 0x8e4a26 }, { color: 0xc26b3c }, { color: 0x4fa38a }, { color: 0xf0b07a }],
      boxes: [
        { w: 0.42, h: 0.06, d: 0.42, x: 0, y: F, z: 0, m: 0 }, // base plate
        { w: 0.24, h: 0.06, d: 0.24, x: 0, y: F + 0.06, z: 0, m: 2 }, // patinated collar
        { w: 0.09, h: 0.74, d: 0.09, x: 0, y: F + 0.12, z: 0, m: 1 }, // the rod
        { w: 0.14, h: 0.03, d: 0.14, x: 0, y: F + 0.36, z: 0, m: 2 }, // bands
        { w: 0.14, h: 0.03, d: 0.14, x: 0, y: F + 0.64, z: 0, m: 2 },
        { w: 0.07, h: 0.05, d: 0.07, x: 0, y: F + 0.86, z: 0, m: 3 }, // tapering tip
        { w: 0.045, h: 0.05, d: 0.045, x: 0, y: F + 0.91, z: 0, m: 3 },
        { w: 0.022, h: 0.04, d: 0.022, x: 0, y: F + 0.96, z: 0, m: 3 },
      ],
      hardness: 2, force: 1, tags: [BlockTags.ROCK],
      collision: [0.4, 0, 0.4, 0.6, 1, 0.6],
      interaction: [0.29, 0, 0.29, 0.71, 1, 0.71],
    })
  }

  createBlockEntity(position: IWorldCoordinate, _world: IWorld): IBlockEntity {
    return new LightningRodBlockEntity(position)
  }
}
