import * as THREE from 'three'

/**
 * Creates a simple hand mesh for when no item is held.
 * Renders as a rectangular arm/hand in a skin-tone color.
 */
export function createHandMesh(): THREE.Object3D {
  const group = new THREE.Group()

  // Arm segment (forearm)
  const armGeometry = new THREE.BoxGeometry(0.12, 0.35, 0.12)
  const skinMaterial = new THREE.MeshLambertMaterial({ color: 0xc9a07c })
  const arm = new THREE.Mesh(armGeometry, skinMaterial)

  // Position arm so it extends from bottom-right
  arm.position.set(0, 0, 0)

  // Rotate arm to extend forward from player (like reaching out)
  arm.rotation.x = -Math.PI / 3 // Tilt forward (~60 degrees)
  arm.rotation.z = 0 // Point straight forward

  group.add(arm)

  return group
}
