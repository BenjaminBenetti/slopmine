import * as THREE from 'three'

/** A world material to compile before play starts, with the mesh flags it is drawn with. */
export interface WarmupMaterial {
  readonly material: THREE.Material
  /** Shadow-pass material the real meshes use (e.g. alpha-tested leaves). */
  readonly customDepthMaterial?: THREE.Material
}

/**
 * Compile (and link) the programs of world materials that may not be on
 * screen yet when loading ends - e.g. the leaf (cutout) chunk material at a
 * spawn with no trees in view - so the first time they appear doesn't stall
 * the game for a synchronous program link (tens to hundreds of ms on ANGLE /
 * D3D, over a second under SwiftShader).
 *
 * Program variants depend on the scene (lights, fog, shadows) and the mesh
 * (receive/cast shadow), so each material is drawn once on a degenerate
 * (zero-area) triangle in the real scene with the flags chunk meshes use:
 * where the driver compiles in parallel, compileAsync lets it finish off the
 * main thread first; one render then makes three.js take each program into
 * use (the synchronous link wait happens here, behind the loading screen).
 * Changing the shadow setting later compiles its own variants on demand.
 */
export async function warmUpWorldShaders(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  materials: readonly WarmupMaterial[]
): Promise<void> {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3))
  const meshes = materials.map(({ material, customDepthMaterial }) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    mesh.castShadow = true
    mesh.receiveShadow = true
    if (customDepthMaterial) mesh.customDepthMaterial = customDepthMaterial
    scene.add(mesh)
    return mesh
  })
  try {
    // Without parallel compilation the render below compiles synchronously
    // (compileAsync would only warn and do the same)
    if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera)
    renderer.render(scene, camera)
  } finally {
    for (const mesh of meshes) scene.remove(mesh)
    geometry.dispose()
  }
}
