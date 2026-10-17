import type { IBlockProperties, IWorld } from '../../../interfaces/IBlock.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { RoseCrystalBlock } from '../rose_crystal/RoseCrystalBlock.ts'
import { CRYSTAL_CORE_TICK_INTERVAL, exposeCrystalCore } from './crystalCore.ts'

/** Rose crystal buried inside a spire: same look and drop, no light emission (see crystalCore.ts). */
export class RoseCrystalCoreBlock extends RoseCrystalBlock {
  override readonly properties: IBlockProperties = {
    id: BlockIds.ROSE_CRYSTAL_CORE,
    name: 'rose_crystal_core',
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
    return exposeCrystalCore(world, x, y, z, BlockIds.ROSE_CRYSTAL)
  }
}
