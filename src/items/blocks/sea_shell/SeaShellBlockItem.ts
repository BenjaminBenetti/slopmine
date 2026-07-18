import { BlockItem } from '../../BlockItem.ts'

export class SeaShellBlockItem extends BlockItem {
  readonly id = 'sea_shell_block'
  readonly name = 'sea_shell_block'
  readonly blockName = 'sea_shell'

  override get displayName(): string {
    return 'Sea Shell'
  }

  // Keep the hand-drawn icon rather than the auto-rendered block preview
  override get iconUrl(): string {
    return new URL('./assets/sea-shell-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'shell']
  }
}
