import type { BlockId, IGrowableBlock, IWorld } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { BlockIds } from '../../BlockIds.ts'
import { FoliageBlock } from '../foliage_shared/FoliageBlock.ts'
import { RANDOM_TICK_INTERVAL } from '../../../blocktick/RandomBlockTicks.ts'
import { BlueberrySeedsItem } from '../../../../items/materials/blueberry_seeds/BlueberrySeedsItem.ts'
import { PricklyPearSeedsItem } from '../../../../items/materials/prickly_pear_seeds/PricklyPearSeedsItem.ts'
import { PineappleSeedsItem } from '../../../../items/materials/pineapple_seeds/PineappleSeedsItem.ts'
import { AloeSeedsItem } from '../../../../items/materials/aloe_seeds/AloeSeedsItem.ts'
import { BerrySeedsItem } from '../../../../items/materials/berry_seeds/BerrySeedsItem.ts'
import blueberry1Url from './assets/blueberry_bush_1.webp'
import blueberry2Url from './assets/blueberry_bush_2.webp'
import pricklyPear1Url from './assets/prickly_pear_1.webp'
import pricklyPear2Url from './assets/prickly_pear_2.webp'
import pineapple1Url from './assets/pineapple_plant_1.webp'
import pineapple2Url from './assets/pineapple_plant_2.webp'
import aloe1Url from './assets/aloe_1.webp'
import aloe2Url from './assets/aloe_2.webp'
import berry1Url from './assets/berry_bush_1.webp'
import berry2Url from './assets/berry_bush_2.webp'

/**
 * The young stages of a wild food plant grown from seeds (blueberry, prickly
 * pear, pineapple, aloe, berry bush): `<name>_1`, `<name>_2`, then the grown
 * plant `mature` - a forage bush that fruits and regrows, or the aloe.
 */
export interface SproutLine {
  readonly name: string
  readonly displayName: string
  readonly stages: readonly [{ id: BlockId; sprite: string; height: number }, { id: BlockId; sprite: string; height: number }]
  readonly mature: BlockId
  /** Seconds per stage on moist farmland, on average. */
  readonly stageSeconds: number
  readonly seed: () => IItem
}

export const SPROUT_LINES: readonly SproutLine[] = [
  {
    name: 'blueberry_bush', displayName: 'Blueberry Bush', mature: BlockIds.BLUEBERRY_BUSH, stageSeconds: 120,
    stages: [{ id: BlockIds.BLUEBERRY_BUSH_1, sprite: blueberry1Url, height: 0.3 }, { id: BlockIds.BLUEBERRY_BUSH_2, sprite: blueberry2Url, height: 0.45 }],
    seed: () => new BlueberrySeedsItem(),
  },
  {
    name: 'prickly_pear', displayName: 'Prickly Pear', mature: BlockIds.PRICKLY_PEAR, stageSeconds: 150,
    stages: [{ id: BlockIds.PRICKLY_PEAR_1, sprite: pricklyPear1Url, height: 0.35 }, { id: BlockIds.PRICKLY_PEAR_2, sprite: pricklyPear2Url, height: 0.6 }],
    seed: () => new PricklyPearSeedsItem(),
  },
  {
    name: 'pineapple_plant', displayName: 'Pineapple Plant', mature: BlockIds.PINEAPPLE_PLANT, stageSeconds: 160,
    stages: [{ id: BlockIds.PINEAPPLE_PLANT_1, sprite: pineapple1Url, height: 0.3 }, { id: BlockIds.PINEAPPLE_PLANT_2, sprite: pineapple2Url, height: 0.5 }],
    seed: () => new PineappleSeedsItem(),
  },
  {
    name: 'aloe', displayName: 'Aloe', mature: BlockIds.ALOE, stageSeconds: 130,
    stages: [{ id: BlockIds.ALOE_1, sprite: aloe1Url, height: 0.3 }, { id: BlockIds.ALOE_2, sprite: aloe2Url, height: 0.45 }],
    seed: () => new AloeSeedsItem(),
  },
  {
    name: 'berry_bush', displayName: 'Berry Bush', mature: BlockIds.BERRY_BUSH, stageSeconds: 120,
    stages: [{ id: BlockIds.BERRY_BUSH_1, sprite: berry1Url, height: 0.35 }, { id: BlockIds.BERRY_BUSH_2, sprite: berry2Url, height: 0.55 }],
    seed: () => new BerrySeedsItem(),
  },
]

const SOIL_GROWTH: ReadonlyMap<BlockId, number> = new Map([
  [BlockIds.FARMLAND_MOIST, 1.0],
  [BlockIds.FARMLAND, 0.6],
])
const WILD_GROWTH = 0.35

/**
 * A young wild food plant planted from its seeds: placed only on farmland,
 * grown a stage at a time by random ticks (fastest on moist farmland) and
 * bone meal, until it becomes the grown plant (SproutLine.mature). Breaking
 * it gives the seed back.
 */
export class ForageSproutBlock extends FoliageBlock implements IGrowableBlock {
  private readonly next: BlockId

  constructor(private readonly line: SproutLine, stage: 0 | 1) {
    const s = line.stages[stage]
    super({
      id: s.id,
      name: `${line.name}_${stage + 1}`,
      displayName: line.displayName,
      foliage: {
        sprites: [s.sprite],
        shape: 'cross',
        width: 0.9,
        height: s.height,
        sway: 0.25,
        jitter: 0.06,
        scaleVariation: 0.08,
        viewDistance: 80,
      },
      tags: ['crop'],
      replaceable: false,
      drops: () => [line.seed()],
    })
    this.next = stage === 0 ? line.stages[1].id : line.mature
  }

  canPlace(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    const here = world.getBlock(x, y, z).properties
    if (here.id !== 0 && !here.replaceable) return false
    return SOIL_GROWTH.has(world.getBlock(x, y - 1n, z).properties.id)
  }

  onRandomTick(world: IWorld, x: bigint, y: bigint, z: bigint): void {
    const soil = SOIL_GROWTH.get(world.getBlock(x, y - 1n, z).properties.id) ?? WILD_GROWTH
    if (Math.random() < (RANDOM_TICK_INTERVAL / this.line.stageSeconds) * soil) world.setBlock(x, y, z, this.next)
  }

  grow(world: IWorld, x: bigint, y: bigint, z: bigint): boolean {
    world.setBlock(x, y, z, this.next)
    return true
  }
}

/** Both young stages of every seed-grown wild food plant. */
export function createForageSproutBlocks(): ForageSproutBlock[] {
  return SPROUT_LINES.flatMap((line) => [new ForageSproutBlock(line, 0), new ForageSproutBlock(line, 1)])
}
