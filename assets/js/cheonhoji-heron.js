import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js";

function material(color, roughness = 0.76, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function addMesh(parent, geometry, mat, name, position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0]) {
  const object = new THREE.Mesh(geometry, mat);
  object.name = name;
  object.position.set(...position);
  object.scale.set(...scale);
  object.rotation.set(...rotation);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function ellipsoid(parent, mat, name, position, scale, segments = 48) {
  return addMesh(
    parent,
    new THREE.SphereGeometry(1, segments, Math.max(24, segments / 2)),
    mat,
    name,
    position,
    scale
  );
}

function tube(parent, points, radius, mat, name, radialSegments = 14) {
  const curve = new THREE.CatmullRomCurve3(points);
  return addMesh(
    parent,
    new THREE.TubeGeometry(curve, Math.max(32, points.length * 14), radius, radialSegments, false),
    mat,
    name
  );
}

function taperedBetween(parent, start, end, radius, mat, name, flatten = 1) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  const object = addMesh(
    parent,
    new THREE.ConeGeometry(radius, length, 24, 1, false),
    mat,
    name,
    midpoint.toArray(),
    [1, 1, flatten]
  );
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return object;
}

function wingSurface(side, white, underside) {
  const sign = side === "left" ? 1 : -1;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0.12, 0.48, 0.42, 1.18, 0.90, 1.62);
  shape.bezierCurveTo(1.18, 1.88, 1.46, 1.98, 1.64, 1.84);
  shape.bezierCurveTo(1.80, 1.68, 1.68, 1.39, 1.50, 1.13);
  shape.bezierCurveTo(1.32, 0.86, 1.06, 0.58, 0.76, 0.34);
  shape.bezierCurveTo(0.48, 0.12, 0.18, -0.05, 0, 0);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.055,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.035,
    bevelThickness: 0.025,
    curveSegments: 24,
  });
  geometry.center();
  const surfaceMaterial = white.clone();
  surfaceMaterial.side = THREE.DoubleSide;
  const wing = new THREE.Mesh(geometry, surfaceMaterial);
  wing.name = `${side}_WingSurface`;
  wing.position.set(-0.10, 2.14, sign * 0.73);
  wing.rotation.y = sign > 0 ? -1.25 : 1.25;
  wing.rotation.z = sign > 0 ? -0.10 : 0.10;
  wing.scale.set(1.0, 1.08, 1);
  wing.castShadow = true;
  wing.receiveShadow = true;

  const group = new THREE.Group();
  group.name = `${side}_Wing`;
  group.add(wing);

  tube(
    group,
    [
      new THREE.Vector3(-0.56, 1.77, sign * 0.28),
      new THREE.Vector3(-0.20, 2.27, sign * 0.73),
      new THREE.Vector3(0.22, 3.05, sign * 1.43),
    ],
    0.115,
    underside,
    `${side}_WingLeadingEdge`,
    12
  );

  const featherTips = [
    [0.70, 2.72, sign * 1.70],
    [0.84, 2.50, sign * 1.62],
    [0.91, 2.27, sign * 1.50],
    [0.94, 2.05, sign * 1.36],
    [0.91, 1.85, sign * 1.20],
    [0.82, 1.68, sign * 1.01],
    [0.70, 1.56, sign * 0.81],
  ];
  featherTips.forEach((values, index) => {
    const tip = new THREE.Vector3(...values);
    const base = new THREE.Vector3(
      -0.08 + index * 0.065,
      2.43 - index * 0.08,
      sign * (0.72 + index * 0.035)
    );
    taperedBetween(group, base, tip, 0.13 - index * 0.006, index < 3 ? white : underside, `${side}_PrimaryFeather_${index + 1}`, 0.48);
  });

  for (let index = 0; index < 5; index += 1) {
    const start = new THREE.Vector3(-0.43 + index * 0.19, 2.03 + index * 0.12, sign * (0.43 + index * 0.19));
    const end = new THREE.Vector3(-0.12 + index * 0.17, 2.55 + index * 0.13, sign * (0.72 + index * 0.20));
    taperedBetween(group, start, end, 0.105, underside, `${side}_SecondaryFeather_${index + 1}`, 0.55);
  }

  return group;
}

export function createHeron() {
  const root = new THREE.Group();
  root.name = "GreatEgret";

  const white = material(0xf7f7f1, 0.86);
  const warmWhite = material(0xe8e8e1, 0.9);
  const featherShade = material(0xd4d8d7, 0.9);
  const beak = material(0xe9a52d, 0.62);
  const beakDark = material(0xb96c1d, 0.7);
  const eye = material(0x111614, 0.35);
  const iris = material(0xe7d647, 0.5);
  const leg = material(0x1c2523, 0.68);

  ellipsoid(root, white, "Body", [0, 1.56, 0], [1.12, 0.55, 0.52], 56);
  ellipsoid(root, warmWhite, "Chest", [-0.66, 1.63, 0], [0.56, 0.48, 0.46], 48);
  ellipsoid(root, featherShade, "TailBase", [0.88, 1.52, 0], [0.54, 0.27, 0.31], 40);

  for (let index = 0; index < 5; index += 1) {
    const spread = (index - 2) * 0.09;
    taperedBetween(
      root,
      new THREE.Vector3(0.68, 1.54 + Math.abs(spread) * 0.25, spread),
      new THREE.Vector3(1.55 + (2 - Math.abs(index - 2)) * 0.08, 1.46 - Math.abs(spread) * 0.2, spread * 1.8),
      0.14,
      index % 2 ? warmWhite : white,
      `TailFeather_${index + 1}`,
      0.55
    );
  }

  tube(
    root,
    [
      new THREE.Vector3(-0.72, 1.73, 0),
      new THREE.Vector3(-1.08, 1.97, 0),
      new THREE.Vector3(-1.33, 2.25, 0),
      new THREE.Vector3(-1.61, 2.18, 0),
      new THREE.Vector3(-1.86, 1.98, 0),
    ],
    0.18,
    warmWhite,
    "Neck",
    18
  );
  tube(
    root,
    [
      new THREE.Vector3(-0.78, 1.78, 0.02),
      new THREE.Vector3(-1.10, 2.00, 0.02),
      new THREE.Vector3(-1.34, 2.25, 0.02),
    ],
    0.11,
    white,
    "NeckHighlight",
    14
  );

  ellipsoid(root, white, "Head", [-2.02, 1.97, 0], [0.35, 0.25, 0.24], 48);
  ellipsoid(root, warmWhite, "Face", [-2.20, 1.94, 0], [0.24, 0.19, 0.20], 40);
  taperedBetween(root, new THREE.Vector3(-2.18, 1.96, 0), new THREE.Vector3(-3.12, 1.92, 0), 0.12, beak, "UpperBeak", 0.62);
  taperedBetween(root, new THREE.Vector3(-2.18, 1.91, 0), new THREE.Vector3(-3.07, 1.89, 0), 0.085, beakDark, "LowerBeak", 0.58);

  for (const side of [-1, 1]) {
    ellipsoid(root, iris, `EyePatch_${side}`, [-2.20, 2.03, side * 0.19], [0.105, 0.075, 0.035], 32);
    ellipsoid(root, eye, `Eye_${side}`, [-2.22, 2.04, side * 0.215], [0.057, 0.057, 0.025], 32);
    ellipsoid(root, white, `EyeGlint_${side}`, [-2.24, 2.065, side * 0.234], [0.015, 0.015, 0.009], 20);
  }

  root.add(wingSurface("left", white, featherShade));
  root.add(wingSurface("right", white, featherShade));

  for (const side of [-1, 1]) {
    const hip = new THREE.Vector3(0.70, 1.43, side * 0.16);
    const ankle = new THREE.Vector3(1.55, 1.15, side * 0.18);
    const foot = new THREE.Vector3(2.25, 0.98, side * 0.20);
    tube(root, [hip, ankle, foot], 0.055, leg, `Leg_${side}`, 10);
    for (let toe = -1; toe <= 1; toe += 1) {
      tube(
        root,
        [
          foot,
          new THREE.Vector3(2.55, 0.91 + toe * 0.02, side * (0.20 + toe * 0.08)),
        ],
        0.024,
        leg,
        `Toe_${side}_${toe}`,
        8
      );
    }
  }

  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });

  root.userData.parts = {
    wings: ["left_Wing", "right_Wing"],
    neck: "Neck",
    legs: ["Leg_-1", "Leg_1"],
  };
  return root;
}
