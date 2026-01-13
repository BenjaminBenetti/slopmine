import { ToolItem } from '../ToolItem.ts'
import type { IToolStats } from '../../interfaces/IToolStats.ts'
import { BlockTags } from '../../../world/blocks/tags/BlockTags.ts'

/**
 * Base class for all shovel variants.
 * Shovels get bonus damage on soil-tagged blocks.
 */
export abstract class ShovelItem extends ToolItem {
  /** Base damage per second - override in variants */
  protected abstract readonly baseDamage: number
  /** Tool tier (affects demolition force) - override in variants */
  protected abstract readonly tier: number
  /** Damage multiplier vs soil blocks - override in variants */
  protected abstract readonly soilMultiplier: number

  get toolStats(): IToolStats {
    return {
      demolitionForce: this.tier,
      damage: this.baseDamage,
      damageMultipliers: new Map([[BlockTags.SOIL, this.soilMultiplier]]),
    }
  }
}
