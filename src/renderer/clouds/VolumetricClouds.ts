import * as THREE from 'three'
import { CLOUD_NOISE_SIZE } from './cloudNoise3D.ts'
import { COVER_BIAS, COVER_RANGE, WEATHER_CLOUD_BASE, weatherFieldParams, weatherMapA, weatherMapB, weatherMapC } from '../weather/WeatherFieldShader.ts'
import {
  CLOUD_LIGHT_GLSL, CLOUD_SHADOW_REF_Y, cloudShadowParams, cloudShadowUniforms, godRaySun, godRaySunColor, setCloudShadowMap, setGodRayMap,
} from '../worldLightShader.ts'

/**
 * The sky's clouds, in 3D: one layer ray-marched through a tileable noise
 * volume, shaped by the weather (weather/WeatherSkyMap.ts map C: how much
 * cloud, how tall, how puffy, an anvil) - fair-weather cumulus, cumulus
 * fields, flat overcast sheets, thick low rain decks, thunderstorm towers
 * spreading into anvils - so every cloud is part of a weather system and
 * moves with it (the noise drifts with the steering wind: CloudFrame.drift).
 * Lit by the sun (or moon) with self-shadowing, a silver lining toward the
 * light, dark storm bases, the weather's tint (ash, sand), lightning from
 * inside, and aerial perspective toward the horizon.
 *
 * Rendered at a fraction of the screen (QUALITY) into a half-float target (Skybox
 * calls render() just before the dome draws), with a per-pixel jittered
 * march blended over the reprojected last frame (temporal accumulation: few
 * steps, no noise); the dome composites it on the sky pixels.
 */

/** Cloud resolution as a fraction of the screen's (each axis) and the most steps a ray takes, per quality. */
const QUALITY = {
  fancy: { scale: 0.5, steps: 72 },
  fast: { scale: 0.34, steps: 44 },
} as const
let quality: keyof typeof QUALITY = 'fancy'

/** Choose the clouds' quality (Settings > Clouds); applies on the next frame. */
export function setCloudQuality(value: keyof typeof QUALITY): void {
  quality = QUALITY[value] ? value : 'fancy'
}
/** World size of one noise tile (shape) and of the detail (blocks); the detail tile divides the shape tile. */
const SHAPE_TILE = 960
const DETAIL_TILE = 192
/** The cloud layer: from below the lowest base to the top of the tallest anvil (world Y). */
const SLAB_BOTTOM = WEATHER_CLOUD_BASE - 90
const THICKNESS_RANGE = 870
const ANVIL_Y = WEATHER_CLOUD_BASE + 800
const ANVIL_HALF = 55
const SLAB_TOP = ANVIL_Y + ANVIL_HALF
/** Clouds are marched out to here (blocks); beyond the weather map they are the biome's fair-weather cumulus. */
const MAX_DISTANCE = 9000
/** Fair cumulus thickness (map C units) beyond the weather map. */
const FAIR_THICKNESS = 0.12
/** How much of the last frame each pixel keeps. */
const HISTORY_BLEND = 0.88
/** A camera jump further than this (blocks) drops the history. */
const HISTORY_JUMP = 40
/** God rays are marched at this fraction of the screen (each axis): they are soft. */
const GOD_RAY_SCALE = 0.25
/** The cloud shadow map: CLOUD_SHADOW_SIZE² texels of CLOUD_SHADOW_TEXEL blocks around the camera. */
const CLOUD_SHADOW_SIZE = 256
const CLOUD_SHADOW_TEXEL = 8

function glslFloat(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`
}

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`

const CLOUD_DENSITY_GLSL = /* glsl */ `
precision highp float;
precision highp sampler3D;
uniform sampler3D uNoise;
uniform sampler2D uMapC;
uniform float uMapInvSpan;
uniform float uMapReach;
uniform vec3 uCamPos;
uniform vec3 uNoiseOrigin;
uniform float uEvolve;
uniform vec3 uLightDir;
uniform float uCoverage;

const float BASE = ${glslFloat(WEATHER_CLOUD_BASE)};
const float THICKNESS = ${glslFloat(THICKNESS_RANGE)};
const float ANVIL_Y = ${glslFloat(ANVIL_Y)};
const float ANVIL_HALF = ${glslFloat(ANVIL_HALF)};
const float EXTINCTION = 0.11;

float remap( float v, float l0, float h0, float l1, float h1 ) {
  return l1 + ( v - l0 ) / ( h0 - l0 ) * ( h1 - l1 );
}

// The clouds a map cell asks for: amount added to the biome's, thickness, puffiness, anvil; base and top heights
struct Cell { float cover; float puff; float anvil; float base; float top; vec3 warp; };

Cell cellAt( vec3 p ) {
  vec4 c = texture2D( uMapC, p.xz * uMapInvSpan );
  // Beyond the weather map: the biome's fair-weather cumulus
  float far = smoothstep( uMapReach * 0.7, uMapReach, length( p.xz - uCamPos.xz ) );
  Cell cell;
  cell.cover = mix( c.r * ${glslFloat(COVER_RANGE)} - ${glslFloat(COVER_BIAS)}, 0.0, far );
  cell.puff = mix( c.b, 1.0, far );
  cell.anvil = c.a * ( 1.0 - far );
  float thick = mix( c.g, ${glslFloat(FAIR_THICKNESS)}, far );
  // Sheets and rain decks hang lower than fair cumulus
  cell.base = BASE - 70.0 * ( 1.0 - cell.puff );
  cell.top = cell.base + 30.0 + THICKNESS * thick;
  // A slow warp of the shapes and a swell and ebb of the cover, kilometres across, so the noise's 960-block
  // tile never shows as a repeating pattern
  vec4 big = texture( uNoise, ( vec3( p.x, 0.0, p.z ) - uCamPos * vec3( 1.0, 0.0, 1.0 ) + uNoiseOrigin * vec3( 1.0, 0.0, 1.0 ) ) * ${glslFloat(1 / 12000)} + vec3( 0.13, 0.5, 0.71 ) );
  cell.warp = vec3( big.g - 0.5, 0.0, big.b - 0.5 ) * 320.0;
  cell.cover += ( big.r - 0.5 ) * 0.3;
  return cell;
}

// Cloud density at p (0-1); hf = height through the cell's cloud (0 base .. 1 top)
float density( vec3 p, Cell cell, bool fine, out float hf ) {
  vec3 q = uNoiseOrigin + ( p - uCamPos ) + cell.warp;
  // Fair-weather cover is a fraction of the sky (cumulus leave most of it blue); weather adds to it
  float cov = clamp( uCoverage * 0.8 + cell.cover, 0.0, 1.0 );
  hf = ( p.y - cell.base ) / ( cell.top - cell.base );
  float d = 0.0;
  if ( hf > 0.0 && hf < 1.0 && cov > 0.01 ) {
    // Flat bases; cumulus round off toward their tops, sheets stay flat; towers keep their width
    float bottom = smoothstep( 0.0, mix( 0.22, 0.07, cell.puff ), hf );
    float top = 1.0 - smoothstep( mix( 0.7, 0.4, cell.puff ), 1.0, hf );
    // (squashed vertically: lumpy, cauliflower sides rather than smooth columns)
    vec4 n = texture( uNoise, vec3( q.x, q.y * 2.2, q.z ) * ${glslFloat(1 / SHAPE_TILE)} + vec3( 0.0, uEvolve, 0.0 ) );
    float fbm = n.g * 0.625 + n.b * 0.25 + n.a * 0.125;
    // Perlin-Worley carved into billows by the Worley fBm
    float shape = remap( n.r, fbm - 1.0, 1.0, 0.0, 1.0 );
    // A sheet's shape is mostly its coverage
    shape = mix( 0.62 + 0.38 * shape, shape, cell.puff );
    d = clamp( remap( shape * bottom * top, 1.0 - cov, 1.0, 0.0, 1.0 ), 0.0, 1.0 ) * cov;
    if ( fine && d > 0.0 ) {
      // Detail erodes the edges: wisps at the base, billows higher up
      vec3 dn = texture( uNoise, vec3( q.x, q.y * 1.6, q.z ) * ${glslFloat(1 / DETAIL_TILE)} + vec3( uEvolve * 3.0, 0.0, 0.0 ) ).gba;
      float dfbm = dn.x * 0.625 + dn.y * 0.25 + dn.z * 0.125;
      float edge = mix( dfbm, 1.0 - dfbm, clamp( hf * 5.0, 0.0, 1.0 ) ) * mix( 0.12, 0.38, cell.puff );
      d = clamp( remap( d, edge, 1.0, 0.0, 1.0 ), 0.0, 1.0 );
    }
  }
  // A storm's anvil: a wide flat sheet at the top of its tower
  if ( cell.anvil > 0.02 ) {
    float a = 1.0 - abs( p.y - ANVIL_Y ) / ANVIL_HALF;
    if ( a > 0.0 ) {
      float n = texture( uNoise, q * ${glslFloat(1 / (SHAPE_TILE * 1.7))} + vec3( 0.37, uEvolve * 0.5, 0.71 ) ).r;
      float sheet = clamp( remap( n * smoothstep( 0.0, 0.7, a ), 1.0 - cell.anvil, 1.0, 0.0, 1.0 ), 0.0, 1.0 ) * cell.anvil;
      d = max( d, sheet );
    }
  }
  return d;
}

`

const FRAGMENT = /* glsl */ `
${CLOUD_DENSITY_GLSL}
uniform sampler2D uMapA;
uniform sampler2D uMapB;
uniform mat4 uInvProj;
uniform mat3 uCamRot;
uniform mat4 uPrevRot;
uniform vec3 uCamDelta;
uniform sampler2D uHistory;
uniform float uHistoryBlend;
uniform float uFrame;
uniform vec3 uLightColor;
uniform vec3 uAmbientTop;
uniform vec3 uAmbientBottom;
uniform vec3 uHorizon;
uniform float uOpacity;
uniform vec3 uTint;
uniform float uFlash;
uniform vec3 uFlashDir;
varying vec2 vUv;
// Henyey-Greenstein phase, ×4π (1 = isotropic)
float hg( float c, float g ) {
  float g2 = g * g;
  return ( 1.0 - g2 ) / pow( 1.0 + g2 - 2.0 * g * c, 1.5 );
}

void main() {
  vec4 view = uInvProj * vec4( vUv * 2.0 - 1.0, 1.0, 1.0 );
  vec3 dir = normalize( uCamRot * ( view.xyz / view.w ) );
  vec4 result = vec4( 0.0 );
  float depth = 0.0;
  // The layer along this ray
  float ta = ( ${glslFloat(SLAB_BOTTOM)} - uCamPos.y ) / dir.y;
  float tb = ( ${glslFloat(SLAB_TOP)} - uCamPos.y ) / dir.y;
  float tEnter = max( min( ta, tb ), 0.0 );
  float tExit = min( max( ta, tb ), ${glslFloat(MAX_DISTANCE)} );
  if ( abs( dir.y ) > 1e-4 && tExit > tEnter ) {
    float jitter = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) + uFrame * 0.6180339 );
    float trans = 1.0;
    vec3 light = vec3( 0.0 );
    float depthWeight = 0.0;
    float cosLight = dot( dir, uLightDir );
    // Bright toward the light (a silver lining), a little back-scatter
    float phase = mix( hg( cosLight, 0.62 ), hg( cosLight, -0.25 ), 0.3 );
    float t = tEnter;
    float stepLen = 12.0 + tEnter * 0.012;
    t += stepLen * jitter;
    for ( int i = 0; i < CLOUD_STEPS; i++ ) {
      if ( t >= tExit || trans < 0.015 ) break;
      vec3 p = uCamPos + dir * t;
      Cell cell = cellAt( p );
      stepLen = 12.0 + t * 0.012;
      float hf;
      float d = density( p, cell, true, hf );
      if ( d > 0.003 ) {
        vec2 uv = p.xz * uMapInvSpan;
        float dark = texture2D( uMapA, uv ).b;
        vec3 tint = texture2D( uMapB, uv ).rgb * 1.25 * uTint;
        // Light reaching here through the cloud toward the sun (three steps), with the powder effect
        float od = 0.0;
        float lhf;
        od += density( p + uLightDir * 16.0, cell, false, lhf ) * 16.0;
        od += density( p + uLightDir * 48.0, cell, false, lhf ) * 32.0;
        od += density( p + uLightDir * 110.0, cell, false, lhf ) * 62.0;
        float beer = exp( - od * EXTINCTION * 0.9 );
        float powder = 1.0 - exp( - d * 6.0 );
        // Single scattering (bright toward the sun, dark edges facing it) plus a soft multiple-scattering
        // glow that keeps lit cloud white from any side
        vec3 sun = uLightColor * ( beer * phase * mix( 0.55, 1.0, powder ) + 0.75 * pow( beer, 0.35 ) );
        vec3 ambient = mix( uAmbientBottom, uAmbientTop, clamp( hf, 0.0, 1.0 ) ) * ( 1.0 - 0.55 * dark );
        vec3 col = ( sun * ( 1.0 - 0.35 * dark ) + ambient ) * tint;
        float sigma = d * EXTINCTION * uOpacity;
        float stepTrans = exp( - sigma * stepLen );
        float absorbed = trans * ( 1.0 - stepTrans );
        light += absorbed * col;
        depth += absorbed * t;
        depthWeight += absorbed;
        trans *= stepTrans;
        t += stepLen;
      } else {
        // Empty air: stride (further when well outside this cell's cloud)
        t += stepLen * ( hf < -0.3 || hf > 1.3 ? 2.6 : 1.4 );
      }
    }
    float alpha = 1.0 - trans;
    depth = depthWeight > 0.0 ? depth / depthWeight : tEnter;
    // Lightning lights the clouds from inside
    light += vec3( 0.7, 0.75, 1.0 ) * uFlash * ( 0.25 + 0.75 * pow( max( dot( dir, uFlashDir ), 0.0 ), 3.0 ) ) * alpha;
    // Far clouds fade into the horizon's haze
    float aerial = exp( - depth / 6500.0 );
    light = mix( uHorizon * alpha, light, aerial );
    result = vec4( light, alpha );
  } else {
    depth = 400.0;
  }
  // Blend over last frame's clouds where this ray's cloud was then (reprojected; clouds sit far off)
  vec4 prev = uPrevRot * vec4( dir * max( depth, 200.0 ) + uCamDelta, 1.0 );
  vec2 prevUv = prev.xy / prev.w * 0.5 + 0.5;
  if ( prev.w > 0.0 && prevUv.x > 0.0 && prevUv.x < 1.0 && prevUv.y > 0.0 && prevUv.y < 1.0 ) {
    result = mix( result, texture2D( uHistory, prevUv ), uHistoryBlend );
  }
  gl_FragColor = result;
}
`

/**
 * The cloud shadow map: for each texel (a CLOUD_SHADOW_TEXEL-block cell of
 * the ground at CLOUD_SHADOW_REF_Y, world-anchored and wrapped like the
 * weather map), how much light gets through the clouds along the light
 * (the clouds' own shapes, detail and all).
 */
const SHADOW_FRAGMENT = /* glsl */ `
${CLOUD_DENSITY_GLSL}
varying vec2 vUv;
uniform float uShadowStrength;
void main() {
  if ( uShadowStrength <= 0.0 || uLightDir.y < 0.05 ) { gl_FragColor = vec4( 1.0 ); return; }
  const float size = ${glslFloat(CLOUD_SHADOW_SIZE)};
  const float texel = ${glslFloat(CLOUD_SHADOW_TEXEL)};
  vec2 k = floor( vUv * size );
  vec2 first = floor( uCamPos.xz / texel ) - size * 0.5;
  vec2 cell = first + mod( k - first, size );
  vec3 ground = vec3( ( cell + 0.5 ) * texel, ${glslFloat(CLOUD_SHADOW_REF_Y)} ).xzy;
  // Through this column's own cloud (from its base to its top, or its anvil), in fine jittered steps
  Cell column = cellAt( ground + uLightDir * ( ( BASE - ground.y ) / uLightDir.y ) );
  float top = column.anvil > 0.02 ? ANVIL_Y + ANVIL_HALF : column.top;
  float t0 = ( column.base - ground.y ) / uLightDir.y;
  float t1 = min( ( top - ground.y ) / uLightDir.y, t0 + 2400.0 );
  float dt = ( t1 - t0 ) / 14.0;
  float jitter = fract( sin( dot( cell, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
  float od = 0.0;
  for ( int i = 0; i < 14; i++ ) {
    vec3 p = ground + uLightDir * ( t0 + dt * ( float( i ) + jitter ) );
    float hf;
    od += density( p, cellAt( p ), true, hf ) * dt;
  }
  gl_FragColor = vec4( vec3( exp( - od * EXTINCTION * 2.6 ) ), 1.0 );
}
`

/**
 * God rays along each pixel's view (worldLightShader's slopGodRays, through
 * the cloud shadow map): r = the haze in sunlight, g = all the haze, both as
 * their share of the view. Jittered per frame and blended over the last
 * frame like the clouds; the land and the sky read it (slopGodRaysAt).
 */
const GOD_RAY_FRAGMENT = /* glsl */ `
precision highp float;
uniform vec3 uCamPos;
uniform mat4 uInvProj;
uniform mat3 uCamRot;
uniform mat4 uPrevRot;
uniform vec3 uCamDelta;
uniform sampler2D uHistory;
uniform float uHistoryBlend;
uniform float uFrame;
varying vec2 vUv;
#define SLOP_CAMERA uCamPos
#define SLOP_JITTER ( uFrame * 0.6180339 )
${CLOUD_LIGHT_GLSL}
void main() {
  vec4 view = uInvProj * vec4( vUv * 2.0 - 1.0, 1.0, 1.0 );
  vec3 dir = normalize( uCamRot * ( view.xyz / view.w ) );
  vec4 result = vec4( slopGodRays( uCamPos, dir, 1500.0 ), 0.0, 1.0 );
  vec4 prev = uPrevRot * vec4( dir * 400.0 + uCamDelta, 1.0 );
  vec2 prevUv = prev.xy / prev.w * 0.5 + 0.5;
  if ( prev.w > 0.0 && prevUv.x > 0.0 && prevUv.x < 1.0 && prevUv.y > 0.0 && prevUv.y < 1.0 ) {
    result = mix( result, texture2D( uHistory, prevUv ), uHistoryBlend );
  }
  gl_FragColor = result;
}
`

/** What the clouds are lit by and shaped with this frame (Skybox fills it). */
export interface CloudLighting {
  /** Toward the light (sun by day, moon by night) and its colour × strength. */
  readonly lightDir: THREE.Vector3
  readonly lightColor: THREE.Color
  /** Sky light from above and from the horizon. */
  readonly ambientTop: THREE.Color
  readonly ambientBottom: THREE.Color
  /** The horizon colour far clouds fade into. */
  readonly horizon: THREE.Color
  /** The biome's fair-weather cover, its clouds' opacity and colour. */
  coverage: number
  opacity: number
  readonly tint: THREE.Color
  /** Lightning (0-1) toward a direction. */
  flash: number
  readonly flashDir: THREE.Vector3
  /** How far the weather has drifted (blocks): the clouds' shapes travel with their weather systems. */
  driftX: number
  driftZ: number
}

export function createCloudLighting(): CloudLighting {
  return {
    lightDir: new THREE.Vector3(0, 1, 0), lightColor: new THREE.Color(1, 1, 1), ambientTop: new THREE.Color(0.5, 0.6, 0.8),
    ambientBottom: new THREE.Color(0.4, 0.45, 0.5), horizon: new THREE.Color(0.7, 0.75, 0.8), coverage: 0.42, opacity: 1,
    tint: new THREE.Color(1, 1, 1), flash: 0, flashDir: new THREE.Vector3(0, 1, 0), driftX: 0, driftZ: 0,
  }
}

const wrapTile = (v: number): number => ((v % SHAPE_TILE) + SHAPE_TILE) % SHAPE_TILE

export class VolumetricClouds {
  readonly lighting = createCloudLighting()
  /** The clouds rendered this frame (premultiplied colour, alpha = cover), or null before the first. */
  texture: THREE.Texture | null = null
  private noise: THREE.Data3DTexture | null = null
  private readonly targets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget]
  private current = 0
  private readonly material: THREE.ShaderMaterial
  private readonly scene = new THREE.Scene()
  /** The cloud shadow map (worldLightShader's cloud shadows). */
  private readonly shadowTarget: THREE.WebGLRenderTarget
  private readonly shadowMaterial: THREE.ShaderMaterial
  private readonly shadowScene = new THREE.Scene()
  /** God rays (ping-pong, like the clouds). */
  private readonly godTargets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget]
  private readonly godMaterial: THREE.ShaderMaterial
  private readonly godScene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly size = new THREE.Vector2()
  private readonly prevRot = new THREE.Matrix4()
  private readonly prevPos = new THREE.Vector3()
  private readonly viewRot = new THREE.Matrix4()
  private historyValid = false
  private frame = 0
  private evolve = 0
  private lastTime = 0
  private appliedQuality = ''

  constructor() {
    const target = (): THREE.WebGLRenderTarget => new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    })
    this.targets = [target(), target()]
    const uniforms: Record<string, THREE.IUniform> = {
        uNoise: { value: null },
        uMapA: { value: weatherMapA },
        uMapB: { value: weatherMapB },
        uMapC: { value: weatherMapC },
        uMapInvSpan: { value: weatherFieldParams.x },
        uMapReach: { value: 0 },
        uCamPos: { value: new THREE.Vector3() },
        uNoiseOrigin: { value: new THREE.Vector3() },
        uInvProj: { value: new THREE.Matrix4() },
        uCamRot: { value: new THREE.Matrix3() },
        uPrevRot: { value: new THREE.Matrix4() },
        uCamDelta: { value: new THREE.Vector3() },
        uHistory: { value: null },
        uHistoryBlend: { value: 0 },
        uFrame: { value: 0 },
        uEvolve: { value: 0 },
        uLightDir: { value: this.lighting.lightDir },
        uLightColor: { value: this.lighting.lightColor },
        uAmbientTop: { value: this.lighting.ambientTop },
        uAmbientBottom: { value: this.lighting.ambientBottom },
        uHorizon: { value: this.lighting.horizon },
        uCoverage: { value: 0.42 },
        uOpacity: { value: 1 },
        uTint: { value: this.lighting.tint },
        uFlash: { value: 0 },
        uFlashDir: { value: this.lighting.flashDir },
    }
    this.material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    })
    const quad = new THREE.PlaneGeometry(2, 2)
    const mesh = new THREE.Mesh(quad, this.material)
    mesh.frustumCulled = false
    this.scene.add(mesh)

    // The shadow pass shares the clouds' uniforms (the same objects)
    this.shadowTarget = new THREE.WebGLRenderTarget(CLOUD_SHADOW_SIZE, CLOUD_SHADOW_SIZE, {
      type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    })
    this.shadowTarget.texture.wrapS = THREE.RepeatWrapping
    this.shadowTarget.texture.wrapT = THREE.RepeatWrapping
    this.shadowTarget.texture.generateMipmaps = false
    this.shadowMaterial = new THREE.ShaderMaterial({
      uniforms: { ...uniforms, uShadowStrength: { value: 0 } },
      vertexShader: VERTEX,
      fragmentShader: SHADOW_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    })
    const shadowMesh = new THREE.Mesh(quad, this.shadowMaterial)
    shadowMesh.frustumCulled = false
    this.shadowScene.add(shadowMesh)
    setCloudShadowMap(this.shadowTarget.texture, 1 / (CLOUD_SHADOW_SIZE * CLOUD_SHADOW_TEXEL))

    // God rays: the camera uniforms are the clouds' (same objects), the light ones every world material's
    this.godTargets = [target(), target()]
    this.godMaterial = new THREE.ShaderMaterial({
      uniforms: {
        ...cloudShadowUniforms,
        // Not the map being rendered (the pass never reads it; keep it off the target)
        uGodRayMap: { value: null },
        uCamPos: uniforms.uCamPos,
        uInvProj: uniforms.uInvProj,
        uCamRot: uniforms.uCamRot,
        uPrevRot: uniforms.uPrevRot,
        uCamDelta: uniforms.uCamDelta,
        uFrame: uniforms.uFrame,
        uHistory: { value: null },
        uHistoryBlend: { value: 0 },
      },
      vertexShader: VERTEX,
      fragmentShader: GOD_RAY_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    })
    const godMesh = new THREE.Mesh(quad, this.godMaterial)
    godMesh.frustumCulled = false
    this.godScene.add(godMesh)
    this.startNoise()
  }

  /** Build the noise volume in a worker; the clouds show once it is in. */
  private startNoise(): void {
    if (typeof Worker === 'undefined') return
    const worker = new Worker(new URL('./cloudNoiseWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<{ data: Uint8Array }>) => {
      const texture = new THREE.Data3DTexture(event.data.data, CLOUD_NOISE_SIZE, CLOUD_NOISE_SIZE, CLOUD_NOISE_SIZE)
      texture.format = THREE.RGBAFormat
      texture.type = THREE.UnsignedByteType
      texture.wrapS = THREE.RepeatWrapping
      texture.wrapT = THREE.RepeatWrapping
      texture.wrapR = THREE.RepeatWrapping
      texture.minFilter = THREE.LinearFilter
      texture.magFilter = THREE.LinearFilter
      texture.unpackAlignment = 1
      texture.needsUpdate = true
      this.noise = texture
      this.material.uniforms.uNoise.value = texture
      worker.terminate()
    }
    worker.onerror = (error) => console.warn('[clouds] noise worker failed; no clouds', error)
    worker.postMessage({ seed: 1337 })
  }

  /** Whether there is anything to show yet. */
  get ready(): boolean {
    return this.noise !== null
  }

  /** The history is stale (the sky was hidden, the weather jumped): start over next frame. */
  invalidate(): void {
    this.historyValid = false
  }

  /** No clouds to cast shadows (underground, under water): the ground is lit as if clear, no god rays. */
  hideShadows(): void {
    cloudShadowParams.y = 0
    godRaySun.w = 0
  }

  /**
   * Render this frame's clouds (call while rendering, right before the sky
   * dome draws: the camera's matrices are current).
   */
  render(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    if (!this.noise) return
    if (this.appliedQuality !== quality) {
      this.appliedQuality = quality
      this.material.defines = { CLOUD_STEPS: QUALITY[quality].steps }
      this.material.needsUpdate = true
      this.historyValid = false
    }
    renderer.getDrawingBufferSize(this.size)
    const scale = QUALITY[quality].scale
    const width = Math.max(1, Math.ceil(this.size.x * scale))
    const height = Math.max(1, Math.ceil(this.size.y * scale))
    const write = this.targets[this.current]
    const read = this.targets[1 - this.current]
    if (write.width !== width || write.height !== height) {
      write.setSize(width, height)
      read.setSize(width, height)
      this.historyValid = false
    }

    const now = performance.now() / 1000
    const dt = this.lastTime > 0 ? Math.min(0.25, now - this.lastTime) : 0
    this.lastTime = now
    // Clouds slowly boil (the noise rises through the layer)
    this.evolve = (this.evolve + dt * (0.6 / SHAPE_TILE)) % 1

    const u = this.material.uniforms
    const l = this.lighting
    const pos = camera.position
    ;(u.uCamPos.value as THREE.Vector3).copy(pos)
    ;(u.uNoiseOrigin.value as THREE.Vector3).set(wrapTile(pos.x - l.driftX), wrapTile(pos.y), wrapTile(pos.z - l.driftZ))
    ;(u.uInvProj.value as THREE.Matrix4).copy((camera as THREE.PerspectiveCamera).projectionMatrixInverse)
    ;(u.uCamRot.value as THREE.Matrix3).setFromMatrix4(camera.matrixWorld)
    const delta = u.uCamDelta.value as THREE.Vector3
    delta.copy(pos).sub(this.prevPos)
    const keepHistory = this.historyValid && delta.length() < HISTORY_JUMP
    ;(u.uPrevRot.value as THREE.Matrix4).copy(this.prevRot)
    u.uHistory.value = read.texture
    u.uHistoryBlend.value = keepHistory ? HISTORY_BLEND : 0
    u.uFrame.value = this.frame = (this.frame + 1) % 1024
    u.uEvolve.value = this.evolve
    u.uMapInvSpan.value = weatherFieldParams.x
    u.uMapReach.value = 0.5 / weatherFieldParams.x - 150
    u.uCoverage.value = l.coverage
    u.uOpacity.value = l.opacity
    u.uFlash.value = l.flash

    const previous = renderer.getRenderTarget()
    renderer.setRenderTarget(write)
    renderer.render(this.scene, this.camera)
    // The clouds' shadows on the ground, along the light (sun, or the faint moon): used from the next frame on
    const light = l.lightDir
    const strength = Math.min(1, Math.max(0, (light.y - 0.05) / 0.15)) * Math.min(1, l.lightColor.r + l.lightColor.g + l.lightColor.b)
    this.shadowMaterial.uniforms.uShadowStrength.value = strength
    renderer.setRenderTarget(this.shadowTarget)
    renderer.render(this.shadowScene, this.camera)
    renderer.setRenderTarget(previous)
    cloudShadowParams.y = strength
    cloudShadowParams.z = light.y > 0.01 ? light.x / light.y : 0
    cloudShadowParams.w = light.y > 0.01 ? light.z / light.y : 0
    // God rays shine with the same light
    godRaySun.x = light.x
    godRaySun.y = light.y
    godRaySun.z = light.z
    godRaySun.w = strength
    godRaySunColor.x = l.lightColor.r
    godRaySunColor.y = l.lightColor.g
    godRaySunColor.z = l.lightColor.b
    // The god rays through this frame's shadows (the land reads them from the next frame)
    const godWrite = this.godTargets[this.current]
    const godRead = this.godTargets[1 - this.current]
    const godWidth = Math.max(1, Math.ceil(this.size.x * GOD_RAY_SCALE))
    const godHeight = Math.max(1, Math.ceil(this.size.y * GOD_RAY_SCALE))
    if (godWrite.width !== godWidth || godWrite.height !== godHeight) {
      godWrite.setSize(godWidth, godHeight)
      godRead.setSize(godWidth, godHeight)
    }
    const g = this.godMaterial.uniforms
    g.uHistory.value = godRead.texture
    g.uHistoryBlend.value = u.uHistoryBlend.value
    renderer.setRenderTarget(godWrite)
    renderer.render(this.godScene, this.camera)
    renderer.setRenderTarget(previous)
    setGodRayMap(godWrite.texture, this.size.x, this.size.y)

    // Next frame reprojects through this frame's view (rotation only; the position change goes in uCamDelta)
    this.viewRot.copy(camera.matrixWorldInverse).setPosition(0, 0, 0)
    this.prevRot.multiplyMatrices((camera as THREE.PerspectiveCamera).projectionMatrix, this.viewRot)
    this.prevPos.copy(pos)
    this.historyValid = true
    this.texture = write.texture
    this.current = 1 - this.current
  }

  dispose(): void {
    this.targets[0].dispose()
    this.targets[1].dispose()
    this.material.dispose()
    this.shadowTarget.dispose()
    this.shadowMaterial.dispose()
    this.godTargets[0].dispose()
    this.godTargets[1].dispose()
    this.godMaterial.dispose()
    this.noise?.dispose()
  }
}
