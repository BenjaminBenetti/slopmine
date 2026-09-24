import * as THREE from 'three'

/** Probe render target size: a 2-texel texture magnified 8× across 16 pixels. */
const PROBE_WIDTH = 16
const PROBE_HEIGHT = 2

/** A probe pixel is "blended" when it lies this far inside the black-white range. */
const BLEND_MARGIN = 8

const PROBE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`

const PROBE_FRAGMENT = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D( map, vUv );
}
`

/**
 * Does this GPU backend keep NEAREST magnification pixel-crisp when a
 * texture's max anisotropy is `anisotropy`?
 *
 * Not everywhere: ANGLE's Direct3D 11 backend (Windows) and SwiftShader turn
 * an anisotropic sampler into a filter that interpolates magnified texels
 * too, ignoring GL's NEAREST mag filter - three.js therefore never applies
 * anisotropy to NEAREST-magnified textures. This renders a black|white
 * 2-texel texture (NEAREST magnification, mipmapped NEAREST minification like
 * block textures, anisotropy set directly on the GL texture) magnified 8×
 * into a small render target and checks every pixel is still pure black or
 * white. One tiny off-screen draw; call once at startup.
 */
export function nearestMagnificationSurvivesAnisotropy(renderer: THREE.WebGLRenderer, anisotropy: number): boolean {
  if (!renderer.extensions.has('EXT_texture_filter_anisotropic')) return true
  const extension = renderer.extensions.get('EXT_texture_filter_anisotropic')
  const gl = renderer.getContext()

  const texture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]), 2, 1)
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestMipmapLinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  // Runs right after the upload, while the texture is bound
  texture.onUpdate = () => gl.texParameterf(gl.TEXTURE_2D, extension.TEXTURE_MAX_ANISOTROPY_EXT, anisotropy)

  const geometry = new THREE.PlaneGeometry(2, 2)
  const material = new THREE.ShaderMaterial({
    uniforms: { map: { value: texture } },
    vertexShader: PROBE_VERTEX,
    fragmentShader: PROBE_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  const scene = new THREE.Scene()
  scene.add(mesh)
  const camera = new THREE.OrthographicCamera()
  const target = new THREE.WebGLRenderTarget(PROBE_WIDTH, PROBE_HEIGHT, { depthBuffer: false })
  const pixels = new Uint8Array(PROBE_WIDTH * PROBE_HEIGHT * 4)

  const previousTarget = renderer.getRenderTarget()
  try {
    renderer.setRenderTarget(target)
    renderer.render(scene, camera)
    renderer.readRenderTargetPixels(target, 0, 0, PROBE_WIDTH, PROBE_HEIGHT, pixels)
  } finally {
    renderer.setRenderTarget(previousTarget)
    target.dispose()
    material.dispose()
    geometry.dispose()
    texture.dispose()
  }

  // Crisp: the left half black, the right half white, nothing in between
  for (let i = 0; i < pixels.length; i += 4) {
    const value = pixels[i]
    if (value > BLEND_MARGIN && value < 255 - BLEND_MARGIN) return false
  }
  return pixels[0] <= BLEND_MARGIN && pixels[(PROBE_WIDTH - 1) * 4] >= 255 - BLEND_MARGIN
}
