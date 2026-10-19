import type { IGrowableBlock, IWorld } from '../../../interfaces/IBlock.ts'
import { BlockIds } from '../../BlockIds.ts'
import { getBlock } from '../../BlockRegistry.ts'
import { FoliageBlock } from '../foliage_shared/FoliageBlock.ts'
import { OakTree, type TreeParams } from '../../../generate/structures/OakTree.ts'
import type { IDecorationWorld } from '../../../generate/IDecorationWorld.ts'
import { RANDOM_TICK_INTERVAL } from '../../../blocktick/RandomBlockTicks.ts'
import oakSaplingUrl from './assets/oak_sapling.webp'

/** Average seconds before a sapling tries to grow. */
const GROW_SECONDS = 160

/** Bone meal grows the tree at once this often (else nothing happens). */
const BONE_MEAL_CHANCE = 0.45

const GROUND = [BlockIds.GRASS, BlockIds.DIRT, BlockIds.PODZOL]

/** Cells a growing trunk may take over: air, plants, leaves. */
function isGrowRoom(id: number): boolean {
  if (id === BlockIds.AIR || id === BlockIds.OAK_SAPLING || id === BlockIds.OAK_LEAVES) return true
  return getBlock(id).properties.replaceable === true
}

/**
 * Oak sapling - dropped now and then by oak leaves (mined or decayed). On
 * grass, dirt or podzol it grows into an oak tree after a few minutes
 * (random ticks; bone meal may grow it at once), once there is room for the
 * trunk. The grown tree is an ordinary wild oak: it can be felled and its
 * leaves decay.
 */
export class OakSaplingBlock extends FoliageBlock implements IGrowableBlock {
  constructor() {
    super({
      id: BlockIds.OAK_SAPLING,
      name: 'oak_sapling',
      displayName: 'Oak Sapling',
      foliage: {
        sprites: [oakSaplingUrl],
        shape: 'cross',
        width: 0.85,
        height: 0.85,
        sway: 0.4,
        jitter: 0.05,
        scaleVariation: 0.1,
        viewDistance: 96,
      },
      ground: GROUND,
      replaceable: false,
    })
  }

  onRandomTick(world: IWorld, x: bigint, y: bigint, z: bigint): void {
    if (Math.random() < RANDOM_TICK_INTERVAL / GROW_SECONDS) this.tryGrowTree(world, x, y, z)
  }

  grow(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    if (Math.random() < BONE_MEAL_CHANCE) this.tryGrowTree(world, x, y, z)
    return true
  }

  private tryGrowTree(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    if (!GROUND.includes(world.getBlock(x, y - 1n, z).properties.id)) return false
    const params: TreeParams = {
      trunkHeight: 4 + Math.floor(Math.random() * 3),
      leafRadius: 2 + Math.floor(Math.random() * 2),
    }
    for (let dy = 0; dy <= params.trunkHeight; dy++) {
      if (!isGrowRoom(world.getBlock(x, y + BigInt(dy), z).properties.id)) return false
    }
    const writer: IDecorationWorld = {
      getBlockId: (bx, by, bz) => world.getBlock(bx, by, bz).properties.id,
      setBlock: (bx, by, bz, id, metadata) => world.setBlock(bx, by, bz, id, metadata),
    }
    OakTree.place(writer, x, y, z, params)
    return true
  }
}
