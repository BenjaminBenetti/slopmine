import * as THREE from 'three'
import type { BiomeAtmosphere } from './BiomeAtmosphere.ts'
import { DEFAULT_CLOUD_COVERAGE, SKY_ZENITH_HEX } from './BiomeAtmosphere.ts'
import { createCloudNoiseTexture } from './cloudNoise.ts'
import type { DayNightState } from './DayNightSky.ts'
import { WEATHER_FIELD_GLSL, WEATHER_MARCH_MAX, WEATHER_TINT_SCALE, weatherFieldSky, weatherFieldUniforms } from '../weather/WeatherFieldShader.ts'

export interface SkyboxOptions {
  skyRadius?: number
  zenithColor?: THREE.Color
  sunColor?: THREE.Color
  /** Fraction of the sky covered by clouds (0-1) until the atmosphere sets it. */
  cloudCoverage?: number
}

/** Cloud drift in cloud-texture UV units per second (shape and detail layers) in a calm, and added at a gale. */
const CLOUD_DRIFT_CALM = 0.0026
const CLOUD_DRIFT_GALE = 0.009
/** The finer detail layer drifts this much faster than the shapes. */
const CLOUD_DETAIL_SPEEDUP = 1.7


/** The weather map stores cloud cover as (cover + COVER_BIAS) / COVER_RANGE (fair weathers thin the clouds: negative cover). */
export const COVER_BIAS = 0.5
export const COVER_RANGE = 1.5

/**
 * The weather as the sky shows it (setupWeather, every frame). Far off it
 * comes from the weather map (renderer/weather/WeatherFieldShader.ts: cloud
 * cover, storm darkness and tint under each patch of cloud; rain walls,
 * sandstorms and fog banks along the horizon), so a storm far off shows as a
 * dark deck and a grey wall on that side of the sky while the sun is out
 * overhead. These are the weather at the player.
 */
export interface SkyWeather {
  /** At the player: the dome greyed (overcast), dimmed (storm), tinted (sand, ash, mist). */
  skyGrey: number
  dim: number
  readonly tint: THREE.Color
  tintAmount: number
  /** Sun disc and glow hidden (0-1). */
  sunDim: number
  /** Lightning: 0-1 brightness, toward flashDir (a far flash lights one side of the sky). */
  flash: number
  readonly flashDir: THREE.Vector3
  rainbow: number
  aurora: number
  meteors: number
  heatHaze: number
}

export function createSkyWeather(): SkyWeather {
  return {
    skyGrey: 0, dim: 1, tint: new THREE.Color(1, 1, 1), tintAmount: 0, sunDim: 0,
    flash: 0, flashDir: new THREE.Vector3(0, 1, 0), rainbow: 0, aurora: 0, meteors: 0, heatHaze: 0,
  }
}

/**
 * Average strength of the twilight glow across all view directions at the
 * horizon (the shader's `0.18 + 0.82 * toward²` over a full turn): what the
 * distance fog takes from it.
 */
const TWILIGHT_FOG_SHARE = 0.49

/**
 * Sky dome: horizon-to-zenith gradient, sun disc + glow, moon and stars and a
 * drifting cloud layer, all computed per pixel in a single draw call. Biome
 * atmosphere (tint, brightness, horizon haze) comes from the shared
 * BiomeAtmosphere, the time of day from DayNightSky (setDayNight), and the
 * horizon color doubles as the distance-fog color (see getHorizonColor).
 */
export class Skybox {
  readonly skyMesh: THREE.Mesh
  private readonly atmosphere: BiomeAtmosphere
  private readonly skyMaterial: THREE.ShaderMaterial
  private readonly cloudTexture: THREE.DataTexture

  /** Current underground darkness factor (0 = open sky, 1 = underground). */
  private darkness = 0

  /** Time of day (null = always day). */
  private dayNight: DayNightState | null = null
  private skyTime = 0

  // Darkness transition thresholds
  private readonly darknessStartY = 180
  private readonly darknessEndY = 150
  /** Cave override (caves/CaveAtmosphere.ts): how far underground the camera is, and that cave's fog colour (linear). */
  private caveFactor = 0
  private readonly caveColor = new THREE.Color()
  private readonly mixedUnderground = new THREE.Color()
  /** The weather (setWeather); null until the weather system starts. */
  private weather: SkyWeather | null = null
  /** Wind for the cloud drift: direction (unit) and strength 0-1. */
  private readonly windDir = new THREE.Vector2(0.95, 0.31)
  private windStrength = 0.15
  private readonly baseHorizon = new THREE.Color()

  constructor(atmosphere: BiomeAtmosphere, options: SkyboxOptions = {}) {
    const {
      skyRadius = 500,
      zenithColor = new THREE.Color(SKY_ZENITH_HEX),
      sunColor = new THREE.Color(1.0, 0.93, 0.8),
      cloudCoverage = DEFAULT_CLOUD_COVERAGE,
    } = options

    this.atmosphere = atmosphere
    this.cloudTexture = createCloudNoiseTexture()
    this.skyMaterial = this.createSkyMaterial(zenithColor, sunColor, cloudCoverage)
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(skyRadius, 32, 16), this.skyMaterial)

    // Render after the world's opaque geometry (renderOrder 0) but before
    // debug overlays (999+) that skip depth writes; transparent meshes still
    // blend over it. At the far plane it only shades uncovered pixels.
    this.skyMesh.renderOrder = 500
    this.skyMesh.frustumCulled = false
  }

  private createSkyMaterial(
    zenithColor: THREE.Color,
    sunColor: THREE.Color,
    cloudCoverage: number
  ): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        zenithColor: { value: zenithColor },
        horizonColor: { value: new THREE.Color() },
        undergroundColor: { value: new THREE.Color() },
        skyTint: { value: new THREE.Color(1, 1, 1) },
        skyBrightness: { value: 1.0 },
        darkness: { value: 0.0 },
        fogOverrideColor: { value: new THREE.Color() },
        fogOverride: { value: 0.0 },
        sunDirection: { value: new THREE.Vector3(0, 1, 0) },
        sunColor: { value: sunColor },
        cloudNoise: { value: this.cloudTexture },
        cloudOffsetShapes: { value: new THREE.Vector2() },
        cloudOffsetDetail: { value: new THREE.Vector2() },
        cloudCoverage: { value: cloudCoverage },
        cloudTint: { value: new THREE.Color(1, 1, 1) },
        cloudOpacity: { value: 1.0 },
        moonDirection: { value: new THREE.Vector3(0, -1, 0) },
        night: { value: 0.0 },
        twilight: { value: 0.0 },
        twilightColor: { value: new THREE.Color() },
        nightZenith: { value: new THREE.Color() },
        nightHorizon: { value: new THREE.Color() },
        skyTime: { value: 0.0 },
        ...weatherFieldUniforms,
        uFogColor: { value: new THREE.Color() },
        uSkyGrey: { value: 0.0 },
        uWeatherDim: { value: 1.0 },
        uWeatherTint: { value: new THREE.Color(1, 1, 1) },
        uWeatherTintAmount: { value: 0.0 },
        uSunDim: { value: 0.0 },
        uFlash: { value: 0.0 },
        uFlashDir: { value: new THREE.Vector3(0, 1, 0) },
        uRainbow: { value: 0.0 },
        uAurora: { value: 0.0 },
        uMeteors: { value: 0.0 },
        uHeatHaze: { value: 0.0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vLocalPosition;
        void main() {
          // Local position: the dome is centered on the camera, so this is the view direction
          vLocalPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          // Pin to the far plane: drawn after the terrain, the depth test then
          // skips every pixel already covered, and no dome radius can clip it.
          gl_Position.z = gl_Position.w;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 zenithColor;
        uniform vec3 horizonColor;
        uniform vec3 undergroundColor;
        uniform vec3 skyTint;
        uniform float skyBrightness;
        uniform float darkness;
        uniform vec3 fogOverrideColor;
        uniform float fogOverride;
        uniform vec3 sunDirection;
        uniform vec3 sunColor;
        uniform sampler2D cloudNoise;
        uniform vec2 cloudOffsetShapes;
        uniform vec2 cloudOffsetDetail;
        uniform float cloudCoverage;
        uniform vec3 cloudTint;
        uniform float cloudOpacity;
        uniform vec3 moonDirection;
        uniform float night;
        uniform float twilight;
        uniform vec3 twilightColor;
        uniform vec3 nightZenith;
        uniform vec3 nightHorizon;
        uniform float skyTime;
        uniform vec3 uFogColor;
        uniform float uSkyGrey;
        uniform float uWeatherDim;
        uniform vec3 uWeatherTint;
        uniform float uWeatherTintAmount;
        uniform float uSunDim;
        uniform float uFlash;
        uniform vec3 uFlashDir;
        uniform float uRainbow;
        uniform float uAurora;
        uniform float uMeteors;
        uniform float uHeatHaze;
        varying vec3 vLocalPosition;
        #include <common>
        #include <dithering_pars_fragment>
        #define SLOP_WX_STEPS 16
        ${WEATHER_FIELD_GLSL}

        float starHash(vec3 p3) {
          p3 = fract(p3 * 0.1031);
          p3 += dot(p3, p3.zyx + 31.32);
          return fract((p3.x + p3.y) * p3.z);
        }

        vec3 starHash3(vec3 p3) {
          p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
          p3 += dot(p3, p3.yxz + 33.33);
          return fract((p3.xxy + p3.yxx) * p3.zyx);
        }

        // The weather map under the cloud seen along a view direction (cover, darkness; tint): where the
        // ray rises into the weather's deck (WeatherFieldShader)
        vec2 weatherDeckUv(vec3 dir) {
          vec2 level = dir.xz / max(length(dir.xz), 1e-4);
          return (cameraPosition.xz + level * slopWeatherReach(dir)) * slopWxParams.x;
        }

        // Rainbow colour across the bow (0 = inner violet .. 1 = outer red)
        vec3 bowColor(float x) {
          return clamp(vec3(
            1.2 * smoothstep(0.45, 0.95, x) + 0.35 * (1.0 - smoothstep(0.0, 0.25, x)),
            1.0 - abs(x - 0.55) * 2.6,
            1.0 - smoothstep(0.15, 0.5, x)
          ), 0.0, 1.0);
        }

        // A shooting star: slot i, streak brightness along dir
        float meteor(vec3 dir, float i) {
          const float period = 2.6;
          float clock = skyTime + i * 0.917;
          float cycle = floor(clock / period);
          vec3 r = starHash3(vec3(cycle, i * 17.0, 3.0));
          if (r.x > uMeteors * 0.55) return 0.0;
          float s = fract(clock / period) * period;
          const float life = 0.75;
          if (s > life) return 0.0;
          float az = r.y * 6.2832;
          float el = 0.35 + 0.45 * r.z;
          vec3 start = vec3(cos(az) * cos(el), sin(el), sin(az) * cos(el));
          vec3 side = normalize(cross(start, vec3(0.0, 1.0, 0.0)));
          vec3 travel = normalize(side * (r.z - 0.5) * 2.0 - vec3(0.0, 0.55, 0.0));
          vec3 p0 = start;
          vec3 p1 = normalize(start + travel * 0.32);
          float k = s / life;
          vec3 head = normalize(mix(p0, p1, k));
          vec3 tail = normalize(mix(p0, p1, max(0.0, k - 0.3)));
          vec3 seg = head - tail;
          float t = clamp(dot(dir - tail, seg) / max(dot(seg, seg), 1e-6), 0.0, 1.0);
          float d = length(dir - (tail + seg * t));
          float width = 0.0016 + 0.0008 * t;
          float fade = sin(k * 3.1416);
          return (1.0 - smoothstep(width * 0.3, width, d)) * t * t * fade;
        }

        void main() {
          vec3 dir = normalize(vLocalPosition);
          float h = dir.y;
          float aboveHorizon = smoothstep(-0.01, 0.015, h);

          // Gradient: horizon color at and below the horizon (matches the
          // fog), sliding to the night palette after sunset
          vec3 zenith = mix(zenithColor * skyTint, nightZenith, night);
          vec3 horizon = mix(horizonColor, nightHorizon, night);
          vec3 color = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.5));

          // Twilight: a warm band low in the sky, strongest toward the sun
          float toward = 0.5;
          float flatLen = length(dir.xz);
          float sunFlatLen = length(sunDirection.xz);
          if (flatLen > 1e-3 && sunFlatLen > 1e-3) toward = dot(dir.xz / flatLen, sunDirection.xz / sunFlatLen) * 0.5 + 0.5;
          float band = exp(-max(h, 0.0) * 5.0) * smoothstep(-0.3, 0.0, h);
          color += twilightColor * twilight * band * (0.18 + 0.82 * toward * toward);

          // Overcast: the dome greys toward an even cloud-light
          color = mix(color, vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))) * vec3(0.97, 0.99, 1.03), uSkyGrey);

          // Aurora: folded curtains of green and violet light at night
          if (uAurora > 0.0 && night > 0.0 && h > 0.0) {
            float az = atan(dir.x, dir.z);
            float drift = skyTime * 0.012;
            float fold = texture2D(cloudNoise, vec2(az * 0.18 + drift, 0.37)).r;
            float sway = texture2D(cloudNoise, vec2(az * 0.55 - drift * 1.7, 0.71)).g;
            float baseH = 0.1 + 0.22 * fold;
            float above = h - baseH;
            float curtain = smoothstep(-0.015, 0.02, above) * exp(-max(above, 0.0) * 5.0);
            float rays = 0.55 + 0.45 * sin(az * 140.0 + sway * 14.0 + skyTime * 0.35);
            float strength = smoothstep(0.25, 0.7, sway + 0.25);
            vec3 auroraColor = mix(vec3(0.12, 1.0, 0.42), vec3(0.62, 0.22, 1.0), smoothstep(0.02, 0.3, above));
            color += auroraColor * curtain * rays * strength * uAurora * night * 0.42;
          }

          // Stars: one candidate per cell of a grid on the view direction,
          // drawn at least ~1.5 px wide (fwidth) so they never shimmer
          if (night > 0.0 && h > 0.0) {
            vec3 p = dir * 150.0;
            vec3 cell = floor(p);
            float pick = starHash(cell);
            if (pick > 0.9935) {
              vec3 at = starHash3(cell) * 0.4 + 0.3;
              float d = length(fract(p) - at);
              float size = 0.06 + 0.1 * fract(pick * 173.0);
              float radius = max(size, length(fwidth(p)) * 0.9);
              float star = (1.0 - smoothstep(radius * 0.25, radius, d)) * (size * size) / (radius * radius);
              float twinkle = 0.75 + 0.25 * sin(skyTime * (1.5 + 3.0 * fract(pick * 91.0)) + pick * 400.0);
              float bright = 0.7 + 3.5 * pow(fract(pick * 7919.0), 4.0);
              color += vec3(0.82, 0.88, 1.0) * star * bright * twinkle * night * smoothstep(0.03, 0.3, h);
            }
          }

          // Moon: a mottled pale disc with a soft glow, faint by day
          float moonDot = dot(dir, moonDirection);
          if (moonDot > 0.0) {
            float moonShow = (0.12 + 0.88 * night) * aboveHorizon;
            color += vec3(0.55, 0.65, 0.9) * (pow(moonDot, 30.0) * 0.025 + pow(moonDot, 600.0) * 0.12) * night * aboveHorizon;
            float disc = smoothstep(0.99915, 0.99935, moonDot);
            if (disc > 0.0) {
              vec3 tangent = normalize(cross(moonDirection, vec3(0.0, 1.0, 0.001)));
              vec3 bitangent = cross(tangent, moonDirection);
              vec3 onDisc = dir - moonDirection * moonDot;
              vec2 moonUv = vec2(dot(onDisc, tangent), dot(onDisc, bitangent)) / 0.0365;
              float maria = texture2D(cloudNoise, moonUv * 0.28 + vec2(0.31, 0.57)).r;
              float rim = 1.0 - 0.25 * dot(moonUv, moonUv);
              vec3 moonColor = vec3(1.0, 0.98, 0.92) * (0.62 + 0.5 * smoothstep(0.35, 0.75, maria)) * rim * 1.35;
              color = mix(color, moonColor, disc * moonShow);
            }
          }

          // Sun: broad atmospheric glow, tight halo and a soft-edged disc
          // (the disc sets behind the horizon)
          float sunDot = max(dot(dir, sunDirection), 0.0);
          float sunShow = 1.0 - uSunDim;
          color += sunColor * (pow(sunDot, 12.0) * 0.16 + pow(sunDot, 180.0) * 0.55) * (1.0 - night * 0.85) * sunShow;
          color += sunColor * 3.0 * smoothstep(0.99885, 0.99925, sunDot) * aboveHorizon * sunShow;

          // Shooting stars (meteor showers)
          if (uMeteors > 0.0 && night > 0.0 && h > 0.05) {
            float streak = 0.0;
            for (int i = 0; i < 6; i++) streak += meteor(dir, float(i));
            color += vec3(0.9, 0.95, 1.0) * streak * night * 2.5;
          }

          // Rainbow opposite the sun: the primary bow at ~42°, a faint reversed secondary at ~51°
          if (uRainbow > 0.0 && sunDirection.y > 0.0) {
            // A high sun puts a real bow below the horizon: hold the sun at most ~24° up for it
            float sunFlat = max(length(sunDirection.xz), 1e-3);
            float bowElevation = min(asin(clamp(sunDirection.y, -1.0, 1.0)), 0.42);
            vec3 bowSun = vec3(sunDirection.x / sunFlat * cos(bowElevation), sin(bowElevation), sunDirection.z / sunFlat * cos(bowElevation));
            float angle = degrees(acos(clamp(dot(dir, -bowSun), -1.0, 1.0)));
            float primary = (angle - 40.4) / 2.2;
            float secondary = (53.2 - angle) / 3.0;
            vec3 bow = vec3(0.0);
            if (primary > 0.0 && primary < 1.0) bow += bowColor(primary) * sin(primary * 3.1416) * 0.38;
            if (secondary > 0.0 && secondary < 1.0) bow += bowColor(secondary) * sin(secondary * 3.1416) * 0.12;
            color += bow * uRainbow * smoothstep(-0.01, 0.06, h) * (1.0 - night) * smoothstep(0.0, 0.12, sunDirection.y);
          }

          // Clouds: a flat deck intersected by the view ray. Large drifting
          // shapes, eroded at their thin edges by two finer noise layers.
          float flashLight = uFlash * (0.2 + 0.8 * pow(max(dot(dir, uFlashDir), 0.0), 3.0));
          if (h > 0.0) {
            vec2 deck = dir.xz / (h + 0.12);
            // The weather under this patch of cloud: cover, storm darkness, its tint (ash, sand, sulphur)
            vec2 wxUv = weatherDeckUv(dir);
            vec4 wx = texture2D(slopWxMapA, wxUv);
            vec3 wxTint = texture2D(slopWxMapB, wxUv).rgb * ${WEATHER_TINT_SCALE.toFixed(2)};
            float wxCover = wx.a * ${COVER_RANGE.toFixed(2)} - ${COVER_BIAS.toFixed(2)};
            float shapes = texture2D(cloudNoise, deck * 0.22 + cloudOffsetShapes).r;
            float detail = texture2D(cloudNoise, deck * 1.0 + cloudOffsetDetail).g * 0.65
                         + texture2D(cloudNoise, deck * 2.3 - cloudOffsetDetail).r * 0.35;
            float edge = 1.0 - clamp(cloudCoverage + wxCover, 0.0, 1.0);
            float n = shapes - (1.0 - shapes) * detail * 0.4 + 0.10;
            // Soft edges: a wide coverage ramp, never narrower than ~2 px on
            // screen (fwidth), so thin parts are translucent wisps rather than
            // hard cut-outs with a stepped, posterized rim
            float ramp = 0.18 + 1.5 * fwidth(n);
            float density = smoothstep(edge - 0.04, edge - 0.04 + ramp, n);
            // Fade toward the horizon (tiny, aliased features; aerial haze)
            // A full overcast closes the gaps: one mottled sheet
            density = mix(density, 0.97 + 0.03 * density, smoothstep(0.7, 1.0, clamp(cloudCoverage + wxCover, 0.0, 1.0)) * smoothstep(0.6, 0.95, wxCover));
            // (a weather deck far off stays solid down to the horizon: a storm's dark mass over the land)
            float horizonFade = mix(smoothstep(0.03, 0.28, h), smoothstep(0.0, 0.05, h), smoothstep(0.4, 0.9, wxCover));
            density *= horizonFade * 0.96 * mix(cloudOpacity, 1.0, clamp(wxCover, 0.0, 1.0));
            // White thin parts, grey thick bases with a little billow texture;
            // a silver lining toward the sun, mostly on the thin parts
            float thick = smoothstep(edge, edge + 0.32, n);
            vec3 cloudColor = mix(vec3(1.0), vec3(0.70, 0.73, 0.80), thick * (0.8 + 0.2 * detail));
            cloudColor *= mix(vec3(1.0), skyTint, 0.5);
            cloudColor += sunColor * pow(sunDot, 8.0) * 0.35 * (1.0 - 0.6 * thick);
            // Biome cloud colour: grey overcast, dark volcanic ash
            cloudColor *= cloudTint;
            // Weather: storm clouds darken, ash and sulphur colour them
            cloudColor *= mix(vec3(1.0), wxTint * wxTint, clamp(wxCover, 0.0, 1.0)) * (1.0 - 0.68 * wx.b);
            // Lightning lights the clouds from inside
            cloudColor += vec3(0.75, 0.8, 1.0) * flashLight * (0.5 + 0.5 * thick);
            // Dusk lights the cloud bases toward the sun; at night they are
            // dark shapes with a silver edge near the moon
            cloudColor += twilightColor * twilight * (0.15 + 0.6 * toward * toward) * (1.0 - 0.4 * thick);
            cloudColor *= mix(vec3(1.0), vec3(0.03, 0.036, 0.058), night);
            cloudColor += vec3(0.5, 0.56, 0.72) * pow(max(moonDot, 0.0), 10.0) * 0.08 * night * (1.0 - 0.6 * thick);
            color = mix(color, cloudColor, density);
          }

          // Heat shimmer: a bright, rippling mirage band on the horizon
          if (uHeatHaze > 0.0) {
            float band = 1.0 - smoothstep(0.0, 0.045, abs(h - 0.005));
            float ripple = 0.65 + 0.35 * sin(atan(dir.x, dir.z) * 220.0 + skyTime * 2.7) * sin(h * 900.0 - skyTime * 4.1);
            color += vec3(1.0, 0.94, 0.82) * band * ripple * uHeatHaze * 0.14 * (1.0 - night);
          }

          // Weather over the whole dome: storm dimming, then the weather's tint; lightning
          color *= uWeatherDim;
          color += vec3(0.6, 0.65, 0.8) * flashLight * 0.35;

          color *= skyBrightness;
          // Underground: fade to the (biome) underground color
          color = mix(color, undergroundColor, darkness);
          color *= mix(vec3(1.0), uWeatherTint, uWeatherTintAmount);
          // The weather far off along this ray (rain walls, sandstorms, fog banks: like the land's edge
          // in front of it), then the weather here
          vec4 wxFar = slopWeatherFar(cameraPosition, dir, ${WEATHER_MARCH_MAX.toFixed(1)});
          color = color * (1.0 - wxFar.a) + wxFar.rgb;
          color = mix(color, uFogColor, slopWeatherNear(${WEATHER_MARCH_MAX.toFixed(1)}));
          // Inside a liquid the sky is beyond the (short) liquid fog's far end
          color = mix(color, fogOverrideColor, fogOverride);
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          // Sub-LSB noise: smooth, dim gradients (overcast or hazy skies) band
          // visibly in 8 bits otherwise
          #include <dithering_fragment>
        }
      `,
      side: THREE.BackSide, // Render inside of sphere
      depthWrite: false,
      fog: false,
      dithering: true,
    })
  }

  /**
   * While the distance fog is overridden (camera inside a liquid), show the
   * override's fog color instead of the sky: everything beyond the liquid
   * fog's far end is fog, and the sky seen up through a water surface would
   * otherwise stay bright and unfogged. Null restores the sky.
   */
  setFogOverride(color: THREE.Color | null): void {
    const u = this.skyMaterial.uniforms
    u.fogOverride.value = color ? 1 : 0
    if (color) (u.fogOverrideColor.value as THREE.Color).copy(color)
  }

  /** Set the sun direction (normalized internally) to match the directional light. */
  setSunDirection(direction: THREE.Vector3): void {
    ;(this.skyMaterial.uniforms.sunDirection.value as THREE.Vector3).copy(direction).normalize()
  }

  /**
   * Follow the time of day: sun and moon, twilight glow, the night palette
   * and stars (read every update; the state object is kept, not copied).
   */
  setDayNight(state: DayNightState | null): void {
    this.dayNight = state
  }

  /**
   * The final displayed horizon color (linear): the tinted/hazed horizon with
   * biome brightness and underground darkness applied - exactly what the dome
   * shows at and below the horizon, so distance fog blends into the sky.
   */
  getHorizonColor(target: THREE.Color): THREE.Color {
    return this.horizon(target, true)
  }

  /** The horizon colour as displayed, with or without the weather at the player. */
  private horizon(target: THREE.Color, withWeather: boolean): THREE.Color {
    const a = this.atmosphere
    target.copy(a.horizonColor)
    const dn = this.dayNight
    if (dn) {
      target.lerp(dn.nightHorizon, dn.night)
      target.r += dn.twilightColor.r * dn.twilight * TWILIGHT_FOG_SHARE
      target.g += dn.twilightColor.g * dn.twilight * TWILIGHT_FOG_SHARE
      target.b += dn.twilightColor.b * dn.twilight * TWILIGHT_FOG_SHARE
    }
    // The same weather steps as the dome's horizon (see the shader)
    const w = withWeather ? this.weather : null
    if (w) {
      const luma = (0.2126 * target.r + 0.7152 * target.g + 0.0722 * target.b) * w.skyGrey
      target.setRGB(
        target.r * (1 - w.skyGrey) + luma * 0.97,
        target.g * (1 - w.skyGrey) + luma * 0.99,
        target.b * (1 - w.skyGrey) + luma * 1.03,
      )
      const flash = w.flash * 0.2 * 0.35
      target.multiplyScalar(w.dim)
      target.r += 0.6 * flash
      target.g += 0.65 * flash
      target.b += 0.8 * flash
    }
    target.multiplyScalar(a.skyBrightness).lerp(this.undergroundColor(), this.darkness)
    if (w && w.tintAmount > 0) {
      target.r *= 1 + (w.tint.r - 1) * w.tintAmount
      target.g *= 1 + (w.tint.g - 1) * w.tintAmount
      target.b *= 1 + (w.tint.b - 1) * w.tintAmount
    }
    return target
  }

  /** Show the weather (null: none). Read every update; the object is kept, not copied. */
  setWeather(weather: SkyWeather | null): void {
    this.weather = weather
  }

  /** The wind the clouds drift with: direction it blows toward (x, z) and strength 0-1. */
  setWind(dirX: number, dirZ: number, strength: number): void {
    this.windDir.set(dirX, dirZ)
    this.windStrength = strength
  }

  /**
   * In a cave: the sky and fog darken toward this cave's fog colour as the
   * camera goes underground (`factor` 0-1, from sky light - see
   * caves/CaveAtmosphere.ts), whatever its height.
   */
  setCaveUnderground(factor: number, color: THREE.Color): void {
    this.caveFactor = factor
    this.caveColor.copy(color)
  }

  /** The biome's underground colour, blended toward the cave's while in one. */
  private undergroundColor(): THREE.Color {
    return this.mixedUnderground.copy(this.atmosphere.undergroundColor).lerp(this.caveColor, this.caveFactor)
  }

  /** Call each frame to keep the dome centered on the camera and apply the atmosphere. */
  update(camera: THREE.Camera, deltaTime: number = 0.016): void {
    const cameraPos = camera.position
    this.skyMesh.position.copy(cameraPos)

    // Y-based darkness (dark below darknessEndY, normal above darknessStartY),
    // or the cave factor when deeper underground by sky light
    this.darkness = Math.max(
      this.caveFactor,
      Math.min(1, (this.darknessStartY - cameraPos.y) / (this.darknessStartY - this.darknessEndY))
    )

    const u = this.skyMaterial.uniforms
    const a = this.atmosphere
    u.darkness.value = this.darkness
    u.skyBrightness.value = a.skyBrightness
    ;(u.skyTint.value as THREE.Color).copy(a.skyTint)
    ;(u.horizonColor.value as THREE.Color).copy(a.horizonColor)
    ;(u.undergroundColor.value as THREE.Color).copy(this.undergroundColor())
    u.cloudCoverage.value = a.cloudCoverage
    u.cloudOpacity.value = a.cloudOpacity
    ;(u.cloudTint.value as THREE.Color).copy(a.cloudTint)

    const dn = this.dayNight
    if (dn) {
      ;(u.sunDirection.value as THREE.Vector3).copy(dn.sunDirection)
      ;(u.moonDirection.value as THREE.Vector3).copy(dn.moonDirection)
      ;(u.sunColor.value as THREE.Color).copy(dn.sunColor)
      ;(u.twilightColor.value as THREE.Color).copy(dn.twilightColor)
      ;(u.nightZenith.value as THREE.Color).copy(dn.nightZenith)
      ;(u.nightHorizon.value as THREE.Color).copy(dn.nightHorizon)
      u.night.value = dn.night
      u.twilight.value = dn.twilight
    }
    this.skyTime = (this.skyTime + deltaTime) % 1000
    u.skyTime.value = this.skyTime

    const w = this.weather
    // The weather here (the near part of every ray) is the fog's colour; the weather far off colours
    // itself from the horizon without it
    this.getHorizonColor(u.uFogColor.value as THREE.Color)
    this.horizon(this.baseHorizon, false)
    weatherFieldSky.x = this.baseHorizon.r
    weatherFieldSky.y = this.baseHorizon.g
    weatherFieldSky.z = this.baseHorizon.b
    if (w) {
      u.uSkyGrey.value = w.skyGrey
      u.uWeatherDim.value = w.dim
      ;(u.uWeatherTint.value as THREE.Color).copy(w.tint)
      u.uWeatherTintAmount.value = w.tintAmount * (1 - this.caveFactor)
      u.uSunDim.value = w.sunDim
      u.uFlash.value = w.flash
      ;(u.uFlashDir.value as THREE.Vector3).copy(w.flashDir)
      u.uRainbow.value = w.rainbow
      u.uAurora.value = w.aurora
      u.uMeteors.value = w.meteors
      u.uHeatHaze.value = w.heatHaze
    }

    // Drift the cloud layers with the wind; offsets wrap (the noise tiles) to keep precision
    const shapes = u.cloudOffsetShapes.value as THREE.Vector2
    const detail = u.cloudOffsetDetail.value as THREE.Vector2
    const speed = (CLOUD_DRIFT_CALM + CLOUD_DRIFT_GALE * this.windStrength) * deltaTime
    // Deck uv grows away from the camera along the view; moving the texture by -wind moves clouds with it
    shapes.addScaledVector(this.windDir, -speed)
    detail.addScaledVector(this.windDir, -speed * CLOUD_DETAIL_SPEEDUP)
    shapes.set(shapes.x % 1, shapes.y % 1)
    detail.set(detail.x % 1, detail.y % 1)
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.skyMesh)
  }

  removeFrom(scene: THREE.Scene): void {
    scene.remove(this.skyMesh)
  }

  dispose(): void {
    this.skyMesh.geometry.dispose()
    this.skyMaterial.dispose()
    this.cloudTexture.dispose()
  }
}
