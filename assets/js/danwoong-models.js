import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js";

const COLORS = {
  blue: 0x80b8d7,
  blueDark: 0x68a3c7,
  navy: 0x3f4d69,
  navyBelly: 0x37445f,
  black: 0x17191d,
  white: 0xf3f1e9,
  cream: 0xf4dcae,
  coral: 0xe76862,
  orange: 0xf28a26,
};

function material(color, roughness = 0.72, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function mesh(geometry, mat, name, position, scale, rotation = [0, 0, 0]) {
  const item = new THREE.Mesh(geometry, mat);
  item.name = name;
  item.position.set(...position);
  item.scale.set(...scale);
  item.rotation.set(...rotation);
  item.castShadow = true;
  item.receiveShadow = true;
  return item;
}

function sphere(mat, name, position, scale, segments = 40) {
  return mesh(new THREE.SphereGeometry(1, segments, Math.max(20, segments / 2)), mat, name, position, scale);
}

function pivot(name, position) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(...position);
  return group;
}

function labelPlane(text, name, position, size, textColor = "#f7f2e7", outlineColor = "#3a241b") {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, 256, 256);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `900 ${text.length > 1 ? 116 : 172}px Arial Black, sans-serif`;
  context.lineJoin = "round";
  context.lineWidth = text.length > 1 ? 15 : 19;
  context.strokeStyle = outlineColor;
  context.strokeText(text, 128, 135);
  context.fillStyle = textColor;
  context.fillText(text, 128, 135);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(size[0], size[1]),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide })
  );
  plane.name = name;
  plane.position.set(...position);
  plane.renderOrder = 4;
  return plane;
}

function jacketBackPanel(bodyWidth, mat) {
  const shape = new THREE.Shape();
  const shoulder = bodyWidth * 0.78;
  const hem = bodyWidth * 0.90;
  shape.moveTo(-shoulder, 3.12);
  shape.quadraticCurveTo(0, 3.34, shoulder, 3.12);
  shape.quadraticCurveTo(bodyWidth, 2.88, bodyWidth, 2.38);
  shape.lineTo(hem, 1.02);
  shape.quadraticCurveTo(0, 0.84, -hem, 1.02);
  shape.lineTo(-bodyWidth, 2.38);
  shape.quadraticCurveTo(-bodyWidth, 2.88, -shoulder, 3.12);
  shape.closePath();

  const backMaterial = mat.clone();
  backMaterial.side = THREE.DoubleSide;
  const back = mesh(new THREE.ShapeGeometry(shape, 24), backMaterial, "Jacket_Back", [0, 0, -1.12], [1, 1, 1]);
  back.renderOrder = 1;
  return back;
}

function jacketTorsoBand(variant, mat) {
  const isBlue = variant === "blue";
  const centerY = isBlue ? 2.25 : 2.22;
  const scaleY = isBlue ? 2.10 : 2.07;
  const topY = 3.10;
  const bottomY = 1.02;
  const thetaStart = Math.acos((topY - centerY) / scaleY);
  const thetaEnd = Math.acos((bottomY - centerY) / scaleY);
  const geometry = new THREE.SphereGeometry(
    1,
    56,
    36,
    0,
    Math.PI * 2,
    thetaStart,
    thetaEnd - thetaStart
  );
  return mesh(
    geometry,
    mat,
    "Jacket_Body",
    [0, centerY, 0],
    [isBlue ? 1.44 : 1.31, scaleY, isBlue ? 1.08 : 0.99]
  );
}

function addVarsityJacket(root, leftArm, rightArm, variant) {
  const brown = material(0x35231c, 0.84);
  const brownDark = material(0x251711, 0.88);
  const ivory = material(0xf4f0e6, 0.82);
  const silver = material(0xf4f5f2, 0.34, 0.16);
  const bodyWidth = variant === "blue" ? 1.44 : 1.31;
  const bodyHeight = variant === "blue" ? 2.10 : 2.07;
  const bodyDepth = variant === "blue" ? 1.08 : 0.99;
  const bodyCenterY = variant === "blue" ? 2.25 : 2.22;
  const bodyCenterZ = 0;
  const surfaceZ = (y, lift = 0.06) => {
    const normalizedY = Math.max(-0.995, Math.min(0.995, (y - bodyCenterY) / bodyHeight));
    return bodyCenterZ + bodyDepth * Math.sqrt(1 - normalizedY * normalizedY) + lift;
  };

  root.add(jacketTorsoBand(variant, brown));
  [-1, 1].forEach((side) => {
    const shoulderPoints = [
      new THREE.Vector3(side * 0.24, 2.83, surfaceZ(2.83, 0.025)),
      new THREE.Vector3(side * 0.63, 2.98, 1.30),
      new THREE.Vector3(side * 1.04, 2.87, 1.18),
    ];
    root.add(mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(shoulderPoints), 20, 0.20, 12, false),
      brown,
      `Jacket_Shoulder_${side < 0 ? "L" : "R"}`,
      [0, 0, 0],
      [1, 1, 1]
    ));
  });

  const seamPoints = [1.15, 1.52, 1.90, 2.28, 2.66, 2.91]
    .map((y) => new THREE.Vector3(0, y, surfaceZ(y, 0.035)));
  root.add(mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(seamPoints), 28, 0.035, 8, false),
    brownDark,
    "Jacket_Placket",
    [0, 0, 0],
    [1, 1, 1]
  ));

  [2.86, 2.43, 2.0, 1.57, 1.17].forEach((y, index) => {
    root.add(sphere(silver, `Jacket_Button_${index + 1}`, [0, y, surfaceZ(y, 0.095)], [0.075, 0.075, 0.045], 20));
  });

  [-1, 1].forEach((side) => {
    root.add(mesh(
      new THREE.BoxGeometry(1, 1, 1),
      ivory,
      `Jacket_Collar_${side < 0 ? "L" : "R"}`,
      [side * 0.39, 2.94, surfaceZ(2.94, 0.075)],
      [0.45, 0.055, 0.035],
      [0, 0, side * -0.48]
    ));
    root.add(mesh(
      new THREE.BoxGeometry(1, 1, 1),
      brownDark,
      `Jacket_CollarStripe_${side < 0 ? "L" : "R"}`,
      [side * 0.4, 2.985, surfaceZ(2.985, 0.105)],
      [0.45, 0.022, 0.02],
      [0, 0, side * -0.48]
    ));
    root.add(mesh(
      new THREE.BoxGeometry(1, 1, 1),
      ivory,
      `Jacket_Pocket_${side < 0 ? "L" : "R"}`,
      [side * 0.70, 1.82, surfaceZ(1.82, 0.09)],
      [0.055, 0.30, 0.03],
      [0, 0, side * -0.22]
    ));
  });

  [1.06, 1.16, 1.26].forEach((y, index) => {
    root.add(mesh(
      new THREE.BoxGeometry(1, 1, 1),
      index === 1 ? ivory : brownDark,
      `Jacket_Waistband_${index + 1}`,
      [0, y, surfaceZ(y, 0.08)],
      [bodyWidth * 0.91, 0.035, 0.035]
    ));
  });

  root.add(labelPlane("D", "Jacket_D", [0.53, 2.43, surfaceZ(2.43, 0.12)], [0.52, 0.58]));

  if (variant === "blue") {
    leftArm.add(sphere(ivory, "Jacket_Sleeve_L", [-0.03, -0.66, 0.045], [0.33, 0.86, 0.38], 32));
    rightArm.add(sphere(ivory, "Jacket_Sleeve_R", [0.03, -0.66, 0.045], [0.33, 0.86, 0.38], 32));
    leftArm.add(mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.16, 28), brownDark, "Jacket_Cuff_L", [-0.03, -1.43, 0.045], [1, 1, 1]));
    rightArm.add(mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.16, 28), brownDark, "Jacket_Cuff_R", [0.03, -1.43, 0.045], [1, 1, 1]));
    leftArm.add(mesh(new THREE.CylinderGeometry(0.385, 0.385, 0.035, 28), ivory, "Jacket_CuffStripe_L", [-0.03, -1.43, 0.045], [1, 1, 1]));
    rightArm.add(mesh(new THREE.CylinderGeometry(0.385, 0.385, 0.035, 28), ivory, "Jacket_CuffStripe_R", [0.03, -1.43, 0.045], [1, 1, 1]));
    rightArm.add(labelPlane("26", "Jacket_26", [0.03, -0.59, 0.455], [0.45, 0.34]));
  } else {
    leftArm.add(sphere(ivory, "Jacket_Sleeve_L", [-0.58, -0.03, 0.025], [0.75, 0.31, 0.37], 32));
    rightArm.add(sphere(ivory, "Jacket_Sleeve_R", [0.58, -0.03, 0.025], [0.75, 0.31, 0.37], 32));
    leftArm.add(mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.16, 28), brownDark, "Jacket_Cuff_L", [-1.18, -0.03, 0.025], [1, 1, 1], [0, 0, Math.PI / 2]));
    rightArm.add(mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.16, 28), brownDark, "Jacket_Cuff_R", [1.18, -0.03, 0.025], [1, 1, 1], [0, 0, Math.PI / 2]));
    leftArm.add(mesh(new THREE.CylinderGeometry(0.355, 0.355, 0.035, 28), ivory, "Jacket_CuffStripe_L", [-1.18, -0.03, 0.025], [1, 1, 1], [0, 0, Math.PI / 2]));
    rightArm.add(mesh(new THREE.CylinderGeometry(0.355, 0.355, 0.035, 28), ivory, "Jacket_CuffStripe_R", [1.18, -0.03, 0.025], [1, 1, 1], [0, 0, Math.PI / 2]));
    rightArm.add(labelPlane("26", "Jacket_26", [0.58, -0.03, 0.405], [0.43, 0.32]));
  }
}

function addEye(parent, side, x, y, z, whiteMaterial, pupilMaterial) {
  const eye = pivot(`Eye_${side}`, [x, y, z]);
  eye.add(sphere(whiteMaterial, `EyeWhite_${side}`, [0, 0, 0], [0.22, 0.26, 0.13], 28));
  eye.add(sphere(pupilMaterial, `Pupil_${side}`, [side === "L" ? 0.035 : -0.035, -0.01, 0.12], [0.105, 0.13, 0.065], 24));
  eye.add(sphere(whiteMaterial, `EyeHighlight_${side}`, [side === "L" ? 0.07 : 0.005, 0.065, 0.177], [0.037, 0.045, 0.022], 16));
  parent.add(eye);
  return eye;
}

function addFaceCurves(parent, darkMaterial, mouthY, mouthZ, browY, browZ) {
  const mouthCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.16, mouthY + 0.02, mouthZ),
    new THREE.Vector3(0, mouthY - 0.10, mouthZ + 0.02),
    new THREE.Vector3(0.16, mouthY + 0.02, mouthZ)
  );
  parent.add(mesh(new THREE.TubeGeometry(mouthCurve, 18, 0.022, 8, false), darkMaterial, "Mouth", [0, 0, 0], [1, 1, 1]));

  [
    ["L", -0.25, -0.05],
    ["R", 0.25, 0.05],
  ].forEach(([side, x, tilt]) => {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(x - 0.09, browY, browZ),
      new THREE.Vector3(x, browY + 0.035, browZ + 0.01),
      new THREE.Vector3(x + 0.09, browY - Number(tilt), browZ)
    );
    parent.add(mesh(new THREE.TubeGeometry(curve, 12, 0.018, 8, false), darkMaterial, `Brow_${side}`, [0, 0, 0], [1, 1, 1]));
  });
}

function attachAnimationMetadata(root) {
  root.userData.modelType = "animation-ready-procedural";
  root.userData.frontAxis = "+Z";
  root.userData.floorY = 0;
  root.userData.animationParts = {
    leftArm: "Arm_L_Pivot",
    rightArm: "Arm_R_Pivot",
    leftLeg: "Leg_L_Pivot",
    rightLeg: "Leg_R_Pivot",
    leftEye: "Eye_L",
    rightEye: "Eye_R",
    tail: "Tail_Pivot",
  };
  return root;
}

export function createBlueDanwoong() {
  const root = new THREE.Group();
  root.name = "Danwoong_Blue";

  const blue = material(COLORS.blue, 0.78);
  const blueDark = material(COLORS.blueDark, 0.8);
  const black = material(COLORS.black, 0.58);
  const white = material(COLORS.white, 0.72);
  const coral = material(COLORS.coral, 0.68);

  root.add(sphere(blue, "Body", [0, 2.25, 0], [1.38, 2.05, 1.02], 56));
  root.add(sphere(black, "Ear_L", [-0.64, 4.02, 0.03], [0.31, 0.31, 0.22], 32));
  root.add(sphere(black, "Ear_R", [0.64, 4.02, 0.03], [0.31, 0.31, 0.22], 32));

  root.add(sphere(white, "Muzzle", [0, 3.35, 0.94], [0.48, 0.40, 0.25], 40));
  root.add(sphere(black, "Nose", [0, 3.56, 1.18], [0.15, 0.12, 0.10], 28));
  root.add(sphere(coral, "Cheek_L", [-0.53, 3.39, 0.86], [0.24, 0.29, 0.11], 30));
  root.add(sphere(coral, "Cheek_R", [0.53, 3.39, 0.86], [0.24, 0.29, 0.11], 30));
  addEye(root, "L", -0.25, 3.72, 0.91, white, black);
  addEye(root, "R", 0.25, 3.72, 0.91, white, black);
  addFaceCurves(root, black, 3.24, 1.20, 3.98, 0.91);

  const leftArm = pivot("Arm_L_Pivot", [-1.05, 3.10, 0.02]);
  leftArm.rotation.z = -0.12;
  leftArm.add(sphere(blueDark, "Arm_L", [-0.03, -0.82, 0.04], [0.34, 1.04, 0.38], 36));
  root.add(leftArm);
  const rightArm = pivot("Arm_R_Pivot", [1.05, 3.10, 0.02]);
  rightArm.rotation.z = 0.12;
  rightArm.add(sphere(blueDark, "Arm_R", [0.03, -0.82, 0.04], [0.34, 1.04, 0.38], 36));
  root.add(rightArm);

  addVarsityJacket(root, leftArm, rightArm, "blue");

  const leftLeg = pivot("Leg_L_Pivot", [-0.52, 0.66, 0]);
  leftLeg.add(sphere(blueDark, "Leg_L", [0, -0.25, 0.15], [0.53, 0.50, 0.63], 40));
  root.add(leftLeg);
  const rightLeg = pivot("Leg_R_Pivot", [0.52, 0.66, 0]);
  rightLeg.add(sphere(blueDark, "Leg_R", [0, -0.25, 0.15], [0.53, 0.50, 0.63], 40));
  root.add(rightLeg);

  const tail = pivot("Tail_Pivot", [0, 1.35, -1.12]);
  tail.add(sphere(blueDark, "Tail", [0, 0, 0], [0.25, 0.25, 0.25], 28));
  root.add(tail);

  return attachAnimationMetadata(root);
}

export function createNavyDanwoong() {
  const root = new THREE.Group();
  root.name = "Danwoong_Navy";

  const navy = material(COLORS.navy, 0.82);
  const belly = material(COLORS.navyBelly, 0.86);
  const black = material(COLORS.black, 0.62);
  const white = material(COLORS.white, 0.72);
  const cream = material(COLORS.cream, 0.76);
  const orange = material(COLORS.orange, 0.66);

  root.add(sphere(navy, "Body", [0, 2.22, 0], [1.25, 2.02, 0.92], 52));
  root.add(sphere(black, "Ear_L", [-0.57, 4.02, 0.02], [0.25, 0.27, 0.19], 30));
  root.add(sphere(black, "Ear_R", [0.57, 4.02, 0.02], [0.25, 0.27, 0.19], 30));

  root.add(sphere(cream, "Muzzle", [0, 3.42, 0.86], [0.46, 0.36, 0.23], 38));
  root.add(sphere(black, "Nose", [-0.05, 3.61, 1.08], [0.16, 0.12, 0.10], 26));
  root.add(sphere(orange, "Cheek_L", [-0.48, 3.42, 0.80], [0.14, 0.15, 0.08], 24));
  root.add(sphere(orange, "Cheek_R", [0.48, 3.42, 0.80], [0.14, 0.15, 0.08], 24));
  addEye(root, "L", -0.23, 3.73, 0.82, white, black);
  addEye(root, "R", 0.23, 3.73, 0.82, white, black);
  addFaceCurves(root, black, 3.33, 1.09, 3.98, 0.82);

  const leftArm = pivot("Arm_L_Pivot", [-1.0, 3.08, 0]);
  leftArm.rotation.z = -1.08;
  leftArm.add(sphere(navy, "Arm_L", [-0.72, -0.03, 0.02], [0.92, 0.32, 0.35], 36));
  root.add(leftArm);
  const rightArm = pivot("Arm_R_Pivot", [1.0, 3.08, 0]);
  rightArm.rotation.z = 1.08;
  rightArm.add(sphere(navy, "Arm_R", [0.72, -0.03, 0.02], [0.92, 0.32, 0.35], 36));
  root.add(rightArm);

  addVarsityJacket(root, leftArm, rightArm, "navy");

  const leftLeg = pivot("Leg_L_Pivot", [-0.46, 0.66, 0]);
  leftLeg.add(sphere(navy, "Leg_L", [0, -0.28, 0.07], [0.45, 0.60, 0.46], 36));
  root.add(leftLeg);
  const rightLeg = pivot("Leg_R_Pivot", [0.46, 0.66, 0]);
  rightLeg.add(sphere(navy, "Leg_R", [0, -0.28, 0.07], [0.45, 0.60, 0.46], 36));
  root.add(rightLeg);

  const tuftGeometry = new THREE.ConeGeometry(0.14, 0.28, 4);
  [-0.56, -0.28, 0, 0.28, 0.56].forEach((x, index) => {
    root.add(mesh(tuftGeometry, belly, `BellyTuft_${index + 1}`, [x, 0.93 + Math.abs(x) * 0.14, 0.79], [1, 1, 0.65], [0, 0, Math.PI]));
  });

  const tail = pivot("Tail_Pivot", [0, 1.68, -1.02]);
  tail.add(sphere(black, "Tail", [0, 0, 0], [0.17, 0.17, 0.17], 24));
  root.add(tail);

  return attachAnimationMetadata(root);
}

export function getDanwoongParts(model) {
  const parts = {};
  Object.entries(model.userData.animationParts || {}).forEach(([key, name]) => {
    parts[key] = model.getObjectByName(name) || null;
  });
  return parts;
}

export function disposeDanwoong(model) {
  model.traverse((item) => {
    item.geometry?.dispose?.();
    if (Array.isArray(item.material)) item.material.forEach((entry) => entry.dispose?.());
    else item.material?.dispose?.();
  });
}
