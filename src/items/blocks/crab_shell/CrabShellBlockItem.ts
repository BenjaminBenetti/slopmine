import { BlockItem } from '../../BlockItem.ts'

export class CrabShellBlockItem extends BlockItem {
  readonly id = 'crab_shell_block'
  readonly name = 'crab_shell_block'
  readonly blockName = 'crab_shell'

  override get displayName(): string {
    return 'Crab Shell'
  }

  // Keep the hand-drawn icon rather than the auto-rendered block preview
  override get iconUrl(): string {
    return new URL('./assets/crab-shell-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material', 'shell']
  }
}
