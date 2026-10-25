import * as THREE from 'three'
import { PARTICLE_KINDS, PARTICLE_KIND_COUNT, PARTICLE_KIND_INDEX } from '../../weather/ParticleKinds.ts'
import { SHELTER_SIZE, type ShelterMap } from './ShelterMap.ts'

/**
 * Everything weather puts in the air - rain, snow, sand, ash, embers,
 * pollen, wisps... - as ONE instanced draw of PARTICLE_COUNT camera-facing
 * quads in a box around the camera (world-anchored and wrapped, so walking
 * through the rain never drags it along). Each particle picks its kind from
 * the live mix by its seed (a mix near a snow line is sleet), and the shader
 * moves it - falling, carried by the wind, fluttering, tumbling - and hides it
 * below its column's floor (ShelterMap: roofs, canopies, caves). A second
 * draw puts splashes on the floor where rain lands.
 *
 * The CPU only sets uniforms each frame (densities, wind, light).
 */

export const PARTICLE_COUNT = 16000
const SPLASH_COUNT = 1800
/** The particle box around the camera (blocks): width/depth, and how far above and below the camera. */
const BOX_WIDTH = 64
export const BOX_UP = 26
const BOX_DOWN = 22
/** Splashes land within this radius of the camera. */
const SPLASH_RADIUS = 22
/** Horizontal speed of a particle that fully rides a full gale (blocks/s). */
const GALE_SPEED = 16
/** Wind offsets wrap at this (a common multiple of every kind's windFollow × box width, all multiples of 0.05). */
const WIND_WRAP = BOX_WIDTH * 20
/** The particle clock wraps (a jump nobody can see in a random field). */
const TIME_WRAP = 600
/** Dust devils drawn at most at once (the 'devil' particle kind orbits them). */
export const MAX_DEVILS = 4

const DEVIL_KIND = PARTICLE_KIND_INDEX.devil

const VERTEX_SHADER = /* glsl */ `
#define KINDS ${PARTICLE_KIND_COUNT}
attribute vec2 corner;
attribute vec4 aSeed;
attribute vec4 aSeed2;
uniform float uTime;
uniform vec3 uCamera;
uniform vec3 uBox;
uniform float uBoxMinY;
uniform float uBoxMaxY;
uniform vec2 uWindOffset;
uniform vec2 uWindVel;
uniform sampler2D uShelter;
uniform vec3 uKindA[ KINDS ];
uniform vec3 uKindB[ KINDS ];
uniform vec4 uKindP[ KINDS ];
uniform vec4 uKindQ[ KINDS ];
uniform float uKindCdf[ KINDS ];
uniform float uActive;
uniform vec3 uLight;
uniform float uPixelSize;
uniform vec4 uDevils[ ${MAX_DEVILS} ];
varying vec4 vColor;
varying vec2 vCorner;
varying float vShape;
#include <fog_pars_vertex>

void collapse() {
  gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
  vColor = vec4( 0.0 );
}

void main() {
  vCorner = corner;
  vShape = 0.0;
  if ( aSeed.w >= uActive ) { collapse(); return; }
  float pick = aSeed2.x * uKindCdf[ KINDS - 1 ];
  int kind = KINDS - 1;
  for ( int i = 0; i < KINDS; i++ ) {
    if ( pick < uKindCdf[ i ] ) { kind = i; break; }
  }
  vec4 P = uKindP[ kind ];
  vec4 Q = uKindQ[ kind ];
  float size = P.x * ( 0.75 + 0.5 * aSeed2.y );
  float fall = P.z * ( 0.85 + 0.3 * aSeed2.y );
  float follow = P.w;
  float flutter = Q.x;
  float ph = aSeed2.z * 6.2832;
  float edgeFade = 1.0;
  vec3 pos;
  if ( kind == ${DEVIL_KIND} ) {
    // Orbit one of the dust devils: a funnel, wider and slower toward the top
    vec4 devil = uDevils[ int( aSeed.x * ${MAX_DEVILS}.0 ) ];
    if ( devil.w <= 0.0 ) { collapse(); return; }
    float h = aSeed.y;
    float angle = aSeed.z * 6.2832 + uTime * ( 5.0 - 3.0 * h ) * ( 0.8 + 0.4 * aSeed2.w );
    float radius = 0.35 + 2.6 * h * h + 0.25 * sin( uTime * 2.0 + ph );
    pos = vec3( devil.x + cos( angle ) * radius, devil.z + h * 15.0, devil.y + sin( angle ) * radius );
    edgeFade = devil.w * ( 1.0 - smoothstep( 0.75, 1.0, h ) );
  } else {
    vec3 tile = aSeed.xyz * uBox;
    tile.y -= uTime * fall;
    tile.xz += uWindOffset * follow;
    tile.x += sin( uTime * ( 0.7 + aSeed2.w ) + ph ) * flutter;
    tile.z += cos( uTime * ( 0.6 + aSeed2.y ) + ph * 1.3 ) * flutter;
    tile.y += sin( uTime * 0.9 + ph * 2.1 ) * flutter * 0.3;
    vec3 boxMin = vec3( uCamera.x - uBox.x * 0.5, uBoxMinY, uCamera.z - uBox.z * 0.5 );
    pos = boxMin + mod( tile - boxMin, uBox );
    float across = length( pos.xz - uCamera.xz ) / ( uBox.x * 0.5 );
    edgeFade = ( 1.0 - smoothstep( 0.72, 1.0, across ) ) * ( 1.0 - smoothstep( uBoxMaxY - 5.0, uBoxMaxY, pos.y ) );
    // Nothing falls below its column's floor (roofs, canopies, the ground, caves)
    float floorY = texture2D( uShelter, ( floor( pos.xz ) + 0.5 ) / ${SHELTER_SIZE}.0 ).r;
    if ( pos.y < floorY ) { collapse(); return; }
    edgeFade *= smoothstep( floorY, floorY + 0.25, pos.y );
  }

  vec3 vel = vec3( uWindVel.x * follow, -fall, uWindVel.y * follow );
  vec3 toCam = uCamera - pos;
  float dist = length( toCam );
  toCam /= max( dist, 1e-3 );
  float shape = Q.w;
  vShape = shape;
  // Flakes and chips right at the eye would fill the screen: they fade out instead (streaks stay thin)
  if ( shape > 0.5 ) edgeFade *= smoothstep( 1.0, 3.0, dist );
  // Never thinner than about a pixel and a half: thin drops would shimmer in and out (fainter instead)
  float minWidth = dist * uPixelSize * 1.5;
  float alphaScale = 1.0;
  if ( size < minWidth ) {
    alphaScale = sqrt( size / minWidth );
    size = minWidth;
  }
  vec3 world;
  if ( shape < 0.5 ) {
    // Streak along its motion, trailing behind
    vec3 axis = normalize( vel + vec3( 0.0, -0.001, 0.0 ) );
    vec3 side = normalize( cross( axis, toCam ) );
    float len = max( P.y, size );
    world = pos + side * corner.x * size * 0.5 - axis * corner.y * len;
  } else if ( shape > 2.5 ) {
    // A tumbling chip
    float spin = uTime * ( 1.5 + 3.0 * aSeed2.w ) + ph;
    vec3 u = vec3( cos( spin ), sin( spin * 0.7 ) * 0.6, sin( spin ) );
    vec3 v = normalize( cross( u, vec3( sin( spin * 1.3 ), 1.0, cos( spin * 0.9 ) ) ) );
    world = pos + ( normalize( u ) * corner.x + v * ( corner.y * 2.0 - 1.0 ) ) * size * 0.5;
  } else {
    // A camera-facing flake, mote or glint
    vec3 right = normalize( cross( vec3( 0.0, 1.0, 0.0 ), toCam ) + vec3( 1e-4, 0.0, 0.0 ) );
    vec3 up = cross( toCam, right );
    float twinkle = shape > 1.5 ? 0.4 + 0.6 * pow( 0.5 + 0.5 * sin( uTime * ( 3.0 + 5.0 * aSeed2.w ) + ph * 3.0 ), 4.0 ) : 1.0;
    world = pos + ( right * corner.x + up * ( corner.y * 2.0 - 1.0 ) ) * size * 0.5 * twinkle;
  }

  vec3 base = mix( uKindA[ kind ], uKindB[ kind ], aSeed2.y );
  float glow = Q.z;
  vColor = vec4( base * mix( uLight, vec3( 1.0 ), glow ), Q.y * edgeFade * alphaScale );
  vec4 mvPosition = viewMatrix * vec4( world, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`

const FRAGMENT_SHADER = /* glsl */ `
varying vec4 vColor;
varying vec2 vCorner;
varying float vShape;
#include <fog_pars_fragment>

void main() {
  float a;
  if ( vShape < 0.5 ) {
    // Streak: soft across, brightest at the head, fading along the tail
    a = ( 1.0 - vCorner.x * vCorner.x ) * ( 1.0 - vCorner.y * 0.75 );
  } else if ( vShape < 1.5 ) {
    float d = length( vec2( vCorner.x, vCorner.y * 2.0 - 1.0 ) );
    a = 1.0 - smoothstep( 0.45, 1.0, d );
  } else if ( vShape < 2.5 ) {
    // A four-pointed glint
    vec2 c = vec2( vCorner.x, vCorner.y * 2.0 - 1.0 );
    float star = max( ( 1.0 - smoothstep( 0.0, 0.18, abs( c.x ) ) ) * ( 1.0 - abs( c.y ) ), ( 1.0 - smoothstep( 0.0, 0.18, abs( c.y ) ) ) * ( 1.0 - abs( c.x ) ) );
    a = max( star, 1.0 - smoothstep( 0.0, 0.35, length( c ) ) );
  } else {
    a = 1.0;
  }
  a *= vColor.a;
  if ( a < 0.02 ) discard;
  gl_FragColor = vec4( vColor.rgb, a );
  #include <fog_fragment>
  #include <colorspace_fragment>
}
`

const SPLASH_VERTEX = /* glsl */ `
attribute vec2 corner;
attribute vec4 aSplash;
uniform float uTime;
uniform vec3 uCamera;
uniform float uBoxMaxY;
uniform sampler2D uShelter;
uniform float uSplashDensity;
uniform float uSplashSize;
varying vec2 vUv;
varying float vLife;
varying float vFade;
#include <fog_pars_vertex>

float hash( vec2 p ) {
  p = fract( p * vec2( 123.34, 456.21 ) );
  p += dot( p, p + 45.32 );
  return fract( p.x * p.y );
}

void main() {
  vUv = corner;
  vLife = 0.0;
  vFade = 0.0;
  if ( aSplash.w >= uSplashDensity ) { gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); return; }
  float period = 0.45 + 0.35 * aSplash.z;
  float clock = uTime / period + aSplash.z * 7.0;
  float cycle = floor( clock );
  float life = clock - cycle;
  // Each cycle lands somewhere new in a world-anchored tile around the camera (wrapped like the drops),
  // so a splash stays where it fell while the player moves
  const float span = ${SPLASH_RADIUS * 2}.0;
  vec2 tile = vec2( hash( vec2( cycle, aSplash.x * 97.0 ) ), hash( vec2( aSplash.y * 61.0, cycle ) ) ) * span;
  vec2 boxMin = uCamera.xz - span * 0.5;
  vec2 xz = boxMin + mod( tile - boxMin, span );
  // Round, and faded before the tile's wrapping edge
  float r = length( xz - uCamera.xz );
  if ( r > ${SPLASH_RADIUS}.0 ) { gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); return; }
  vFade = 1.0 - smoothstep( ${SPLASH_RADIUS - 4}.0, ${SPLASH_RADIUS}.0, r );
  float floorY = texture2D( uShelter, ( floor( xz ) + 0.5 ) / ${SHELTER_SIZE}.0 ).r;
  if ( floorY > uBoxMaxY || floorY < uCamera.y - 40.0 ) { gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); return; }
  float size = uSplashSize * ( 0.25 + 0.75 * life );
  vec3 world = vec3( xz.x + corner.x * size, floorY + 0.03, xz.y + corner.y * size );
  vLife = life;
  vec4 mvPosition = viewMatrix * vec4( world, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`

const SPLASH_FRAGMENT = /* glsl */ `
uniform vec3 uSplashColor;
uniform float uSplashAlpha;
varying vec2 vUv;
varying float vLife;
varying float vFade;
#include <fog_pars_fragment>

void main() {
  float d = length( vUv );
  float ring = smoothstep( 0.62, 0.85, d ) * ( 1.0 - smoothstep( 0.85, 1.0, d ) );
  float a = ring * ( 1.0 - vLife ) * uSplashAlpha * vFade;
  if ( a < 0.02 ) discard;
  gl_FragColor = vec4( uSplashColor, a );
  #include <fog_fragment>
  #include <colorspace_fragment>
}
`

export interface PrecipitationFrame {
  /** Particle densities by PARTICLE_KINDS order (0-1 each). */
  readonly densities: Float32Array
  /** Wind direction (unit) and strength 0-1. */
  windX: number
  windZ: number
  windStrength: number
  /** Sky light colour the particles are lit by (linear). */
  readonly light: THREE.Color
  /** Dust devils: up to MAX_DEVILS of (x, z, ground y, strength 0-1). */
  readonly devils: readonly THREE.Vector4[]
  /** Hell: weather falls from the cavern ceiling, not the sky. */
  cavern: boolean
  /** World size of a pixel at distance 1 (2·tan(fov/2) / viewport height). */
  pixelSize: number
}

export class PrecipitationRenderer {
  readonly mesh: THREE.Mesh
  readonly splashes: THREE.Mesh
  private readonly material: THREE.ShaderMaterial
  private readonly splashMaterial: THREE.ShaderMaterial
  private readonly windOffset = new THREE.Vector2()
  private time = 0
  private readonly cdf = new Float32Array(PARTICLE_KIND_COUNT)

  constructor(private readonly shelter: ShelterMap) {
    const kindA = PARTICLE_KINDS.map((k) => new THREE.Color().setRGB(...k.colorA, THREE.SRGBColorSpace))
    const kindB = PARTICLE_KINDS.map((k) => new THREE.Color().setRGB(...k.colorB, THREE.SRGBColorSpace))
    const kindP = PARTICLE_KINDS.map((k) => new THREE.Vector4(k.size, k.length, k.fall, k.windFollow))
    const kindQ = PARTICLE_KINDS.map((k) => new THREE.Vector4(k.flutter, k.alpha, k.glow, k.shape))

    const geometry = new THREE.InstancedBufferGeometry()
    // One quad for every shape: x -1..1 across, y 0..1 along
    geometry.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([-1, 0, 1, 0, 1, 1, -1, 1]), 2))
    geometry.setIndex([0, 1, 2, 0, 2, 3])
    const seeds = new Float32Array(PARTICLE_COUNT * 4)
    const seeds2 = new Float32Array(PARTICLE_COUNT * 4)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      seeds[i * 4] = Math.random()
      seeds[i * 4 + 1] = Math.random()
      seeds[i * 4 + 2] = Math.random()
      // Ranks spread evenly: the first `density` share of particles is the one shown
      seeds[i * 4 + 3] = (i + Math.random()) / PARTICLE_COUNT
      for (let j = 0; j < 4; j++) seeds2[i * 4 + j] = Math.random()
    }
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4))
    geometry.setAttribute('aSeed2', new THREE.InstancedBufferAttribute(seeds2, 4))
    geometry.instanceCount = PARTICLE_COUNT

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uTime: { value: 0 },
        uCamera: { value: new THREE.Vector3() },
        uBox: { value: new THREE.Vector3(BOX_WIDTH, BOX_UP + BOX_DOWN, BOX_WIDTH) },
        uBoxMinY: { value: 0 },
        uBoxMaxY: { value: 0 },
        uWindOffset: { value: this.windOffset },
        uWindVel: { value: new THREE.Vector2() },
        uShelter: { value: shelter.texture },
        uKindA: { value: kindA },
        uKindB: { value: kindB },
        uKindP: { value: kindP },
        uKindQ: { value: kindQ },
        uKindCdf: { value: this.cdf },
        uActive: { value: 0 },
        uLight: { value: new THREE.Color(1, 1, 1) },
        uPixelSize: { value: 0.003 },
        uDevils: { value: Array.from({ length: MAX_DEVILS }, () => new THREE.Vector4()) },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      fog: true,
      side: THREE.DoubleSide,
    })
    this.mesh = new THREE.Mesh(geometry, this.material)
    this.mesh.frustumCulled = false
    // After the liquids (renderOrder 0-2) and glow halos
    this.mesh.renderOrder = 4
    this.mesh.visible = false

    const splashGeometry = new THREE.InstancedBufferGeometry()
    splashGeometry.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2))
    splashGeometry.setIndex([0, 2, 1, 0, 3, 2])
    const splashSeeds = new Float32Array(SPLASH_COUNT * 4)
    for (let i = 0; i < SPLASH_COUNT; i++) {
      splashSeeds[i * 4] = Math.random()
      splashSeeds[i * 4 + 1] = Math.random()
      splashSeeds[i * 4 + 2] = Math.random()
      splashSeeds[i * 4 + 3] = (i + Math.random()) / SPLASH_COUNT
    }
    splashGeometry.setAttribute('aSplash', new THREE.InstancedBufferAttribute(splashSeeds, 4))
    splashGeometry.instanceCount = SPLASH_COUNT
    this.splashMaterial = new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uTime: { value: 0 },
        uCamera: { value: new THREE.Vector3() },
        uBoxMaxY: { value: 0 },
        uShelter: { value: shelter.texture },
        uSplashDensity: { value: 0 },
        uSplashSize: { value: 0.3 },
        uSplashColor: { value: new THREE.Color(0.8, 0.85, 0.9) },
        uSplashAlpha: { value: 0.5 },
      },
      vertexShader: SPLASH_VERTEX,
      fragmentShader: SPLASH_FRAGMENT,
      transparent: true,
      depthWrite: false,
      fog: true,
    })
    this.splashes = new THREE.Mesh(splashGeometry, this.splashMaterial)
    this.splashes.frustumCulled = false
    this.splashes.renderOrder = 4
    this.splashes.visible = false
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.mesh, this.splashes)
  }

  /** Move the weather on and point it at the camera. Call once per frame. */
  update(dt: number, camera: THREE.Vector3, frame: PrecipitationFrame): void {
    const d = frame.densities
    let total = 0
    let splash = 0
    const splashColor = this.splashMaterial.uniforms.uSplashColor.value as THREE.Color
    splashColor.setRGB(0, 0, 0)
    let splashGlow = 0
    for (let i = 0; i < PARTICLE_KIND_COUNT; i++) {
      total += d[i]
      this.cdf[i] = total
      const kind = PARTICLE_KINDS[i]
      if (kind.splash && d[i] > 0) {
        splash += d[i]
        splashColor.r += kind.colorB[0] * d[i]
        splashColor.g += kind.colorB[1] * d[i]
        splashColor.b += kind.colorB[2] * d[i]
        splashGlow += kind.glow * d[i]
      }
    }
    const visible = total > 0.002
    this.mesh.visible = visible
    this.splashes.visible = splash > 0.01
    if (!visible) return

    this.time = (this.time + dt) % TIME_WRAP
    const windSpeed = GALE_SPEED * frame.windStrength
    this.windOffset.x = (this.windOffset.x + frame.windX * windSpeed * dt) % WIND_WRAP
    this.windOffset.y = (this.windOffset.y + frame.windZ * windSpeed * dt) % WIND_WRAP

    const top = frame.cavern ? Math.min(camera.y + BOX_UP, 139) : camera.y + BOX_UP
    const bottom = camera.y - BOX_DOWN
    this.shelter.update(camera.x, camera.z, top, bottom, frame.cavern)

    const u = this.material.uniforms
    u.uTime.value = this.time
    ;(u.uCamera.value as THREE.Vector3).copy(camera)
    u.uBoxMinY.value = bottom
    u.uBoxMaxY.value = top
    ;(u.uBox.value as THREE.Vector3).y = top - bottom
    ;(u.uWindVel.value as THREE.Vector2).set(frame.windX * windSpeed, frame.windZ * windSpeed)
    u.uActive.value = Math.min(1, total)
    ;(u.uLight.value as THREE.Color).copy(frame.light)
    u.uPixelSize.value = frame.pixelSize
    const devils = u.uDevils.value as THREE.Vector4[]
    for (let i = 0; i < MAX_DEVILS; i++) {
      const src = frame.devils[i]
      if (src) devils[i].copy(src)
      else devils[i].set(0, 0, 0, 0)
    }

    const s = this.splashMaterial.uniforms
    s.uTime.value = this.time
    ;(s.uCamera.value as THREE.Vector3).copy(camera)
    s.uBoxMaxY.value = top
    s.uSplashDensity.value = Math.min(1, splash * 1.1)
    if (splash > 0) {
      splashColor.multiplyScalar(1 / splash)
      splashColor.setRGB(splashColor.r, splashColor.g, splashColor.b, THREE.SRGBColorSpace)
      const glow = splashGlow / splash
      const lit = frame.light
      splashColor.setRGB(
        splashColor.r * (lit.r + (1 - lit.r) * glow),
        splashColor.g * (lit.g + (1 - lit.g) * glow),
        splashColor.b * (lit.b + (1 - lit.b) * glow),
      )
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.material.dispose()
    this.splashes.geometry.dispose()
    this.splashMaterial.dispose()
  }
}

