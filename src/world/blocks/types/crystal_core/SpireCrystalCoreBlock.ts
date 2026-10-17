import type { IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { SpireCrystalBlock } from '../spire_crystal/SpireCrystalBlock.ts'
import { CRYSTAL_CORE_TICK_INTERVAL, exposeCrystalCore } from './crystalCore.ts'

/** Spire crystal buried inside a spire: same look and drop, no light emission (see crystalCore.ts). */
export class SpireCrystalCoreBlock extends SpireCrystalBlock {
  override readonly properties: IBlockProperties = {
    id: BlockIds.SPIRE_CRYSTAL_CORE,
    name: 'spire_crystal_core',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 8.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 3,
    tags: [BlockTags.ROCK],
    tickInterval: CRYSTAL_CORE_TICK_INTERVAL,
  }

  onScheduledTick(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    return exposeCrystalCore(world, x, y, z, BlockIds.SPIRE_CRYSTAL)
  }
}
