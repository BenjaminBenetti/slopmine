import { Item } from '../../Item.ts'

export class BreadItem extends Item {
  readonly id = 'bread'
  readonly name = 'bread'

  override get displayName(): string {
    return 'Bread'
  }

  override get iconUrl(): string {
    return new URL('./assets/bread-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['food']
  }
}
