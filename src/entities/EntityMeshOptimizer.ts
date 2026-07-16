import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/**
 * Scene-object reduction for entity models.
 *
 * Entities are built from dozens of tiny `THREE.Mesh` boxes. Every one of those
 * is an Object3D the renderer must compose a matrix for, frustum-test, and draw
 * (twice with shadows). Two transforms cut that cost without changing how an
 * entity looks or animates:
 *
 * 1. **Merge** — sibling leaf meshes that never move relative to their parent and
 *    share the same shadow flags collapse into a single vertex-colored mesh. Each
 *    box's original per-material color is baked into vertex colors, and one
 *    `vertexColors` MeshLambertMaterial reproduces the exact shading. Because the
 *    material starts white, the base-class light dimming (which scales
 *    `material.color`) multiplies through vertex colors identically to the
 *    unmerged meshes. Transparent, emissive, textured (`map`), double-sided, and
 *    non-Lambert meshes are left untouched so their distinct rendering survives.
 *
 * 2. **Freeze** — any node whose local transform is set once at build time gets
 *    `matrixAutoUpdate = false` after a single `updateMatrix()`, so the renderer
 *    stops recomposing its local matrix each frame. The entity root and every
 *    node listed as `dynamic` keep auto-update.
 *
 * The caller supplies the exact set of nodes it animates (`dynamic`); everything
 * else is treated as rigid. Merged geometry and materials are per-entity, so the
 * base `Entity.dispose()` traversal frees them normally.
 */
export interface OptimizeOptions {
  /**
   * Nodes whose local transform (position/rotation/scale) is mutated at runtime.
   * These are never merged and never frozen. Nullish entries are ignored so
   * callers can pass optional mesh-part references directly.
   */
  dynamic?: Iterable<THREE.Object3D | null | undefined>
  /**
   * Merge rigid sibling leaf meshes into consolidated vertex-colored meshes.
   * Leave false for entities whose materials are re-identified by color at
   * runtime (e.g. texture-map application keyed on `color === 0xffffff`), where
   * a white vertex-color material would be misclassified.
   */
  merge?: boolean
  /**
   * Invoked with each merged material so the entity can register it for
   * world-light dimming (the originals it replaced stay registered but unused).
   */
  registerForLighting?: (material: THREE.MeshLambertMaterial) => void
}

const _color = new THREE.Color()

/**
 * Reduce the scene-object and per-frame matrix cost of an entity model in place.
 */
export function optimizeEntityMesh(root: THREE.Object3D, options: OptimizeOptions = {}): void {
  const dynamic = new Set<THREE.Object3D>()
  if (options.dynamic) {
    for (const node of options.dynamic) {
      if (node) dynamic.add(node)
    }
  }

  if (options.merge) {
    const removed: THREE.Mesh[] = []
    mergeRigidLeaves(root, dynamic, options.registerForLighting, removed)
    // Merged source meshes are detached from the graph, so Entity.dispose()'s
    // scene-graph traversal never reaches them. Free their GPU resources here,
    // but only for geometries/materials no live node still references (materials
    // are frequently shared across a bucket or with non-merged/dynamic meshes).
    disposeOrphans(root, removed)
  }

  freezeStatic(root, dynamic)
}

/**
 * Dispose the GPU resources of removed source meshes that nothing in the final
 * graph still references. Geometries and materials shared with a surviving mesh
 * are left intact (three.js dispose would free buffers a live mesh still uses).
 */
function disposeOrphans(root: THREE.Object3D, removed: readonly THREE.Mesh[]): void {
  if (removed.length === 0) return

  const liveGeometries = new Set<THREE.BufferGeometry>()
  const liveMaterials = new Set<THREE.Material>()
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    if (mesh.geometry) liveGeometries.add(mesh.geometry)
    const material = mesh.material
    if (Array.isArray(material)) {
      for (const m of material) liveMaterials.add(m)
    } else if (material) {
      liveMaterials.add(material)
    }
  })

  for (const mesh of removed) {
    if (mesh.geometry && !liveGeometries.has(mesh.geometry)) {
      mesh.geometry.dispose()
    }
    const material = mesh.material
    if (Array.isArray(material)) {
      for (const m of material) {
        if (!liveMaterials.has(m)) m.dispose()
      }
    } else if (material && !liveMaterials.has(material)) {
      material.dispose()
    }
  }
}

/**
 * Depth-first merge of each parent's rigid, same-shadow, opaque leaf meshes.
 */
function mergeRigidLeaves(
  node: THREE.Object3D,
  dynamic: ReadonlySet<THREE.Object3D>,
  register: ((material: THREE.MeshLambertMaterial) => void) | undefined,
  removed: THREE.Mesh[]
): void {
  // Recurse first so animated sub-groups (legs, heads) get their own rigid
  // children merged in their local space before we look at this level.
  for (const child of node.children) {
    if (child.children.length > 0) {
      mergeRigidLeaves(child, dynamic, register, removed)
    }
  }

  // Bucket mergeable leaves by their shadow flags so castShadow/receiveShadow
  // are preserved exactly (one merged mesh can only carry a single flag pair).
  const buckets = new Map<string, THREE.Mesh[]>()
  for (const child of node.children) {
    if (!isMergeableLeaf(child, dynamic)) continue
    const key = `${child.castShadow ? 1 : 0}:${child.receiveShadow ? 1 : 0}`
    let bucket = buckets.get(key)
    if (!bucket) buckets.set(key, (bucket = []))
    bucket.push(child)
  }

  for (const meshes of buckets.values()) {
    if (meshes.length < 2) continue // nothing to gain from a single mesh
    const merged = buildMergedMesh(meshes, register)
    if (!merged) continue // attribute mismatch — leave the originals in place
    for (const mesh of meshes) {
      node.remove(mesh)
      removed.push(mesh)
    }
    node.add(merged)
  }
}

/**
 * A mesh is mergeable when merging cannot change its appearance: it is a leaf
 * with a single opaque, non-emissive, non-textured, front-side Lambert material
 * and is not animated.
 */
function isMergeableLeaf(obj: THREE.Object3D, dynamic: ReadonlySet<THREE.Object3D>): obj is THREE.Mesh {
  const mesh = obj as THREE.Mesh
  if (!mesh.isMesh) return false
  if (obj.children.length > 0) return false
  if (dynamic.has(obj)) return false

  const material = mesh.material
  if (Array.isArray(material)) return false
  const lambert = material as THREE.MeshLambertMaterial
  if (!lambert.isMeshLambertMaterial) return false
  if (lambert.transparent) return false
  if (lambert.side !== THREE.FrontSide) return false
  if (lambert.map || lambert.emissiveMap || lambert.alphaMap) return false
  if (lambert.emissive && (lambert.emissive.r > 0 || lambert.emissive.g > 0 || lambert.emissive.b > 0)) {
    return false
  }
  return true
}

/**
 * Bake each mesh's material color into vertex colors and its local transform
 * into vertex positions, then merge into one mesh sharing a white vertexColors
 * material. Returns null if the geometries cannot be merged.
 */
function buildMergedMesh(
  meshes: readonly THREE.Mesh[],
  register?: (material: THREE.MeshLambertMaterial) => void
): THREE.Mesh | null {
  const geometries: THREE.BufferGeometry[] = []
  for (const mesh of meshes) {
    const geometry = mesh.geometry.clone()

    // Vertex colors carry the box's base color (in the renderer's linear working
    // space, matching how material.color was stored from the source hex).
    _color.copy((mesh.material as THREE.MeshLambertMaterial).color)
    const vertexCount = geometry.attributes.position.count
    const colors = new Float32Array(vertexCount * 3)
    for (let i = 0; i < vertexCount; i++) {
      colors[i * 3] = _color.r
      colors[i * 3 + 1] = _color.g
      colors[i * 3 + 2] = _color.b
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    mesh.updateMatrix()
    geometry.applyMatrix4(mesh.matrix)
    geometries.push(geometry)
  }

  let merged: THREE.BufferGeometry | null = null
  try {
    merged = mergeGeometries(geometries, false)
  } catch {
    merged = null
  }
  for (const geometry of geometries) geometry.dispose()
  if (!merged) return null

  const material = new THREE.MeshLambertMaterial({ vertexColors: true })
  register?.(material)

  const mesh = new THREE.Mesh(merged, material)
  mesh.castShadow = meshes[0].castShadow
  mesh.receiveShadow = meshes[0].receiveShadow
  // Merged geometry is baked in parent-local space, so this mesh is rigid.
  mesh.matrixAutoUpdate = false
  mesh.updateMatrix()
  return mesh
}

/**
 * Freeze every rigid node: the local matrix is composed once and auto-update
 * disabled. The root (moved every frame) and animated nodes keep auto-update.
 * The renderer still refreshes world matrices because the moving root forces
 * the subtree each frame — only the redundant local recompose is skipped.
 */
function freezeStatic(root: THREE.Object3D, dynamic: ReadonlySet<THREE.Object3D>): void {
  root.traverse((obj) => {
    if (obj === root) return
    if (dynamic.has(obj)) return
    if (!obj.matrixAutoUpdate) return // already frozen (e.g. a merged mesh)
    obj.matrixAutoUpdate = false
    obj.updateMatrix()
  })
}
