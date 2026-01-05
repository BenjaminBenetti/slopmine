import { ToolItem } from '../ToolItem.ts'
import type { IToolStats } from '../../interfaces/IToolStats.ts'
import { BlockTags } from '../../../world/blocks/tags/BlockTags.ts'

/**
 * Base class for all axe variants.
 * Axes get 2x damage on wood-tagged blocks.
 */
export abstract class AxeItem extends ToolItem {
  /** Base damage per second - override in variants */
  protected abstract readonly baseDamage: number
  /** Tool tier (affects demolition force) - override in variants */
  protected abstract readonly tier: number

  get toolStats(): IToolStats {
    return {
      demolitionForce: this.tier,
      damage: this.baseDamage,
      damageMultipliers: new Map([[BlockTags.WOOD, 4.0]]),
    }
  }
}
