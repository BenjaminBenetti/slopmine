import * as THREE from 'three'
import { mergeTaggedParts } from '../model_shared/mergeTaggedParts.ts'
import type { BlockFace, IBlockMeshPart, IBlockProperties, IMultiMeshBlock } from '../../../interfaces/IBlock.ts'
import type { IItem } from '../../../../items/Item.ts'
import { TransparentBlock } from '../../Block.ts'
import { BlockIds } from '../../BlockIds.ts'
import { BlockTags } from '../../tags/BlockTags.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import { PlantBlockItem } from '../../../../items/blocks/plants/PlantBlockItem.ts'
import { cellBox, withMaterialIndex } from '../cocytus_shared/CrossSpriteGeometry.ts'
import { windUniform } from '../../../../renderer/WindUniform.ts'
import { glowTimeUniform } from '../../../../renderer/glowClock.ts'

// Model (cell space 0..1 for the static parts): an iron post on a base
// plate, a fixed copper cross of arms with verdigris knobs at the ends, and
// on top a copper arrow with a tail fin that turns with the wind.
// Static material groups: 0 = iron, 1 = copper, 2 = verdigris
const IRON = 0
const COPPER = 1
const PATINA = 2

const staticParts = [
  cellBox(0.3, 0, 0.3, 0.4, 0.06, 0.4, IRON), // base plate
  cellBox(0.465, 0.06, 0.465, 0.07, 0.74, 0.07, IRON), // post
  cellBox(0.18, 0.52, 0.475, 0.64, 0.04, 0.05, COPPER), // cross arms
  cellBox(0.475, 0.52, 0.18, 0.05, 0.04, 0.64, COPPER),
  cellBox(0.13, 0.505, 0.465, 0.07, 0.07, 0.07, PATINA), // knobs at the arm ends
  cellBox(0.8, 0.505, 0.465, 0.07, 0.07, 0.07, PATINA),
  cellBox(0.465, 0.505, 0.13, 0.07, 0.07, 0.07, PATINA),
  cellBox(0.465, 0.505, 0.8, 0.07, 0.07, 0.07, PATINA),
  cellBox(0.45, 0.8, 0.45, 0.1, 0.04, 0.1, COPPER), // pivot cap
]

// The arrow, centred on the post's axis, pointing +X (cell-centred space,
// -0.5..0.5). Groups: 0 = bright copper, 1 = verdigris fin
const ARROW = 0
const FIN = 1
const ARROW_Y = 0.36

function arrowBox(x0: number, x1: number, sy: number, sz: number, yOffset: number, materialIndex: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(x1 - x0, sy, sz)
  geo.translate((x0 + x1) / 2, ARROW_Y + yOffset, 0)
  return withMaterialIndex(geo, materialIndex)
}

const arrowParts = [
  arrowBox(-0.36, 0.3, 0.035, 0.035, 0, ARROW), // shaft
  arrowBox(0.28, 0.35, 0.035, 0.17, 0, ARROW), // arrowhead, widest to the tip
  arrowBox(0.35, 0.4, 0.035, 0.11, 0, ARROW),
  arrowBox(0.4, 0.44, 0.035, 0.05, 0, ARROW),
  arrowBox(-0.03, 0.03, 0.07, 0.06, -0.01, ARROW), // hub
  arrowBox(-0.44, -0.24, 0.17, 0.02, 0.04, FIN), // tail fin: an upright plate that catches the wind
  arrowBox(-0.46, -0.4, 0.09, 0.02, 0.1, FIN),
]

const ironMaterial = new THREE.MeshLambertMaterial({ color: 0x45454c })
const copperMaterial = new THREE.MeshLambertMaterial({ color: 0xc26b3c })
const patinaMaterial = new THREE.MeshLambertMaterial({ color: 0x4fa38a })
const arrowMaterial = new THREE.MeshLambertMaterial({ color: 0xd8854e })
const finMaterial = new THREE.MeshLambertMaterial({ color: 0x5cb094 })

/**
 * GLSL: turn the arrow (local +X) about the instance's vertical axis so its
 * head points INTO the wind (toward where it blows from, like a real vane:
 * the tail fin swings downwind). The world angle is corrected for the
 * instance's own facing rotation, and the arrow wavers a little more as the
 * wind rises.
 */
const VANE_PARS = /* glsl */ `
uniform vec3 uVaneWind;
uniform float uVaneTime;
vec3 slopVaneTurn( vec3 p ) {
  vec2 into = -uVaneWind.xy;
  // Rotation about Y taking +X to (into.x, 0, into.y) in world space
  float world = atan( -into.y, into.x );
  float facing = atan( -instanceMatrix[ 0 ].z, instanceMatrix[ 0 ].x );
  vec3 at = instanceMatrix[ 3 ].xyz;
  float phase = at.x * 1.7 + at.z * 2.3;
  float wobble = ( sin( uVaneTime * 2.1 + phase ) * 0.6 + sin( uVaneTime * 5.3 + phase * 1.3 ) * 0.4 ) * ( 0.05 + 0.22 * uVaneWind.z );
  float a = world - facing + wobble;
  float c = cos( a );
  float s = sin( a );
  return vec3( c * p.x + s * p.z, p.y, -s * p.x + c * p.z );
}
`

/** Patch an arrow material: instanced draws turn with the wind; displays (icons, held) keep the rest pose. */
function turnWithWind(material: THREE.Material): void {
  material.onBeforeCompile = (shader) => {
    if (!shader.instancing) return
    shader.uniforms.uVaneWind = windUniform
    shader.uniforms.uVaneTime = glowTimeUniform
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VANE_PARS}`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  objectNormal = slopVaneTurn( objectNormal );')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed = slopVaneTurn( transformed );')
  }
  material.customProgramCacheKey = () => 'slopmine-weathervane-arrow-v1'
}
turnWithWind(arrowMaterial)
turnWithWind(finMaterial)

/** Chunk meshes: the fixed vane, and the arrow apart (turned in its shader; kept out of shadow maps, whose depth pass would draw it unturned). */
const chunkParts: IBlockMeshPart[] = [
  { geometry: mergeTaggedParts(staticParts), material: [ironMaterial, copperMaterial, patinaMaterial] },
  { geometry: mergeTaggedParts(arrowParts), material: [arrowMaterial, finMaterial], castShadow: false },
]

/** Item displays (icon, held, dropped): one geometry, the arrow at rest. */
const displayGeometry = mergeTaggedParts([
  ...staticParts.map((g) => g.clone()),
  ...arrowParts.map((g) => withMaterialIndex(g.clone(), g.groups[0].materialIndex! + 3)),
])
const displayMaterials = [ironMaterial, copperMaterial, patinaMaterial, arrowMaterial, finMaterial]

const COLLISION = new THREE.Box3(new THREE.Vector3(0.42, 0, 0.42), new THREE.Vector3(0.58, 0.84, 0.58))
const INTERACTION = new THREE.Box3(new THREE.Vector3(0.12, 0, 0.12), new THREE.Vector3(0.88, 0.96, 0.88))

/**
 * Weathervane - an iron post with a fixed copper compass cross and a copper
 * arrow on top that swings to point into the wind (the weather's shared
 * wind, WindUniform.ts), wavering more as it blows harder. Crafted from
 * copper, an iron bar and a stick.
 */
export class WeathervaneBlock extends TransparentBlock implements IMultiMeshBlock {
  readonly properties: IBlockProperties = {
    id: BlockIds.WEATHERVANE,
    name: 'weathervane',
    isOpaque: false,
    isSolid: true,
    isLiquid: false,
    hardness: 1.5,
    lightLevel: 0,
    lightBlocking: 0,
    demolitionForceRequired: 1,
    tags: [BlockTags.ROCK],
  }

  protected get defaultTextureId(): number {
    return TextureId.WEATHERVANE
  }

  protected getGeometry(): THREE.BufferGeometry {
    return displayGeometry
  }

  protected getMaterials(): THREE.Material[] {
    return displayMaterials
  }

  getMultiMeshParts(): IBlockMeshPart[] {
    return chunkParts
  }

  shouldRenderFace(_face: BlockFace): boolean {
    return true
  }

  isGreedyMeshable(): boolean {
    return false
  }

  getCollisionBox(): THREE.Box3 | null {
    return COLLISION
  }

  getInteractionBox(_metadata: number): THREE.Box3 {
    return INTERACTION
  }

  getDrops(): IItem[] {
    return [new PlantBlockItem('weathervane', 'Weathervane')]
  }
}
