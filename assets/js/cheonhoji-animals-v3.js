import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js";

function mat(color, roughness = 0.88) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

function addMesh(parent, geometry, material, name, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.position.set(...position);
  object.scale.set(...scale);
  object.rotation.set(...rotation);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function blob(parent, material, name, position, scale, segments = 48) {
  return addMesh(parent, new THREE.SphereGeometry(1, segments, Math.max(20, segments / 2)), material, name, position, scale);
}

function capsule(parent, material, name, position, radius, length, rotation = [0, 0, 0], scale = [1, 1, 1]) {
  return addMesh(parent, new THREE.CapsuleGeometry(radius, length, 12, 28), material, name, position, scale, rotation);
}

function makePivot(parent, name, position) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(...position);
  parent.add(group);
  return group;
}

function curve(parent, material, name, points, radius = 0.012) {
  const path = new THREE.CatmullRomCurve3(points);
  return addMesh(parent, new THREE.TubeGeometry(path, 24, radius, 8, false), material, name, [0, 0, 0]);
}

function softEye(parent, x, y, z, scale = 1) {
  const iris = mat(0x241c18, 0.58);
  const shine = mat(0xfffbf4, 0.52);
  blob(parent, iris, "Eye", [x, y, z], [0.125 * scale, 0.155 * scale, 0.070 * scale], 36);
  blob(parent, shine, "EyeShine", [x - 0.032 * scale, y + 0.047 * scale, z + 0.061 * scale], [0.031 * scale, 0.039 * scale, 0.014 * scale], 18);
}

export function createOtterV3() {
  const root = new THREE.Group();
  root.name = "Cheonhoji_Otter_V3";

  const fur = mat(0xb97f61);
  const furDark = mat(0x795043);
  const cream = mat(0xf7e8d2);
  const face = mat(0x392a24, 0.72);
  const blush = mat(0xd98b78, 0.92);

  // One soft silhouette: large head, short body, tiny limbs.
  const body = blob(root, fur, "Body", [0, 1.23, 0], [0.78, 1.05, 0.64], 56);
  blob(root, cream, "Belly", [0, 1.27, 0.603], [0.48, 0.66, 0.050], 44);

  blob(root, furDark, "EarLeft", [-0.61, 2.55, 0.02], [0.22, 0.24, 0.16], 36);
  blob(root, furDark, "EarRight", [0.61, 2.55, 0.02], [0.22, 0.24, 0.16], 36);
  const head = blob(root, fur, "Head", [0, 2.33, 0.06], [0.89, 0.72, 0.68], 64);

  // Broad cream muzzle prevents the eyes and mouth from reading like a human face.
  blob(root, cream, "Muzzle", [0, 2.15, 0.668], [0.54, 0.32, 0.085], 48);
  blob(root, cream, "BrowLeft", [-0.33, 2.55, 0.639], [0.13, 0.12, 0.040], 28);
  blob(root, cream, "BrowRight", [0.33, 2.55, 0.639], [0.13, 0.12, 0.040], 28);
  softEye(root, -0.31, 2.37, 0.695, 0.92);
  softEye(root, 0.31, 2.37, 0.695, 0.92);
  blob(root, face, "Nose", [0, 2.20, 0.774], [0.115, 0.080, 0.060], 28);
  curve(root, face, "Smile", [
    new THREE.Vector3(-0.115, 2.095, 0.758),
    new THREE.Vector3(0, 2.045, 0.779),
    new THREE.Vector3(0.115, 2.095, 0.758),
  ], 0.012);
  blob(root, blush, "CheekLeft", [-0.50, 2.17, 0.676], [0.095, 0.055, 0.018], 22);
  blob(root, blush, "CheekRight", [0.50, 2.17, 0.676], [0.095, 0.055, 0.018], 22);

  const leftArm = makePivot(root, "LeftArmPivot", [-0.64, 1.67, 0.05]);
  const rightArm = makePivot(root, "RightArmPivot", [0.64, 1.67, 0.05]);
  capsule(leftArm, fur, "LeftArm", [-0.02, -0.35, 0.10], 0.19, 0.45, [0, 0, -0.08], [1, 1, 0.90]);
  capsule(rightArm, fur, "RightArm", [0.02, -0.35, 0.10], 0.19, 0.45, [0, 0, 0.08], [1, 1, 0.90]);

  const leftLeg = makePivot(root, "LeftLegPivot", [-0.31, 0.45, 0.02]);
  const rightLeg = makePivot(root, "RightLegPivot", [0.31, 0.45, 0.02]);
  blob(leftLeg, furDark, "LeftFoot", [-0.03, -0.23, 0.20], [0.34, 0.19, 0.39], 40);
  blob(rightLeg, furDark, "RightFoot", [0.03, -0.23, 0.20], [0.34, 0.19, 0.39], 40);

  const tail = makePivot(root, "TailPivot", [0.42, 0.72, -0.34]);
  capsule(tail, furDark, "TailBase", [0.35, 0.02, -0.13], 0.26, 0.55, [0.12, 0, -0.96], [1, 1, 0.82]);
  capsule(tail, furDark, "TailTip", [0.80, 0.01, -0.24], 0.20, 0.48, [0.04, 0, -1.30], [1, 1, 0.78]);

  root.userData.parts = { leftArm, rightArm, leftLeg, rightLeg, tail, body, head };
  return root;
}

function shellTileOnSurface(parent, material, seam, shellShape, tile, side) {
  const [x, y, sx, sy, rotation] = tile;
  const dx = (x - shellShape.cx) / shellShape.rx;
  const dy = (y - shellShape.cy) / shellShape.ry;
  const radial = Math.max(0.02, 1 - dx * dx - dy * dy);
  const z = side * shellShape.rz * Math.sqrt(radial);
  const normal = new THREE.Vector3(
    (x - shellShape.cx) / (shellShape.rx * shellShape.rx),
    (y - shellShape.cy) / (shellShape.ry * shellShape.ry),
    z / (shellShape.rz * shellShape.rz)
  ).normalize();
  const tangent = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  const twist = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), side * rotation);

  const seamPlate = blob(parent, seam, "ShellTileSeam", [
    x + normal.x * 0.012,
    y + normal.y * 0.012,
    z + normal.z * 0.012,
  ], [sx * 1.065, sy * 1.065, 0.024], 32);
  seamPlate.quaternion.copy(tangent).multiply(twist);

  const plate = blob(parent, material, "ShellTile", [
    x + normal.x * 0.026,
    y + normal.y * 0.026,
    z + normal.z * 0.026,
  ], [sx, sy, 0.025], 32);
  plate.quaternion.copy(tangent).multiply(twist);
}

function turtleSpot(parent, material, position, size) {
  blob(parent, material, "Spot", position, [size, size * 0.78, 0.018], 18);
}

export function createTurtleV3() {
  const root = new THREE.Group();
  root.name = "Cheonhoji_Turtle_V3";

  const skin = mat(0xa7b85d);
  const skinLight = mat(0xc7cf82);
  const spot = mat(0x788b47);
  const shell = mat(0x8f4c43);
  const tileA = mat(0xa65a50);
  const tileB = mat(0x995047);
  const seam = mat(0x704039);
  const belly = mat(0xead99e);
  const face = mat(0x342c25, 0.72);

  // The shell is a closed ellipsoid around the entire torso. Only a narrow
  // pale plastron remains visible from underneath.
  const shellShape = { cx: 0.08, cy: 0.96, rx: 1.20, ry: 0.88, rz: 0.70 };
  blob(root, belly, "Plastron", [0.03, 0.48, 0], [0.88, 0.24, 0.54], 52);
  const shellBody = blob(root, shell, "Shell", [shellShape.cx, shellShape.cy, 0], [shellShape.rx, shellShape.ry, shellShape.rz], 64);

  // Six broad, low-contrast plates instead of many reptile-like scales.
  const shellTiles = [
    { data: [-0.48, 1.25, 0.34, 0.26, -0.08], material: tileA },
    { data: [0.02, 1.42, 0.39, 0.28, 0], material: tileB },
    { data: [0.54, 1.25, 0.34, 0.26, 0.08], material: tileA },
    { data: [-0.50, 0.89, 0.36, 0.24, 0.08], material: tileB },
    { data: [0.03, 0.94, 0.39, 0.26, 0], material: tileA },
    { data: [0.57, 0.89, 0.35, 0.23, -0.08], material: tileB },
  ];
  shellTiles.forEach(({ data, material }) => {
    shellTileOnSurface(root, material, seam, shellShape, data, 1);
    shellTileOnSurface(root, material, seam, shellShape, data, -1);
  });

  capsule(root, skin, "Neck", [-1.02, 0.86, 0], 0.25, 0.34, [0, 0, Math.PI / 2], [1, 1, 0.92]);
  const head = blob(root, skin, "Head", [-1.38, 1.00, 0.03], [0.49, 0.44, 0.41], 52);
  blob(root, skinLight, "Muzzle", [-1.70, 0.91, 0.09], [0.23, 0.19, 0.27], 36);
  softEye(root, -1.54, 1.14, 0.397, 0.84);
  blob(root, face, "Nostril", [-1.84, 0.98, 0.245], [0.020, 0.026, 0.013], 14);
  curve(root, face, "Smile", [
    new THREE.Vector3(-1.85, 0.83, 0.280),
    new THREE.Vector3(-1.71, 0.79, 0.339),
    new THREE.Vector3(-1.55, 0.82, 0.376),
  ], 0.012);
  turtleSpot(root, spot, [-1.66, 1.29, 0.357], 0.055);
  turtleSpot(root, spot, [-1.49, 1.34, 0.382], 0.045);
  turtleSpot(root, spot, [-1.78, 1.23, 0.292], 0.039);

  const limbs = {};
  [
    ["FrontNear", -0.62, 0.56, 0.43, -0.35, 0.28],
    ["FrontFar", -0.62, 0.57, -0.38, -0.22, 0.20],
    ["BackNear", 0.70, 0.56, 0.42, 0.38, -0.24],
    ["BackFar", 0.70, 0.57, -0.38, 0.26, -0.18],
  ].forEach(([name, x, y, z, dx, rz]) => {
    const limb = makePivot(root, `${name}Pivot`, [x, y, z]);
    const front = name.startsWith("Front");
    capsule(limb, skin, name, [dx * 0.45, -0.19, 0], 0.22, 0.39, [0, 0, rz], [1, 1, 0.72]);
    blob(limb, skinLight, `${name}Flipper`, [front ? -0.35 : 0.36, -0.38, 0.03], [0.38, 0.16, 0.26], 36);
    if (z > 0) {
      turtleSpot(limb, spot, [front ? -0.42 : 0.43, -0.35, 0.285], 0.050);
      turtleSpot(limb, spot, [front ? -0.28 : 0.29, -0.43, 0.286], 0.038);
    }
    limbs[name] = limb;
  });

  const tail = makePivot(root, "TailPivot", [1.12, 0.72, 0]);
  addMesh(tail, new THREE.ConeGeometry(0.13, 0.43, 24), skin, "Tail", [0.21, -0.01, 0], [1, 1, 0.82], [0, 0, -Math.PI / 2]);

  root.userData.parts = { ...limbs, tail, shell: shellBody, head };
  return root;
}

export function disposeAnimalV3(root) {
  root.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((entry) => entry.dispose());
    }
  });
}
