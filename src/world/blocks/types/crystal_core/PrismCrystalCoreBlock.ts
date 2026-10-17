import type { IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { PrismCrystalBlock } from '../prism_crystal/PrismCrystalBlock.ts'
import { CRYSTAL_CORE_TICK_INTERVAL, exposeCrystalCore } from './crystalCore.ts'

/**
 * Prism crystal buried inside a spire or geode lining: same look and shard
 * drop, no light emission (see crystalCore.ts). Usually becomes a plain
 * prism_crystal (the journal's mining target) the moment it is dug free.
 */
export class PrismCrystalCoreBlock extends PrismCrystalBlock {
  override readonly properties: IBlockProperties = {
    id: BlockIds.PRISM_CRYSTAL_CORE,
    name: 'prism_crystal_core',
    isOpaque: true,
    isSolid: true,
    isLiquid: false,
    hardness: 20.0,
    lightLevel: 0,
    lightBlocking: 15,
    demolitionForceRequired: 5,
    tags: [BlockTags.ROCK],
    tickInterval: CRYSTAL_CORE_TICK_INTERVAL,
  }

  onScheduledTick(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    return exposeCrystalCore(world, x, y, z, BlockIds.PRISM_CRYSTAL)
  }
}
