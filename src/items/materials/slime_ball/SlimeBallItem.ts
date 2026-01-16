import { Item } from '../../Item.ts'

/**
 * Slime ball item dropped by slugs.
 * A slimy green ball that can be used as a crafting material.
 */
export class SlimeBallItem extends Item {
  readonly id = 'slime_ball'
  readonly name = 'slime_ball'

  override get displayName(): string {
    return 'Slime Ball'
  }

  override get iconUrl(): string {
    return new URL('./assets/slime-ball-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'slime']
  }
}
