import { CHUNK_VERTEX_STRIDE } from '../../renderer/ChunkVertexFormat.ts'

/** One mesh's worth of packed vertices + indices (see ChunkVertexFormat.ts). */
export interface MeshGroup {
  vertices: Uint8Array
  indices: Uint16Array | Uint32Array
}

/**
 * Growable scratch buffers for one chunk mesh group. Reused across jobs (no
 * per-quad allocation); finish() copies the used range into exact-size arrays
 * that can be transferred to the main thread.
 */
export class ChunkGeometryWriter {
  private vertices: Uint8Array
  private indices: Uint32Array
  private vertexCount = 0
  private indexCount = 0

  constructor(initialQuads: number = 4096) {
    this.vertices = new Uint8Array(initialQuads * 4 * CHUNK_VERTEX_STRIDE)
    this.indices = new Uint32Array(initialQuads * 6)
  }

  reset(): void {
    this.vertexCount = 0
    this.indexCount = 0
  }

  /**
   * Reserve room for one quad (4 vertices, 6 indices).
   * @returns Index of the quad's first vertex
   */
  beginQuad(): number {
    const neededBytes = (this.vertexCount + 4) * CHUNK_VERTEX_STRIDE
    if (neededBytes > this.vertices.length) {
      const grown = new Uint8Array(this.vertices.length * 2)
      grown.set(this.vertices)
      this.vertices = grown
      const grownIndices = new Uint32Array(this.indices.length * 2)
      grownIndices.set(this.indices)
      this.indices = grownIndices
    }
    return this.vertexCount
  }

  /** Append one vertex; the caller must have reserved space via beginQuad(). */
  pushVertex(
    x: number, y: number, z: number,
    u: number, v: number, layer: number, face: number,
    sky: number, block: number, ao: number, corner: number, wet = 0
  ): void {
    const vertices = this.vertices
    const o = this.vertexCount * CHUNK_VERTEX_STRIDE
    vertices[o] = x
    vertices[o + 1] = y
    vertices[o + 2] = z
    vertices[o + 3] = wet
    vertices[o + 4] = u
    vertices[o + 5] = v
    vertices[o + 6] = layer
    vertices[o + 7] = face
    vertices[o + 8] = sky
    vertices[o + 9] = block
    vertices[o + 10] = ao
    vertices[o + 11] = corner
    this.vertexCount++
  }

  /** Append the two triangles of a quad as offsets from its first vertex. */
  pushQuadIndices(base: number, a: number, b: number, c: number, d: number, e: number, f: number): void {
    const indices = this.indices
    const i = this.indexCount
    indices[i] = base + a
    indices[i + 1] = base + b
    indices[i + 2] = base + c
    indices[i + 3] = base + d
    indices[i + 4] = base + e
    indices[i + 5] = base + f
    this.indexCount += 6
  }

  /** Copy the written geometry out, or null when nothing was written. */
  finish(): MeshGroup | null {
    if (this.vertexCount === 0) return null
    const vertices = this.vertices.slice(0, this.vertexCount * CHUNK_VERTEX_STRIDE)
    const used = this.indices.subarray(0, this.indexCount)
    const indices = this.vertexCount <= 65536 ? Uint16Array.from(used) : used.slice()
    return { vertices, indices }
  }
}
