import { ToolItem } from '../ToolItem.ts'
import type { IToolStats } from '../../interfaces/IToolStats.ts'
import { BlockTags } from '../../../world/blocks/tags/BlockTags.ts'

/**
 * Base class for all axe variants.
 * Axes get bonus damage on wood-tagged blocks.
 */
export abstract class AxeItem extends ToolItem {
  /** Base damage per second - override in variants */
  protected abstract readonly baseDamage: number
  /** Tool tier (affects demolition force) - override in variants */
  protected abstract readonly tier: number
  /** Damage multiplier vs wood blocks - override in variants */
  protected abstract readonly woodMultiplier: number

  get toolStats(): IToolStats {
    return {
      demolitionForce: this.tier,
      damage: this.baseDamage,
      damageMultipliers: new Map([[BlockTags.WOOD, this.woodMultiplier]]),
    }
  }
}
