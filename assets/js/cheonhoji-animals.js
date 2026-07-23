import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js";

function mat(color, roughness = 0.72, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
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

function sphere(parent, material, name, position, scale, segments = 32) {
  return addMesh(parent, new THREE.SphereGeometry(1, segments, Math.max(16, segments / 2)), material, name, position, scale);
}

function capsule(parent, material, name, position, radius, length, rotation = [0, 0, 0]) {
  return addMesh(parent, new THREE.CapsuleGeometry(radius, length, 8, 20), material, name, position, [1, 1, 1], rotation);
}

function pivot(parent, name, position) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(...position);
  parent.add(group);
  return group;
}

function eye(parent, x, y, z, scale = 1) {
  const white = mat(0xf8f6ef, 0.45);
  const black = mat(0x121820, 0.34);
  sphere(parent, white, "EyeWhite", [x, y, z], [0.13 * scale, 0.16 * scale, 0.08 * scale], 24);
  sphere(parent, black, "Pupil", [x, y + 0.01, z + 0.075 * scale], [0.066 * scale, 0.082 * scale, 0.038 * scale], 20);
  sphere(parent, white, "EyeHighlight", [x - 0.018 * scale, y + 0.048 * scale, z + 0.106 * scale], [0.018, 0.024, 0.012], 12);
}

export function createOtter() {
  const root = new THREE.Group();
  root.name = "Cheonhoji_Otter";
  const brown = mat(0x7a4b31, 0.82);
  const darkBrown = mat(0x4b2e22, 0.82);
  const cream = mat(0xf0d8b1, 0.78);
  const black = mat(0x171a1d, 0.38);
  const paw = mat(0x5b3527, 0.86);

  sphere(root, brown, "Body", [0, 1.35, 0], [0.76, 1.08, 0.56]);
  sphere(root, cream, "Chest", [0, 1.43, 0.51], [0.43, 0.72, 0.075], 32);
  sphere(root, brown, "Head", [0, 2.46, 0.02], [0.62, 0.61, 0.55]);
  sphere(root, darkBrown, "EarLeft", [-0.47, 2.79, -0.02], [0.20, 0.22, 0.14], 24);
  sphere(root, darkBrown, "EarRight", [0.47, 2.79, -0.02], [0.20, 0.22, 0.14], 24);
  sphere(root, cream, "Muzzle", [0, 2.31, 0.53], [0.39, 0.30, 0.20], 32);
  sphere(root, black, "Nose", [0, 2.48, 0.69], [0.15, 0.11, 0.10], 24);
  eye(root, -0.23, 2.61, 0.49, 1);
  eye(root, 0.23, 2.61, 0.49, 1);

  const whiskerMaterial = new THREE.LineBasicMaterial({ color: 0xf3e8d7, transparent: true, opacity: 0.72 });
  [-1, 1].forEach((side) => {
    [-0.08, 0.02, 0.12].forEach((offset, index) => {
      const points = [
        new THREE.Vector3(side * 0.20, 2.32 + offset, 0.69),
        new THREE.Vector3(side * (0.56 + index * 0.04), 2.34 + offset * 1.5, 0.78),
      ];
      root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), whiskerMaterial));
    });
  });

  const leftArm = pivot(root, "LeftArmPivot", [-0.62, 1.92, 0]);
  const rightArm = pivot(root, "RightArmPivot", [0.62, 1.92, 0]);
  capsule(leftArm, brown, "LeftArm", [0, -0.38, 0.03], 0.18, 0.55, [0, 0, -0.10]);
  capsule(rightArm, brown, "RightArm", [0, -0.38, 0.03], 0.18, 0.55, [0, 0, 0.10]);
  sphere(leftArm, paw, "LeftPaw", [-0.04, -0.77, 0.07], [0.21, 0.18, 0.17], 24);
  sphere(rightArm, paw, "RightPaw", [0.04, -0.77, 0.07], [0.21, 0.18, 0.17], 24);

  const leftLeg = pivot(root, "LeftLegPivot", [-0.32, 0.55, 0]);
  const rightLeg = pivot(root, "RightLegPivot", [0.32, 0.55, 0]);
  capsule(leftLeg, brown, "LeftLeg", [0, -0.28, 0], 0.22, 0.34, [0, 0, 0]);
  capsule(rightLeg, brown, "RightLeg", [0, -0.28, 0], 0.22, 0.34, [0, 0, 0]);
  sphere(leftLeg, paw, "LeftFoot", [-0.04, -0.58, 0.16], [0.29, 0.17, 0.39], 24);
  sphere(rightLeg, paw, "RightFoot", [0.04, -0.58, 0.16], [0.29, 0.17, 0.39], 24);

  const tail = pivot(root, "TailPivot", [0, 0.92, -0.42]);
  const tailA = capsule(tail, darkBrown, "TailA", [0, -0.15, -0.54], 0.20, 0.82, [0.72, 0, 0]);
  tailA.scale.set(1, 1, 0.82);
  const tailB = capsule(tail, darkBrown, "TailB", [0, -0.54, -0.96], 0.13, 0.58, [1.05, 0, 0]);
  tailB.scale.set(1, 1, 0.74);

  root.userData.parts = { leftArm, rightArm, leftLeg, rightLeg, tail, body: root.getObjectByName("Body"), head: root.getObjectByName("Head") };
  root.userData.baseY = 0;
  return root;
}

export function createTurtle() {
  const root = new THREE.Group();
  root.name = "Cheonhoji_Turtle";
  const skin = mat(0x6b9470, 0.84);
  const skinLight = mat(0x9fbd88, 0.82);
  const shell = mat(0x53663d, 0.88);
  const shellDark = mat(0x34462f, 0.90);
  const shellLight = mat(0x829158, 0.86);
  const cream = mat(0xd9d5a7, 0.84);
  const black = mat(0x141b18, 0.35);

  sphere(root, cream, "Plastron", [0, 0.90, 0.03], [0.86, 0.52, 0.50], 36);
  const dome = sphere(root, shell, "Shell", [-0.08, 1.13, -0.04], [1.03, 0.78, 0.58], 48);
  dome.rotation.x = -0.06;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.84, 0.075, 12, 48), shellDark);
  rim.name = "ShellRim";
  rim.position.set(-0.08, 1.02, 0.37);
  rim.scale.set(1.16, 0.78, 1);
  root.add(rim);

  const plateGeometry = new THREE.CylinderGeometry(0.20, 0.23, 0.035, 6);
  [[0,1.35,0.52],[-0.42,1.27,0.48],[0.42,1.27,0.48],[-0.66,1.08,0.44],[0.66,1.08,0.44],[-0.28,0.98,0.53],[0.28,0.98,0.53]].forEach((p, i) => {
    const plate = addMesh(root, plateGeometry, i % 2 ? shellLight : shellDark, `ShellPlate${i}`, p, i === 0 ? [1.25,1,1.25] : [1,1,1], [Math.PI / 2, 0, i * 0.16]);
    plate.renderOrder = 2;
  });

  const neck = capsule(root, skin, "Neck", [0.89, 1.05, 0.03], 0.23, 0.36, [0, 0, Math.PI / 2]);
  neck.scale.set(1, 1, 0.92);
  sphere(root, skin, "Head", [1.27, 1.18, 0.04], [0.43, 0.38, 0.37], 32);
  sphere(root, skinLight, "Muzzle", [1.54, 1.10, 0.13], [0.20, 0.18, 0.22], 24);
  sphere(root, black, "TurtleEyeNear", [1.42, 1.32, 0.34], [0.075, 0.085, 0.055], 20);
  sphere(root, cream, "TurtleEyeHighlight", [1.44, 1.35, 0.385], [0.018, 0.022, 0.014], 12);

  const limbData = [
    ["FrontNear", 0.61, 0.73, 0.42], ["FrontFar", 0.61, 0.73, -0.38],
    ["BackNear", -0.62, 0.73, 0.42], ["BackFar", -0.62, 0.73, -0.38],
  ];
  const limbs = {};
  limbData.forEach(([name, x, y, z], index) => {
    const leg = pivot(root, `${name}Pivot`, [x, y, z]);
    capsule(leg, skin, name, [index < 2 ? 0.10 : -0.08, -0.25, 0], 0.18, 0.38, [0, 0, index < 2 ? -0.48 : 0.48]);
    sphere(leg, skinLight, `${name}Foot`, [index < 2 ? 0.27 : -0.25, -0.46, 0.05], [0.28, 0.14, 0.21], 24);
    limbs[name] = leg;
  });

  const tail = pivot(root, "TailPivot", [-0.98, 0.98, -0.02]);
  const tailMesh = addMesh(tail, new THREE.ConeGeometry(0.18, 0.62, 20), skin, "Tail", [-0.28, -0.03, 0], [1, 1, 1], [0, 0, -Math.PI / 2]);
  tailMesh.rotation.z = -Math.PI / 2;

  root.userData.parts = { ...limbs, tail, shell: dome, head: root.getObjectByName("Head") };
  root.userData.baseY = 0;
  return root;
}

export function disposeAnimal(root) {
  root.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (material.map) material.map.dispose();
        material.dispose();
      });
    }
  });
}
