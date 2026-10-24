import { Item } from '../../Item.ts'

/**
 * Spider silk - from cave spiders and the cobwebs of webbed hollows. A
 * fibre (ties rope and beds like hemp fibre).
 */
export class SpiderSilkItem extends Item {
  readonly id = 'spider_silk'
  readonly name = 'spider_silk'

  override get displayName(): string {
    return 'Spider Silk'
  }

  override get iconUrl(): string {
    return new URL('./assets/spider-silk-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'fiber']
  }
}
