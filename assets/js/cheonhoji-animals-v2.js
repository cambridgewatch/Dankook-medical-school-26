import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js";

const outlineMaterial = new THREE.MeshBasicMaterial({ color: 0x2b211e, side: THREE.BackSide });

function material(color, roughness = 0.72, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function mesh(parent, geometry, mat, name, position, scale = [1, 1, 1], rotation = [0, 0, 0], outline = false) {
  const object = new THREE.Mesh(geometry, mat);
  object.name = name;
  object.position.set(...position);
  object.scale.set(...scale);
  object.rotation.set(...rotation);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  if (outline) {
    const border = new THREE.Mesh(geometry, outlineMaterial);
    border.name = `${name}_Outline`;
    border.scale.set(1.035, 1.035, 1.035);
    border.renderOrder = -1;
    object.add(border);
  }
  return object;
}

function sphere(parent, mat, name, position, scale, segments = 48, outline = false) {
  return mesh(parent, new THREE.SphereGeometry(1, segments, Math.max(24, segments / 2)), mat, name, position, scale, [0, 0, 0], outline);
}

function capsule(parent, mat, name, position, radius, length, rotation = [0, 0, 0], scale = [1, 1, 1], outline = false) {
  return mesh(parent, new THREE.CapsuleGeometry(radius, length, 12, 28), mat, name, position, scale, rotation, outline);
}

function pivot(parent, name, position) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(...position);
  parent.add(group);
  return group;
}

function tube(parent, points, radius, mat, name) {
  const curve = new THREE.CatmullRomCurve3(points);
  return mesh(parent, new THREE.TubeGeometry(curve, 28, radius, 8, false), mat, name, [0, 0, 0]);
}

function glossyEye(parent, x, y, z, scale = 1, direction = 1) {
  const black = material(0x11100f, 0.16);
  const white = material(0xffffff, 0.18);
  sphere(parent, black, "Eye", [x, y, z], [0.18 * scale, 0.235 * scale, 0.105 * scale], 40, true);
  sphere(parent, white, "EyeHighlightLarge", [x - 0.045 * direction * scale, y + 0.075 * scale, z + 0.092 * scale], [0.056 * scale, 0.072 * scale, 0.025 * scale], 20);
  sphere(parent, white, "EyeHighlightSmall", [x + 0.055 * direction * scale, y - 0.045 * scale, z + 0.100 * scale], [0.022 * scale, 0.028 * scale, 0.012 * scale], 16);
}

export function createOtterV2() {
  const root = new THREE.Group();
  root.name = "Cheonhoji_Otter_V2";
  const tan = material(0xc79272, 0.76);
  const tanDark = material(0x8c5647, 0.80);
  const cream = material(0xfff1d9, 0.72);
  const creamShade = material(0xe7d5bb, 0.78);
  const black = material(0x171311, 0.24);
  const mouth = material(0x2d211d, 0.58);

  sphere(root, tan, "Body", [0, 1.42, 0], [0.83, 1.25, 0.66], 56, true);
  sphere(root, cream, "Belly", [0, 1.37, 0.625], [0.52, 0.86, 0.075], 48);
  sphere(root, creamShade, "BellyShadow", [0, 0.86, 0.677], [0.43, 0.21, 0.028], 32);

  sphere(root, tanDark, "EarLeft", [-0.66, 3.02, -0.02], [0.27, 0.30, 0.19], 40, true);
  sphere(root, tanDark, "EarRight", [0.66, 3.02, -0.02], [0.27, 0.30, 0.19], 40, true);
  sphere(root, tan, "Head", [0, 2.72, 0.03], [0.93, 0.73, 0.72], 64, true);
  sphere(root, tan, "CheekLeft", [-0.48, 2.48, 0.31], [0.50, 0.43, 0.46], 48);
  sphere(root, tan, "CheekRight", [0.48, 2.48, 0.31], [0.50, 0.43, 0.46], 48);

  sphere(root, cream, "FaceMaskLeft", [-0.34, 2.46, 0.655], [0.49, 0.37, 0.105], 48);
  sphere(root, cream, "FaceMaskRight", [0.34, 2.46, 0.655], [0.49, 0.37, 0.105], 48);
  sphere(root, cream, "Chin", [0, 2.31, 0.69], [0.47, 0.25, 0.075], 40);
  sphere(root, cream, "BrowSpotLeft", [-0.35, 2.98, 0.64], [0.14, 0.20, 0.055], 28);
  sphere(root, cream, "BrowSpotRight", [0.35, 2.98, 0.64], [0.14, 0.20, 0.055], 28);

  glossyEye(root, -0.34, 2.75, 0.69, 1.10, -1);
  glossyEye(root, 0.34, 2.75, 0.69, 1.10, 1);
  sphere(root, black, "Nose", [0, 2.53, 0.83], [0.155, 0.115, 0.095], 32, true);

  tube(root, [new THREE.Vector3(0, 2.43, 0.825), new THREE.Vector3(0, 2.35, 0.85)], 0.016, mouth, "MouthCenter");
  tube(root, [new THREE.Vector3(0, 2.35, 0.85), new THREE.Vector3(-0.09, 2.30, 0.846), new THREE.Vector3(-0.19, 2.34, 0.83)], 0.018, mouth, "SmileLeft");
  tube(root, [new THREE.Vector3(0, 2.35, 0.85), new THREE.Vector3(0.09, 2.30, 0.846), new THREE.Vector3(0.19, 2.34, 0.83)], 0.018, mouth, "SmileRight");

  const whiskerMat = new THREE.LineBasicMaterial({ color: 0x372922, transparent: true, opacity: 0.92 });
  [-1, 1].forEach((side) => {
    [-0.09, 0.01, 0.11].forEach((offset, index) => {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(side * 0.24, 2.42 + offset, 0.82),
          new THREE.Vector3(side * (0.78 + index * 0.05), 2.44 + offset * 1.25, 0.88),
        ]),
        whiskerMat
      );
      line.name = "Whisker";
      root.add(line);
    });
  });

  const leftArm = pivot(root, "LeftArmPivot", [-0.69, 1.93, 0.06]);
  const rightArm = pivot(root, "RightArmPivot", [0.69, 1.93, 0.06]);
  capsule(leftArm, tan, "LeftArm", [-0.02, -0.43, 0.11], 0.20, 0.62, [0, 0, -0.05], [1, 1, 0.90], true);
  capsule(rightArm, tan, "RightArm", [0.02, -0.43, 0.11], 0.20, 0.62, [0, 0, 0.05], [1, 1, 0.90], true);
  sphere(leftArm, tanDark, "LeftPaw", [-0.04, -0.82, 0.13], [0.22, 0.18, 0.19], 32);
  sphere(rightArm, tanDark, "RightPaw", [0.04, -0.82, 0.13], [0.22, 0.18, 0.19], 32);

  const leftLeg = pivot(root, "LeftLegPivot", [-0.33, 0.48, 0.02]);
  const rightLeg = pivot(root, "RightLegPivot", [0.33, 0.48, 0.02]);
  capsule(leftLeg, tan, "LeftLeg", [0, -0.20, 0], 0.25, 0.25, [0, 0, 0], [1, 1, 0.92], true);
  capsule(rightLeg, tan, "RightLeg", [0, -0.20, 0], 0.25, 0.25, [0, 0, 0], [1, 1, 0.92], true);
  sphere(leftLeg, tanDark, "LeftFoot", [-0.05, -0.48, 0.20], [0.38, 0.17, 0.46], 40, true);
  sphere(rightLeg, tanDark, "RightFoot", [0.05, -0.48, 0.20], [0.38, 0.17, 0.46], 40, true);

  const tail = pivot(root, "TailPivot", [0.49, 0.72, -0.32]);
  const tailBase = capsule(tail, tanDark, "TailBase", [0.38, 0.02, -0.20], 0.30, 0.74, [0.18, 0, -1.02], [1, 1, 0.86], true);
  tailBase.rotation.z = -1.02;
  const tailMid = capsule(tail, tanDark, "TailMid", [0.93, 0.02, -0.34], 0.25, 0.62, [0.10, 0, -1.30], [1, 1, 0.82], true);
  tailMid.rotation.z = -1.30;
  const tailTip = capsule(tail, material(0x653a35, 0.82), "TailTip", [1.34, 0.18, -0.39], 0.18, 0.42, [-0.12, 0, -1.72], [1, 1, 0.78], true);
  tailTip.rotation.z = -1.72;

  root.userData.parts = { leftArm, rightArm, leftLeg, rightLeg, tail, body: root.getObjectByName("Body"), head: root.getObjectByName("Head") };
  return root;
}

function addTurtleSpots(parent, positions, spotMat, prefix) {
  positions.forEach((entry, index) => sphere(parent, spotMat, `${prefix}${index}`, entry.position, entry.scale || [0.06, 0.06, 0.025], 20));
}

function shellScute(parent, x, y, z, sx, sy, rotation, plateMat, seamMat) {
  sphere(parent, seamMat, "ScuteSeam", [x, y, z - 0.004], [sx * 1.10, sy * 1.10, 0.035], 32);
  const plate = sphere(parent, plateMat, "Scute", [x, y, z + 0.014], [sx, sy, 0.038], 32);
  plate.rotation.z = rotation;
}

export function createTurtleV2() {
  const root = new THREE.Group();
  root.name = "Cheonhoji_Turtle_V2";
  const skin = material(0xa8b951, 0.79);
  const skinLight = material(0xc7cf72, 0.76);
  const spot = material(0x78893c, 0.86);
  const shell = material(0x934a43, 0.82);
  const shellPlate = material(0xa9564d, 0.80);
  const shellPlateAlt = material(0x85403e, 0.84);
  const shellSeam = material(0x653331, 0.88);
  const plastron = material(0xf1d99a, 0.81);
  const black = material(0x171512, 0.18);
  const white = material(0xffffff, 0.16);
  const mouth = material(0x3c3024, 0.55);

  sphere(root, plastron, "Plastron", [0.02, 0.70, 0], [0.98, 0.45, 0.56], 56, true);
  sphere(root, shellSeam, "ShellUnderRim", [0.02, 1.02, -0.01], [1.24, 0.73, 0.64], 64, true);
  const dome = sphere(root, shell, "Shell", [0.02, 1.09, -0.01], [1.18, 0.79, 0.61], 64);
  dome.scale.y = 0.79;

  const scutes = [
    [-0.48,1.37,0.585,0.37,0.29,-0.12,shellPlate], [0.02,1.51,0.605,0.42,0.31,0,shellPlateAlt], [0.52,1.36,0.58,0.37,0.29,0.12,shellPlate],
    [-0.70,1.03,0.574,0.31,0.25,-0.20,shellPlateAlt], [-0.22,1.10,0.624,0.37,0.29,-0.04,shellPlate], [0.29,1.10,0.62,0.37,0.29,0.04,shellPlate], [0.75,1.02,0.55,0.28,0.23,0.20,shellPlateAlt],
    [-0.43,0.80,0.545,0.33,0.21,0.12,shellPlateAlt], [0.10,0.79,0.58,0.37,0.22,0,shellPlate], [0.57,0.80,0.53,0.30,0.20,-0.12,shellPlateAlt]
  ];
  scutes.forEach(([x,y,z,sx,sy,r,m]) => shellScute(root,x,y,z,sx,sy,r,m,shellSeam));
  scutes.forEach(([x,y,z,sx,sy,r,m]) => shellScute(root,x,y,-z,sx,sy,-r,m,shellSeam));

  const neck = capsule(root, skin, "Neck", [-1.03, 0.88, 0], 0.25, 0.40, [0, 0, Math.PI / 2], [1, 1, 0.92], true);
  neck.rotation.z = Math.PI / 2;
  sphere(root, skin, "Head", [-1.39, 1.03, 0.04], [0.52, 0.48, 0.43], 56, true);
  sphere(root, skinLight, "Muzzle", [-1.75, 0.92, 0.08], [0.25, 0.22, 0.30], 40);
  sphere(root, black, "EyeNear", [-1.55, 1.17, 0.405], [0.125, 0.16, 0.075], 32, true);
  sphere(root, white, "EyeHighlightLarge", [-1.59, 1.23, 0.468], [0.043, 0.055, 0.022], 18);
  sphere(root, white, "EyeHighlightSmall", [-1.50, 1.12, 0.474], [0.018, 0.022, 0.010], 16);
  sphere(root, black, "NostrilNear", [-1.88, 0.99, 0.255], [0.026, 0.033, 0.018], 16);
  tube(root, [new THREE.Vector3(-1.92,0.84,0.30),new THREE.Vector3(-1.75,0.78,0.37),new THREE.Vector3(-1.55,0.80,0.40)], 0.018, mouth, "TurtleSmile");
  addTurtleSpots(root, [
    {position:[-1.64,1.35,0.38],scale:[0.08,0.06,0.025]}, {position:[-1.47,1.39,0.40],scale:[0.06,0.05,0.022]},
    {position:[-1.79,1.29,0.31],scale:[0.055,0.045,0.020]}, {position:[-1.29,0.77,0.39],scale:[0.065,0.05,0.022]},
  ], spot, "HeadSpot");

  const limbSpecs = [
    ["FrontNear",-0.63,0.58,0.46,-0.38,0.28,0.64], ["FrontFar",-0.63,0.59,-0.42,-0.25,0.22,-0.54],
    ["BackNear",0.69,0.58,0.44,0.42,0.23,0.56], ["BackFar",0.69,0.59,-0.42,0.34,0.19,-0.48]
  ];
  const limbs = {};
  limbSpecs.forEach(([name,x,y,z,rx,rz,depth], index) => {
    const limb = pivot(root, `${name}Pivot`, [x,y,z]);
    const near = z > 0;
    capsule(limb, skin, name, [name.startsWith("Front")?-0.18:0.20,-0.23,near?0.04:-0.02], 0.25, 0.50, [rx, 0, rz], [1.05,1,0.68], true);
    sphere(limb, skinLight, `${name}Flipper`, [name.startsWith("Front")?-0.40:0.43,-0.48,near?0.08:-0.02], [0.44,0.18,0.30], 40, true);
    if (near) addTurtleSpots(limb, [
      {position:[name.startsWith("Front")?-0.48:0.50,-0.43,0.34],scale:[0.07,0.05,0.025]},
      {position:[name.startsWith("Front")?-0.30:0.31,-0.54,0.34],scale:[0.055,0.045,0.022]},
      {position:[name.startsWith("Front")?-0.56:0.57,-0.56,0.29],scale:[0.045,0.038,0.020]},
    ], spot, `${name}Spot`);
    limb.position.z += depth * 0.02;
    limbs[name] = limb;
  });

  const tail = pivot(root, "TailPivot", [1.12, 0.76, -0.01]);
  mesh(tail, new THREE.ConeGeometry(0.16, 0.55, 28), skin, "Tail", [0.27, -0.02, 0], [1,1,0.82], [0,0,-Math.PI/2], true);

  root.userData.parts = { ...limbs, tail, shell: dome, head: root.getObjectByName("Head") };
  return root;
}

export function disposeAnimalV2(root) {
  root.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
    if (object.material && object.material !== outlineMaterial) {
      const list = Array.isArray(object.material) ? object.material : [object.material];
      list.forEach((item) => item.dispose());
    }
  });
}
