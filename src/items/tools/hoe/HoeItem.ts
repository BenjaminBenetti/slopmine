import { ToolItem } from '../ToolItem.ts'
import type { IToolStats } from '../../interfaces/IToolStats.ts'
import { BlockTags } from '../../../world/blocks/tags/BlockTags.ts'

/**
 * Base class for all hoe variants. Right-click a grass or dirt top with a
 * hoe to till it into farmland (src/farming/); hoes also cut through leaves
 * quickly. Any tier tills - better hoes only mine and hit a little harder.
 */
export abstract class HoeItem extends ToolItem {
  /** Base damage per second - override in variants */
  protected abstract readonly baseDamage: number
  /** Tool tier (affects demolition force) - override in variants */
  protected abstract readonly tier: number

  get toolStats(): IToolStats {
    return {
      demolitionForce: this.tier,
      damage: this.baseDamage,
      damageMultipliers: new Map([[BlockTags.LEAVES, 6.0]]),
    }
  }
}
