import * as THREE from 'three'
import { loadBlockTexture } from '../../../../renderer/TextureLoader.ts'
import { registerTextureUrl } from '../../../../renderer/TextureAtlas.ts'
import { TextureId } from '../../FaceTextureRegistry.ts'
import texUrl from './assets/prism-cluster.webp'

registerTextureUrl(TextureId.PRISM_CLUSTER, texUrl)

const texture = loadBlockTexture(texUrl)

/**
 * Shared material of both prism cluster blocks: an alpha-cutout cross sprite
 * whose crystal texels glow (emissive map = the texture itself), so clusters
 * read as points of light on a dark cavern floor even where the world light
 * is low.
 */
export const prismClusterMaterial = new THREE.MeshLambertMaterial({
  map: texture,
  emissiveMap: texture,
  emissive: new THREE.Color(0xffffff),
  emissiveIntensity: 0.55,
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
})

/** Visual height / width of the cluster sprite (fractions of a block). */
export const CLUSTER_HEIGHT = 0.8
export const CLUSTER_WIDTH = 0.9

/**
 * Two crossed diagonal planes. `hanging` flips the sprite vertically and
 * anchors it to the top of the cell (a cluster growing down from a ceiling).
 */
export function createClusterGeometry(hanging: boolean): THREE.BufferGeometry {
  const w = CLUSTER_WIDTH * 0.5
  const bottom = hanging ? 0.5 - CLUSTER_HEIGHT : -0.5
  const top = bottom + CLUSTER_HEIGHT
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -w, bottom, -w, w, bottom, w, w, top, w,
    -w, bottom, -w, w, top, w, -w, top, -w,
    -w, bottom, w, w, bottom, -w, w, top, -w,
    -w, bottom, w, w, top, -w, -w, top, w,
  ]), 3))
  const v0 = hanging ? 1 : 0
  const v1 = hanging ? 0 : 1
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
    0, v0, 1, v0, 1, v1,
    0, v0, 1, v1, 0, v1,
    0, v0, 1, v0, 1, v1,
    0, v0, 1, v1, 0, v1,
  ]), 2))
  geo.computeVertexNormals()
  return geo
}
