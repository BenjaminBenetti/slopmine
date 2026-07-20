import { Item } from '../../Item.ts'

/**
 * A pinecone gathered from beneath pine canopies.
 * Craftable into a pine sapling to regrow felled forests.
 */
export class PineconeItem extends Item {
  readonly id = 'pinecone'
  readonly name = 'pinecone'

  override get displayName(): string {
    return 'Pinecone'
  }

  override get iconUrl(): string {
    return new URL('./assets/pinecone-icon.webp', import.meta.url).href
  }

  override get tags(): ReadonlyArray<string> {
    return ['material']
  }
}
