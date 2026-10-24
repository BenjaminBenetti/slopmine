import * as THREE from 'three'
import { glowTimeUniform } from './glowClock.ts'

/** One flame plane: its size in blocks (the shader keeps pixels square at TEXELS_PER_BLOCK). */
export interface FlamePlane {
  readonly width: number
  readonly height: number
  /** Extra heat: inner planes burn yellower and taller relative to their size. */
  readonly heat: number
  /** Sparks drift up out of this plane. */
  readonly sparks: boolean
}

/** Flame pixels per block (block textures are 64 px; pixel-art detail reads at about half that). */
const TEXELS_PER_BLOCK = 32

/** sRGB colour ramp from the cool edge to the hot core, and the sparks. */
const RAMP = [0xa8240c, 0xe2501a, 0xff8a1f, 0xffc23a, 0xfff0a6]
const SPARK = 0xffd36a

function glslColor(hex: number): string {
  const c = new THREE.Color().setHex(hex) // sRGB → linear working space
  return `vec3( ${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)} )`
}

const VERTEX_PARS = /* glsl */ `
uniform float uFlameTime;
varying vec2 vFlameUv;
varying float vFlameSeed;
`

// The tips lean in a slow draught. Each instance gets its own seed from its
// position, so neighbouring fires never flicker in step.
const VERTEX_BEGIN = /* glsl */ `#include <begin_vertex>
vFlameUv = uv;
#ifdef USE_INSTANCING
  vFlameSeed = fract( dot( instanceMatrix[3].xyz, vec3( 0.1731, 0.0917, 0.1513 ) ) ) * 37.0;
#else
  vFlameSeed = 0.0;
#endif
transformed.xz += vec2( sin( uFlameTime * 1.3 + vFlameSeed ), cos( uFlameTime * 0.9 + vFlameSeed * 1.7 ) ) * 0.03 * uv.y * uv.y;
`

function fragmentPars(planes: readonly FlamePlane[]): string {
  const sizes = planes.map((p) => `vec4( ${p.width.toFixed(3)}, ${p.height.toFixed(3)}, ${p.heat.toFixed(3)}, ${p.sparks ? '1.0' : '0.0'} )`)
  return /* glsl */ `
uniform float uFlameTime;
varying vec2 vFlameUv;
varying float vFlameSeed;

float slopFlameHash( vec2 p ) {
  return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}

float slopFlameNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix(
    mix( slopFlameHash( i ), slopFlameHash( i + vec2( 1.0, 0.0 ) ), f.x ),
    mix( slopFlameHash( i + vec2( 0.0, 1.0 ) ), slopFlameHash( i + vec2( 1.0, 1.0 ) ), f.x ),
    f.y
  );
}

vec4 slopFlamePlane( float index ) {
  ${sizes.map((s, i) => `if ( index < ${i}.5 ) return ${s};`).join('\n  ')}
  return ${sizes[sizes.length - 1]};
}

// uv.x of plane i runs 2i .. 2i + 1 (the plane's index rides in it), uv.y 0
// at the base to 1 at the top. Returns the pixel's colour or discards.
vec3 slopFlame( vec2 uv, float seed ) {
  float index = floor( uv.x * 0.5 + 0.25 );
  vec4 plane = slopFlamePlane( index );
  vec2 texels = floor( plane.xy * ${TEXELS_PER_BLOCK.toFixed(1)} + 0.5 );
  vec2 cell = floor( vec2( uv.x - index * 2.0, uv.y ) * texels );
  cell = min( cell, texels - 1.0 );
  vec2 p = ( cell + 0.5 ) / texels;
  float s = seed + index * 7.31;
  float t = uFlameTime;

  // Turbulence rising through the flame, in block units (every plane the same grain)
  vec2 q = p * plane.xy * 7.0;
  q.x += sin( t * 1.9 + q.y * 1.3 + s ) * 0.35;
  float n = slopFlameNoise( q + vec2( s, -t * 4.2 ) ) * 0.62
          + slopFlameNoise( q * 2.3 + vec2( -s, -t * 6.9 ) ) * 0.38;

  // A tongue of fire: widest at the base, narrowing to the tip; the noise
  // tears it into licks that break off and rise
  float x = abs( p.x - 0.5 ) * 2.0;
  float y = p.y;
  float width = 1.0 - pow( y, 1.35 ) * 0.86;
  float heat = ( 1.0 - x / width ) * 1.3 - y * 1.2 + ( n - 0.5 ) * 1.25 + 0.15 + plane.z;
  // Several tongues of different heights across the flame, rising and falling
  heat += ( slopFlameNoise( vec2( p.x * plane.x * 9.0 + s * 3.0, t * 1.7 ) ) - 0.5 ) * 0.9 * y;
  heat -= smoothstep( 0.75, 1.0, x ) * 0.7; // never cut off by the plane's edge

  if ( heat <= 0.0 ) {
    // Sparks: single hot pixels climbing out of the flames, each column on its own clock
    if ( plane.w > 0.5 ) {
      float rate = 0.45 + 0.35 * slopFlameHash( vec2( cell.x, s ) );
      float life = t * rate + slopFlameHash( vec2( s, cell.x ) );
      float age = fract( life );
      float row = floor( mix( 0.35, 1.0, age ) * texels.y );
      if ( cell.y == row && age < 0.92 && slopFlameHash( vec2( cell.x + floor( life ) * 13.0, s ) ) > 0.9 ) {
        return ${glslColor(SPARK)};
      }
    }
    discard;
    return vec3( 0.0 );
  }
  if ( heat < 0.12 ) return ${glslColor(RAMP[0])};
  if ( heat < 0.3 ) return ${glslColor(RAMP[1])};
  if ( heat < 0.52 ) return ${glslColor(RAMP[2])};
  if ( heat < 0.78 ) return ${glslColor(RAMP[3])};
  return ${glslColor(RAMP[4])};
}
`
}

/**
 * Flame planes: geometry of vertical quads standing on y = 0 around the
 * vertical axis, each rotated `angles[i]` about Y, with the uv layout the
 * flame material reads (plane i's uv.x runs 2i .. 2i + 1).
 */
export function buildFlamePlanes(planes: readonly FlamePlane[], angles: readonly number[]): THREE.BufferGeometry[] {
  return planes.map((plane, i) => {
    const geo = new THREE.PlaneGeometry(plane.width, plane.height)
    geo.translate(0, plane.height / 2, 0)
    geo.rotateY(angles[i] ?? 0)
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute
    for (let v = 0; v < uv.count; v++) uv.setX(v, uv.getX(v) + i * 2)
    return geo
  })
}

/**
 * Animated pixel-art fire for campfires and the like: an unlit, double-sided
 * cutout material whose fragment shader paints licking flames - a tongue
 * torn by rising noise, a five-step colour ramp from red edges to a pale
 * core - and sparks drifting up, on crossed planes from `buildFlamePlanes`.
 * Driven by the living-world clock (glowClock.ts), so it flickers in the
 * world, in the hand and as a dropped item; each world instance is seeded by
 * its position. Cutout (discard, depth written): it sorts like any opaque
 * block, so water and glass draw over it correctly. Keep it out of shadow
 * maps (`castShadow: false` on its mesh part): the depth pass would draw the
 * whole quads.
 */
export function createFlameMaterial(planes: readonly FlamePlane[]): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
  const pars = fragmentPars(planes)
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFlameTime = glowTimeUniform
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <begin_vertex>', VERTEX_BEGIN)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${pars}`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( slopFlame( vFlameUv, vFlameSeed ), opacity );')
  }
  const key = `slopmine-flame-v1|${planes.map((p) => `${p.width},${p.height},${p.heat},${p.sparks}`).join(';')}`
  material.customProgramCacheKey = () => key
  return material
}
