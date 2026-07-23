import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js";
import { createBlueDanwoong, createNavyDanwoong, getDanwoongParts } from "./danwoong-models.js?v=10";
import { auth } from "./firebase-init.js?v=11";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const APPROACH_SECONDS = 6.6;
const HIGH_FIVE_SECONDS = 1.25;
const EXIT_SECONDS = 5.2;
const RECALL_SECONDS = 1.15;
const POSE_COOLDOWN_SECONDS = 2.5;
const POSE_GAP = 0.92;
const BLUE_LOW = 1.15;
const BLUE_HIGH = 2.15;
const BLUE_CONTACT = 1.65;
const NAVY_LOW = 0.45;
const NAVY_HIGH = -0.75;
const NAVY_CONTACT = -0.15;

function ease(value) { return value * value * (3 - 2 * value); }
function mix(from, to, amount) { return from + (to - from) * amount; }

export function mountDanwoongWalk() {
  const header = document.querySelector(".site-header");
  if (!header || header.querySelector(".danwoong-walk-canvas")) return;

  const canvas = document.createElement("canvas");
  canvas.className = "danwoong-walk-canvas";
  canvas.setAttribute("aria-hidden", "true");
  const poseButton = document.createElement("button");
  poseButton.type = "button";
  poseButton.className = "danwoong-pose-trigger";
  poseButton.disabled = true;
  poseButton.setAttribute("aria-label", "단웅이와 단비의 다음 동작 보기");
  const initiallyVisible = document.documentElement.dataset.mascots !== "hide";
  canvas.hidden = !initiallyVisible;
  canvas.style.display = initiallyVisible ? "" : "none";
  header.prepend(canvas);
  header.append(poseButton);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  } catch (error) {
    canvas.remove();
    return;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 2.65, -2.65, 0.1, 30);
  camera.position.set(0, 0, 12);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8294a8, 2.7));
  const keyLight = new THREE.DirectionalLight(0xffffff, 3.5);
  keyLight.position.set(3, 7, 8);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xa8d7ff, 1.4);
  fillLight.position.set(-5, 2, 5);
  scene.add(fillLight);

  const blue = createBlueDanwoong();
  const navy = createNavyDanwoong();
  blue.name = "HeaderWalker_Blue";
  navy.name = "HeaderWalker_Navy";
  navy.position.z = 0.2;
  scene.add(blue, navy);
  const poseProps = new THREE.Group();
  poseProps.name = "MascotPoseProps";
  scene.add(poseProps);

  const walkers = {
    blue: { model: blue, parts: getDanwoongParts(blue), phase: 0, handUp: false },
    navy: { model: navy, parts: getDanwoongParts(navy), phase: Math.PI, handUp: false },
  };
  Object.values(walkers).forEach((walker) => {
    Object.assign(walker.parts, {
      mouth: walker.model.getObjectByName("Mouth"),
      nose: walker.model.getObjectByName("Nose"),
      leftEar: walker.model.getObjectByName("Ear_L"),
      rightEar: walker.model.getObjectByName("Ear_R"),
      leftBrow: walker.model.getObjectByName("Brow_L"),
      rightBrow: walker.model.getObjectByName("Brow_R"),
    });
    Object.values(walker.parts).forEach((part) => {
      if (!part) return;
      part.userData.poseBase = {
        position: part.position.clone(),
        rotation: part.rotation.clone(),
        scale: part.scale.clone(),
      };
    });
  });
  let halfWidth = 20;
  let edge = 22;
  const meet = 1.7;
  let meetCenter = 0;
  let cycleStarted = performance.now() / 1000;
  let sameHands = false;
  let lastFrame = 0;
  let visibleState = initiallyVisible;
  let running = initiallyVisible && !document.hidden;
  let approachDuration = APPROACH_SECONDS;
  let highFiveDuration = HIGH_FIVE_SECONDS;
  let exitDuration = EXIT_SECONDS;
  let gaitSpeed = 9;
  let modelScale = 0.82;
  let interaction = null;
  let sequenceCursor = 0;
  let poseRequestCount = 0;
  let sequenceReady = false;
  let sequenceStorageKey = "";
  let triggerLeft = 0;
  let triggerWidth = 40;
  let triggerWorldWidth = 8;
  let compactHeader = false;
  const searchParams = new URLSearchParams(location.search);
  const testPattern = searchParams.get("danwoongTest");
  const poseTest = Number.parseInt(searchParams.get("mascotPose") || "", 10);
  const forcedPoseEnabled = Number.isInteger(poseTest) && poseTest >= 1 && poseTest <= 29;

  function updateSequenceLabel() {
    if (forcedPoseEnabled) return;
    poseButton.setAttribute("aria-label", `다음 동작: ${POSE_NAMES[getSequencedPose(sequenceCursor)]}`);
  }

  function loadAccountSequence(user) {
    const accountId = user?.uid || "guest";
    sequenceStorageKey = `dkuMascotPoseProgressV1:${accountId}`;
    sequenceCursor = 0;
    poseRequestCount = 0;
    try {
      const saved = JSON.parse(localStorage.getItem(sequenceStorageKey) || "null");
      if (Number.isInteger(saved?.cursor) && saved.cursor >= 0) sequenceCursor = saved.cursor % SEQUENCE_CYCLE_LENGTH;
      if (Number.isInteger(saved?.count) && saved.count >= 0) poseRequestCount = saved.count;
    } catch {}
    sequenceReady = true;
    if (!interaction) poseButton.disabled = false;
    updateSequenceLabel();
  }

  function saveAccountSequence() {
    if (!sequenceStorageKey) return;
    try {
      localStorage.setItem(sequenceStorageKey, JSON.stringify({
        cursor: sequenceCursor,
        count: poseRequestCount,
      }));
    } catch {}
  }

  function chooseHands(now) {
    const forceUp = testPattern === "match-up" || testPattern === "highfive-up";
    const forceDown = testPattern === "highfive-down";
    const forceMismatch = testPattern === "mismatch" || testPattern === "highfive-mismatch";
    walkers.blue.handUp = forceUp ? true : (forceDown ? false : (forceMismatch ? true : Math.random() < 0.5));
    walkers.navy.handUp = forceUp ? true : (forceDown ? false : (forceMismatch ? false : Math.random() < 0.5));
    sameHands = walkers.blue.handUp === walkers.navy.handUp;
    cycleStarted = now;
  }

  function resize() {
    const rect = header.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height || 68));
    compactHeader = width <= 820;
    renderer.setSize(width, height, false);
    const aspect = width / height;
    halfWidth = 2.65 * aspect;
    edge = halfWidth + 0.7;
    const brandRect = header.querySelector(".brand")?.getBoundingClientRect();
    const rightControl = width <= 820 ? header.querySelector(".nav-toggle") : header.querySelector(".nav-menu");
    const controlRect = rightControl?.getBoundingClientRect();
    const gapLeft = brandRect ? brandRect.right - rect.left : width * 0.3;
    const gapRight = controlRect && controlRect.width ? controlRect.left - rect.left : width * 0.7;
    const hasHeaderGap = gapRight > gapLeft;
    const meetingPixel = hasHeaderGap
      ? (gapLeft + gapRight) / 2 - (width > 820 ? 8 : 0)
      : width / 2;
    meetCenter = (meetingPixel / width * 2 - 1) * halfWidth;
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = 2.65;
    camera.bottom = -2.65;
    camera.updateProjectionMatrix();
    modelScale = width <= 520 ? 0.72 : (width <= 820 ? 0.8 : 0.82);
    blue.scale.setScalar(modelScale);
    navy.scale.setScalar(modelScale);
    approachDuration = width <= 820 ? APPROACH_SECONDS : 13.5;
    highFiveDuration = width <= 820 ? HIGH_FIVE_SECONDS : 1.8;
    exitDuration = width <= 820 ? EXIT_SECONDS : 10.5;
    gaitSpeed = width <= 820 ? 9 : 6;
    triggerLeft = hasHeaderGap ? gapLeft + 2 : meetingPixel - 28;
    const triggerRightGap = width <= 820 ? 4 : 14;
    triggerWidth = hasHeaderGap ? Math.max(24, gapRight - gapLeft - triggerRightGap) : 56;
    triggerWorldWidth = triggerWidth * 5.3 / height;
    poseButton.style.left = `${Math.round(triggerLeft)}px`;
    poseButton.style.width = `${Math.round(triggerWidth)}px`;
    const pawOffset = width <= 820 ? 0 : -4;
    poseButton.style.setProperty("--mascot-contact-x", `${meetingPixel - triggerLeft + pawOffset}px`);
  }

  function poseHandAngles(blueAngle, navyAngle) {
    const blueParts = walkers.blue.parts;
    blueParts.leftArm.rotation.set(0, 0, -0.12);
    blueParts.rightArm.rotation.set(0, 0, blueAngle);
    const navyParts = walkers.navy.parts;
    navyParts.leftArm.rotation.set(0, 0, navyAngle);
    navyParts.rightArm.rotation.set(0, 0, -1.32);
  }

  function poseHands(blueUp = walkers.blue.handUp, navyUp = walkers.navy.handUp) {
    poseHandAngles(blueUp ? BLUE_HIGH : BLUE_LOW, navyUp ? NAVY_HIGH : NAVY_LOW);
  }

  function walkMotion(walker, elapsed, strength = 1) {
    const stride = Math.sin(elapsed * gaitSpeed + walker.phase) * strength;
    const bounce = Math.abs(Math.cos(elapsed * gaitSpeed + walker.phase)) * strength;
    walker.parts.leftLeg.rotation.z = stride * 0.28;
    walker.parts.rightLeg.rotation.z = -stride * 0.28;
    walker.model.position.y = -2.53 + bounce * 0.09;
    walker.model.rotation.z = stride * 0.025;
  }

  function stopLegs(walker) {
    walker.parts.leftLeg.rotation.z = 0;
    walker.parts.rightLeg.rotation.z = 0;
  }

  function resetPoseTransforms() {
    blue.scale.setScalar(modelScale);
    navy.scale.setScalar(modelScale);
    blue.rotation.set(0, 0, 0);
    navy.rotation.set(0, 0, 0);
    Object.values(walkers).forEach((walker) => {
      Object.values(walker.parts).forEach((part) => {
        const base = part?.userData?.poseBase;
        if (!part || !base) return;
        part.position.copy(base.position);
        part.rotation.copy(base.rotation);
        part.scale.copy(base.scale);
      });
    });
  }

  const POSE_NAMES = [
    "서로 하이파이브하기", "둥근 앞발 맞대기", "동시에 꾸벅 인사하기", "동시에 점프하기", "동시에 고개 갸웃하기",
    "함께 셀카 찍기", "서로 앞발 흔들어 인사하기", "옆구리를 둥근 앞발로 콕 건드리기", "풍선 두 개 날리기", "앞발을 맞댄 채 함께 점프하기",
    "두 곰이 사라지고 DKU MED 나타나기", "두 곰이 사라지고 26 나타나기", "번개에 서로 다른 타이밍으로 놀라기",
    "한 곰이 재채기하자 다른 곰도 따라 재채기하기", "한 곰이 딸꾹질하자 다른 곰이 관찰하기", "한 곰이 졸다가 다른 곰에게 기대기",
    "비눗방울을 건드리려다 터져 놀라기", "작은 별이 한 곰 머리 위에서 반짝이기", "깃털이 코를 간지럽혀 재채기하기", "갑자기 바람이 불어 한 곰만 밀리기",
    "잎사귀가 한 곰 머리에 붙기", "작은 공을 잡으려다 앞발만 맞대기", "종이비행기를 한 곰만 늦게 피하기", "나비를 따라보다 서로 마주 보기",
    "갑자기 눈이 내려 서로 다르게 반응하기", "물방울을 번갈아 맞고 놀라기", "작은 구름이 지나가며 잠깐 어두워지기",
    "반짝임이 순간이동해 번갈아 보기", "화면이 흔들리자 한 곰이 다른 곰에게 기대기"
  ];
  const POSE_DURATIONS = [
    3.5,3.5,3.2,3.3,3.8,4.0,3.8,4.0,4.0,4.0,4.0,3.8,4.5,
    4.2,4.0,4.5,4.0,4.2,4.3,4.0,4.2,4.0,4.0,4.2,4.2,4.2,4.0,4.2,4.5
  ];
  const DKU_MED_POSE_INDEX = 10;
  const NUMBER_POSE_INDEX = 11;
  const SEQUENCE_CYCLE_LENGTH = 108;
  const REGULAR_POSE_ORDER = POSE_NAMES.map((_, index) => index)
    .filter((index) => index !== DKU_MED_POSE_INDEX && index !== NUMBER_POSE_INDEX);

  function getSequencedPose(cursor) {
    if (cursor % 2 === 0) {
      return Math.floor(cursor / 2) % 2 === 0 ? DKU_MED_POSE_INDEX : NUMBER_POSE_INDEX;
    }
    const previousSpecialCount = Math.floor(cursor / 2) + 1;
    const regularIndex = cursor - previousSpecialCount;
    return REGULAR_POSE_ORDER[regularIndex % REGULAR_POSE_ORDER.length];
  }

  onAuthStateChanged(auth, loadAccountSequence);

  function clearPoseProps() {
    while (poseProps.children.length) {
      const item = poseProps.children.pop();
      item.traverse?.((child) => {
        child.geometry?.dispose?.();
        child.material?.map?.dispose?.();
        child.material?.dispose?.();
      });
    }
  }

  function propMesh(geometry, color, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
    const item = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
    item.position.set(...position);
    item.scale.set(...scale);
    item.rotation.set(...rotation);
    poseProps.add(item);
    return item;
  }

  function addBox(color, x, y, sx, sy, sz = 0.18, rz = 0) {
    return propMesh(new THREE.BoxGeometry(1, 1, 1), color, [x, y, 1.25], [sx, sy, sz], [0, 0, rz]);
  }

  function addBall(color, x, y, size) {
    return propMesh(new THREE.SphereGeometry(1, 18, 12), color, [x, y, 1.3], [size, size, size]);
  }

  function addRing(color, x, y, size, tube = 0.08) {
    return propMesh(new THREE.TorusGeometry(size, tube, 12, 28), color, [x, y, 1.3]);
  }

  function addBurst(color, count = 8, radius = 1.4, centerX = 0, centerY = 0.15) {
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2;
      const distance = radius * (0.65 + (i % 3) * 0.16);
      addBall(i % 2 ? color : 0xffffff, centerX + Math.cos(angle) * distance, centerY + Math.sin(angle) * distance, 0.07 + (i % 2) * 0.025);
    }
  }

  function addText(text, color = "#ffffff", x = 0, y = 0, width = 1.2, fontSize = 74, heightRatio = .5, style = {}) {
    const resolutionScale = style.resolutionScale || 1;
    const canvasWidth = 512 * resolutionScale;
    const canvasHeight = 256 * resolutionScale;
    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = canvasWidth;
    labelCanvas.height = canvasHeight;
    const context = labelCanvas.getContext("2d");
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    const fontWeight = style.fontWeight || 900;
    const fontFamily = style.fontFamily || 'Pretendard, sans-serif';
    context.font = `${fontWeight} ${fontSize * resolutionScale}px ${fontFamily}`;
    if ("letterSpacing" in context) context.letterSpacing = `${(style.letterSpacing || 0) * resolutionScale}px`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineJoin = "round";
    context.lineWidth = (style.strokeWidth ?? 14) * resolutionScale;
    context.strokeStyle = style.strokeColor || "rgba(0,32,91,.72)";
    if (context.lineWidth > 0) context.strokeText(text, canvasWidth / 2, canvasHeight / 2);
    context.shadowColor = style.shadowColor || "transparent";
    context.shadowBlur = (style.shadowBlur || 0) * resolutionScale;
    context.shadowOffsetY = (style.shadowOffsetY || 0) * resolutionScale;
    context.fillStyle = color;
    context.fillText(text, canvasWidth / 2, canvasHeight / 2);
    const texture = new THREE.CanvasTexture(labelCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.position.set(x, y, 2);
    sprite.scale.set(width, width * heightRatio, 1);
    poseProps.add(sprite);
    return sprite;
  }

  function tagProp(item, role) {
    item.userData.poseRole = role;
    return item;
  }

  function addEllipse(color, x, y, width, height, role, opacity = 1) {
    const item = propMesh(new THREE.SphereGeometry(1, 24, 16), color, [x, y, 1.3], [width, height, .12]);
    item.material.transparent = opacity < 1;
    item.material.opacity = opacity;
    return tagProp(item, role);
  }

  function addArc(color, x, y, radius, role, rotation = 0) {
    return tagProp(propMesh(new THREE.TorusGeometry(radius, .035, 10, 28, Math.PI * 1.25), color, [x, y, 1.35], [1, .55, 1], [0, 0, rotation]), role);
  }

  function addStar(color, x, y, size, role) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + i * Math.PI / 5;
      const radius = i % 2 ? size * .45 : size;
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius;
      if (i === 0) shape.moveTo(px, py);
      else shape.lineTo(px, py);
    }
    shape.closePath();
    return tagProp(propMesh(new THREE.ShapeGeometry(shape), color, [x, y, 1.45]), role);
  }

  function addDrop(color, x, y, role) {
    const body = addEllipse(color, x, y, .13, .18, role);
    body.rotation.z = Math.PI / 4;
    return body;
  }

  function rememberPoseProps() {
    poseProps.children.forEach((item) => {
      item.userData.poseBase = {
        position: item.position.clone(),
        rotation: item.rotation.clone(),
        scale: item.scale.clone(),
      };
      item.visible = false;
    });
  }

  function resetPosePropsFrame() {
    poseProps.children.forEach((item) => {
      const base = item.userData.poseBase;
      if (base) {
        item.position.copy(base.position);
        item.rotation.copy(base.rotation);
        item.scale.copy(base.scale);
      }
      item.visible = false;
    });
  }

  function withRole(role, callback) {
    let roleIndex = 0;
    poseProps.children.forEach((item) => {
      if (item.userData.poseRole !== role) return;
      item.visible = true;
      callback?.(item, roleIndex++);
    });
  }

  function phaseAt(elapsed, start, end) {
    if (elapsed <= start) return 0;
    if (elapsed >= end) return 1;
    return ease((elapsed - start) / (end - start));
  }

  function pulseAt(elapsed, start, end) {
    if (elapsed <= start || elapsed >= end) return 0;
    return Math.sin((elapsed - start) / (end - start) * Math.PI);
  }

  function holdAt(elapsed, enterStart, enterEnd, leaveStart, leaveEnd) {
    return Math.min(phaseAt(elapsed, enterStart, enterEnd), 1 - phaseAt(elapsed, leaveStart, leaveEnd));
  }

  function setEyes(walker, openness) {
    [walker.parts.leftEye, walker.parts.rightEye].forEach((eye) => {
      const base = eye?.userData?.poseBase?.scale;
      if (eye && base) eye.scale.y = base.y * Math.max(.08, openness);
    });
  }

  function setSmile(walker, amount = 1) {
    const mouth = walker.parts.mouth;
    const base = mouth?.userData?.poseBase?.scale;
    if (mouth && base) {
      mouth.scale.x = base.x * (1 + amount * .18);
      mouth.scale.y = base.y * (1 + amount * .3);
    }
    setEyes(walker, 1 - amount * .34);
  }

  function setSurprised(walker, amount = 1) {
    setEyes(walker, 1 + amount * .28);
    const mouth = walker.parts.mouth;
    const base = mouth?.userData?.poseBase?.scale;
    if (mouth && base) {
      mouth.scale.x = base.x * (1 - amount * .35);
      mouth.scale.y = base.y * (1 + amount * .8);
    }
  }

  function squashWalker(walker, amount) {
    walker.model.scale.x *= 1 + amount * .12;
    walker.model.scale.y *= 1 - amount * .12;
  }

  function buildPoseProps(index) {
    clearPoseProps();
    poseProps.position.set(meetCenter, 0, 0);
    poseProps.rotation.set(0, 0, 0);
    poseProps.scale.setScalar(1);
    const gold = 0xf3c64f;
    const white = 0xf5f7fb;
    const dark = 0x29364e;
    const red = 0xe85b62;
    const green = 0x4aa978;
    switch (index) {
      case 0: tagProp(addStar(gold,0,.62,.22,"contact"),"contact"); break;
      case 1: tagProp(addRing(0x8fd1ff,0,.18,.28,.045),"contact"); break;
      case 2: tagProp(addStar(gold,0,.65,.16,"bowSpark"),"bowSpark"); break;
      case 3: addStar(gold,-.2,-.58,.14,"landing"); addStar(0x8fd1ff,.2,-.58,.14,"landing"); break;
      case 4: tagProp(addText("?", "#ffd34e",0,.95,.65,110),"question"); break;
      case 5: {
        tagProp(addBox(dark,-.35,.3,.2,.38,.08,-.14),"phone");
        const flash=addEllipse(white,0,.2,1.25,1.0,"flash",.34); flash.material.depthTest=false;
        break;
      }
      case 6: addStar(gold,-.15,.55,.15,"waveSpark"); addStar(0x8fd1ff,.15,.55,.15,"waveSpark"); break;
      case 7: addStar(gold,.1,.15,.16,"poke"); tagProp(addText("!", "#ffd34e",.92,.85,.55,104),"poke"); break;
      case 8: {
        addEllipse(0x75b9f2,-.88,.98,.28,.36,"balloonBlue");
        tagProp(addBox(0xdbe8f2,-.88,.5,.018,.34,.02),"balloonBlue");
        addEllipse(0xff879b,.88,.92,.28,.36,"balloonNavy");
        tagProp(addBox(0xdbe8f2,.88,.44,.018,.34,.02),"balloonNavy");
        break;
      }
      case 9: addStar(gold,0,.28,.2,"joined"); break;
      case 10: {
        const responsiveWidthScale = compactHeader ? .6 : .65 * .8;
        const titleOffsetX = compactHeader ? 0 : -.2;
        const titleWidth = Math.min(25, triggerWorldWidth * .96) / 1.5 * responsiveWidthScale;
        const titleStyle = {
          fontWeight: 800,
          fontFamily: '"SF Pro Display", "Segoe UI Variable Display", "Avenir Next", "Helvetica Neue", Arial, sans-serif',
          letterSpacing: 7,
          strokeWidth: 2,
          strokeColor: "rgba(20, 55, 92, .18)",
          shadowColor: "rgba(24, 72, 112, .2)",
          shadowBlur: 10,
          shadowOffsetY: 3,
          resolutionScale: 2,
        };
        tagProp(addText("DKU", "#62b6e8",titleOffsetX,.84,titleWidth,220,2.05/titleWidth,titleStyle),"dku");
        tagProp(addText("MED", "#173a63",titleOffsetX,-.84,titleWidth,220,2.05/titleWidth,titleStyle),"med");
        break;
      }
      case 11: {
        const responsiveWidthScale = compactHeader ? .6 : .65 * .8;
        const titleOffsetX = compactHeader ? 0 : -.2;
        const numberWidth = Math.min(16, triggerWorldWidth * 1.45) * .9 / 1.2 * responsiveWidthScale;
        const numberStyle = {
          fontWeight: 800,
          fontFamily: '"SF Pro Display", "Segoe UI Variable Display", "Avenir Next", "Helvetica Neue", Arial, sans-serif',
          letterSpacing: 10,
          strokeWidth: 2,
          strokeColor: "rgba(20, 55, 92, .16)",
          shadowColor: "rgba(24, 72, 112, .2)",
          shadowBlur: 12,
          shadowOffsetY: 3,
          resolutionScale: 2,
        };
        tagProp(addText("26", "#327fb8",titleOffsetX,0,numberWidth,230,(4.35*.9/1.2)/numberWidth,numberStyle),"number");
        break;
      }
      case 12: {
        [[0,.9,.12,.28,.08,-.55],[-.11,.62,.12,.3,.08,.55],[.08,.35,.13,.32,.08,-.52]].forEach(([x,y,sx,sy,sz,rz])=>tagProp(addBox(gold,x,y,sx,sy,sz,rz),"lightning"));
        const flash=addEllipse(white,0,.25,1.35,1.05,"lightFlash",.28); flash.material.depthTest=false;
        break;
      }
      case 13:
        [-.45,-.12,.2].forEach((x,i)=>addArc(white,x,.28,.18+i*.05,"blueSneeze",i*.08));
        [.45,.12,-.2].forEach((x,i)=>addArc(white,x,.24,.16+i*.04,"navySneeze",Math.PI+i*.08));
        break;
      case 14:
        tagProp(addText("힉!", "#ffd34e",-.68,.92,.65,86),"blueHic");
        tagProp(addText("!", "#ffffff",.72,.92,.52,104),"navyHic");
        break;
      case 15:
        tagProp(addText("Z Z Z", "#9ed7f2",-.25,1.02,1.25,72),"sleep");
        addStar(gold,.15,.4,.13,"tap");
        break;
      case 16: {
        const bubble=tagProp(addRing(0x8fdcff,0,-.2,.34,.045),"bubble"); bubble.material.transparent=true; bubble.material.opacity=.78;
        addEllipse(white,-.1,-.08,.07,.1,"bubble",.85);
        for(let i=0;i<5;i++) addStar(i%2?gold:0x8fdcff,(i-2)*.18,.15+Math.abs(i-2)*.08,.1,"bubblePop");
        break;
      }
      case 17: addStar(gold,.72,1.2,.27,"fallingStar"); break;
      case 18:
        addEllipse(white,-1.4,1.0,.12,.34,"feather");
        tagProp(addBox(0xcad5df,-1.4,1.0,.018,.27,.02,-.18),"feather");
        break;
      case 19: [-1.45,-.9,-.35].forEach((x,i)=>addArc(white,x,.2+i*.25,.34,"wind",i*.08)); break;
      case 20:
        addEllipse(green,.75,1.25,.18,.32,"leaf");
        tagProp(addBox(0x2f8156,.75,1.04,.02,.17,.02,-.32),"leaf");
        break;
      case 21: addEllipse(0xff7f86,-1.45,-.55,.25,.25,"ball"); addStar(gold,0,.25,.16,"ballContact"); break;
      case 22:
        tagProp(propMesh(new THREE.ConeGeometry(.32,.72,3),white,[-1.6,.75,1.4],[1,1,.18],[0,0,-Math.PI/2]),"plane");
        tagProp(addBox(0xaab8c6,-1.6,.75,.2,.018,.03,-.12),"plane");
        break;
      case 23:
        addEllipse(0xff9ec4,-.14,.1,.22,.28,"butterfly"); addEllipse(0x8fd1ff,.14,.1,.22,.28,"butterfly");
        addEllipse(dark,0,.08,.05,.22,"butterfly");
        break;
      case 24: for(let i=0;i<5;i++) addStar(white,-1.15+i*.58,1.15-(i%2)*.28,.1+(i%2)*.025,"snow"); break;
      case 25:
        addDrop(0x75c9f2,-.82,1.2,"dropBlue"); addDrop(0x75c9f2,.82,1.2,"dropNavy");
        ["splashBlue","splashNavy"].forEach((role,side)=>{for(let i=0;i<3;i++) addBall(0x75c9f2,(side? .82:-.82)+(i-1)*.12,.55,.055); poseProps.children.slice(-3).forEach(item=>tagProp(item,role));});
        break;
      case 26: {
        [-.25,0,.27].forEach((x,i)=>addEllipse(0xdde6ef,x,.95,.38-i*.03,.25+i*.03,"cloud"));
        const shadow=addEllipse(0x2a3850,0,.0,1.25,.62,"shadow",.18); shadow.material.depthTest=false;
        break;
      }
      case 27:
        addStar(gold,0,.38,.22,"sparkCenter"); addStar(0x8fd1ff,1.45,.5,.22,"sparkRight");
        addStar(0xff9ec4,-1.45,.5,.22,"sparkLeft"); addStar(white,0,.38,.31,"sparkFinal");
        break;
      case 28:
        [-1.42,-1.2,1.2,1.42].forEach((x,i)=>addArc(i<2?0x8fd1ff:gold,x,.25+(i%2)*.45,.18,"shakeLine",i<2?Math.PI:0));
        break;
    }
    rememberPoseProps();
  }

  function sceneScale(factor) {
    blue.scale.setScalar(modelScale * factor);
    navy.scale.setScalar(modelScale * factor);
  }

  function scenePlace(gap, y, blueY = 0, navyY = 0) {
    blue.position.x = meetCenter - gap;
    navy.position.x = meetCenter + gap;
    blue.position.y = y + blueY;
    navy.position.y = y + navyY;
  }

  function applySequenceLayout(index, elapsed) {
    const duration = POSE_DURATIONS[index] || 4;
    const finish = 1 - phaseAt(elapsed, duration - .65, duration);
    const wave = Math.sin(elapsed * 8);
    const slow = Math.sin(elapsed * 3.4);
    const blueWalker = walkers.blue;
    const navyWalker = walkers.navy;
    const innerArms = (blueAngle, navyAngle) => {
      blueWalker.parts.rightArm.rotation.z = blueAngle;
      navyWalker.parts.leftArm.rotation.z = navyAngle;
    };
    const lookIn = (amount) => {
      blue.rotation.y = .28 * amount;
      navy.rotation.y = -.28 * amount;
    };

    resetPosePropsFrame();
    sceneScale(.82);
    scenePlace(POSE_GAP, -2.48);

    switch (index) {
      case 0: { // 하이파이브
        const look = holdAt(elapsed,.5,.9,2.2,2.9)*finish;
        const reach = holdAt(elapsed,.9,1.5,1.9,2.6)*finish;
        const hit = pulseAt(elapsed,1.45,1.95);
        lookIn(look);
        innerArms(mix(.12,1.65,reach),mix(-1.08,-.15,reach));
        blue.position.y += hit*.17; navy.position.y += hit*.17;
        if(elapsed>=1.45&&elapsed<=2.05) withRole("contact",item=>item.scale.multiplyScalar(.75+hit*.55));
        if(elapsed>1.45) {setSmile(blueWalker,.8*finish);setSmile(navyWalker,.8*finish);}
        break;
      }
      case 1: { // 둥근 앞발 맞대기
        const reach=holdAt(elapsed,.9,1.5,2.0,2.65)*finish;
        const bump=pulseAt(elapsed,1.48,2.0);
        lookIn(holdAt(elapsed,.5,.9,2.15,2.8)*finish);
        innerArms(mix(.12,1.28,reach),mix(-1.08,.18,reach));
        blue.position.x-=bump*.09; navy.position.x+=bump*.09;
        if(elapsed>=1.45&&elapsed<=2.1) withRole("contact",item=>item.scale.multiplyScalar(.7+bump*.5));
        if(elapsed>1.5){setSmile(blueWalker,.7*finish);setSmile(navyWalker,.7*finish);}
        break;
      }
      case 2: { // 꾸벅 인사
        const bow=holdAt(elapsed,.8,1.4,2.0,2.7)*finish;
        const second=pulseAt(elapsed,1.45,1.95)*.08;
        [blue,navy].forEach(model=>{model.rotation.x=(bow+second)*.42;model.position.y-=(bow+second)*.18;});
        if(elapsed>=2.45&&elapsed<=2.9) withRole("bowSpark",item=>item.scale.multiplyScalar(.75+pulseAt(elapsed,2.45,2.9)*.45));
        if(elapsed>.7&&elapsed<.92){setEyes(blueWalker,.12);setEyes(navyWalker,.12);}
        if(elapsed>2.2){setSmile(blueWalker,.75*finish);setSmile(navyWalker,.75*finish);}
        break;
      }
      case 3: { // 동시에 점프
        const prepare=holdAt(elapsed,.9,1.3,1.3,1.42);
        const jump=pulseAt(elapsed,1.3,1.82);
        const landing=pulseAt(elapsed,1.8,2.25);
        lookIn(holdAt(elapsed,.5,.9,2.25,2.8)*finish);
        blue.position.y+=jump*.72+landing*.08;navy.position.y+=jump*.72+landing*.08;
        squashWalker(blueWalker,prepare*.8+landing*.55);squashWalker(navyWalker,prepare*.8+landing*.55);
        blueWalker.parts.leftArm.rotation.z-=jump*.55;blueWalker.parts.rightArm.rotation.z+=jump*.55;
        navyWalker.parts.leftArm.rotation.z-=jump*.35;navyWalker.parts.rightArm.rotation.z+=jump*.35;
        if(elapsed>=1.78&&elapsed<=2.3) withRole("landing",item=>item.scale.multiplyScalar(.65+landing*.5));
        if(elapsed>1.25){setSmile(blueWalker,.85*finish);setSmile(navyWalker,.85*finish);}
        break;
      }
      case 4: { // 동시에 갸웃
        const first=holdAt(elapsed,.5,1.1,1.7,1.86);
        const blueSecond=holdAt(elapsed,1.7,2.25,2.45,3.0);
        const navySecond=holdAt(elapsed,1.85,2.4,2.55,3.05);
        blue.rotation.z=(first*.24-blueSecond*.24)*finish;
        navy.rotation.z=(first*.24-navySecond*.24)*finish;
        if(elapsed>=1.12&&elapsed<=1.48){setEyes(blueWalker,.12);setEyes(navyWalker,.12);}
        if(elapsed>=.45&&elapsed<=2.7) withRole("question",item=>{item.position.y+=slow*.04;item.rotation.z=slow*.05;});
        if(elapsed>2.4){lookIn(.65*finish);setSmile(blueWalker,.7*finish);setSmile(navyWalker,.7*finish);}
        break;
      }
      case 5: { // 셀카
        const phone=holdAt(elapsed,.5,1.1,3.0,3.7);
        const gather=holdAt(elapsed,1.1,1.9,2.65,3.3)*finish;
        blue.position.x+=gather*.22;navy.position.x-=gather*.22;
        blue.rotation.z=-gather*.06;navy.rotation.z=gather*.08;
        blueWalker.parts.rightArm.rotation.z=mix(.12,1.55,phone);
        if(phone>0) withRole("phone",item=>{item.position.x-=phone*.15;item.position.y+=phone*.34;item.rotation.z-=phone*.12;});
        if(elapsed>=2.2&&elapsed<=2.4) withRole("flash",item=>{item.scale.multiplyScalar(.7+pulseAt(elapsed,2.2,2.4)*.5);});
        if(elapsed>=2.2&&elapsed<=2.4){blue.position.y+=.08;navy.position.y+=.08;}
        if(elapsed>1.7){setSmile(blueWalker,.9*finish);setSmile(navyWalker,.9*finish);}
        break;
      }
      case 6: { // 앞발 흔들기
        const blueWave=holdAt(elapsed,.5,.85,2.7,3.2)*finish;
        const navyWave=holdAt(elapsed,1.2,1.55,2.7,3.2)*finish;
        lookIn(holdAt(elapsed,.45,.8,2.8,3.3)*finish);
        blueWalker.parts.rightArm.rotation.z=mix(.12,1.75+wave*.18,blueWave);
        navyWalker.parts.leftArm.rotation.z=mix(-1.08,-.36-wave*.18,navyWave);
        if(elapsed>=2&&elapsed<=2.8) withRole("waveSpark",(item,i)=>{item.position.y+=Math.sin(elapsed*7+i)*.08;});
        if(elapsed>1.8){setSmile(blueWalker,.8*finish);setSmile(navyWalker,.8*finish);}
        break;
      }
      case 7: { // 옆구리 콕
        const reach=holdAt(elapsed,1.1,1.7,2.05,2.35)*finish;
        blue.rotation.y=.28*holdAt(elapsed,.5,1.1,2.3,3.1)*finish;
        blue.position.x+=reach*.2;
        blueWalker.parts.rightArm.rotation.z=mix(.12,.88,reach);
        const react=pulseAt(elapsed,1.68,2.18);
        navy.position.x+=react*.16;navy.position.y+=react*.14;navy.rotation.z=-react*.1;squashWalker(navyWalker,react*.45);
        if(elapsed>=1.65&&elapsed<=2.25) withRole("poke",item=>item.scale.multiplyScalar(.7+react*.5));
        const fake=holdAt(elapsed,2.8,3.12,3.25,3.55)*finish;
        navy.position.x-=fake*.14;blue.position.x-=fake*.12;navy.rotation.y=-fake*.25;
        if(react>.2)setSurprised(navyWalker,react);if(elapsed>2.1){setSmile(blueWalker,.8*finish);setSmile(navyWalker,.55*finish);}
        break;
      }
      case 8: { // 풍선
        const release=phaseAt(elapsed,1.0,1.5);
        const rise=phaseAt(elapsed,1.5,2.65);
        lookIn(holdAt(elapsed,.5,1.0,2.8,3.4)*finish);
        blueWalker.parts.rightArm.rotation.z=mix(.12,1.75,holdAt(elapsed,.65,1.15,1.5,2.0));
        navyWalker.parts.leftArm.rotation.z=mix(-1.08,-.35,holdAt(elapsed,.65,1.15,1.5,2.0));
        withRole("balloonBlue",(item,i)=>{item.position.y+=rise*2.1;item.position.x+=Math.sin(elapsed*4+i)*.05;if(rise>=.98)item.visible=false;});
        withRole("balloonNavy",(item,i)=>{const delayed=phaseAt(elapsed,1.62,2.8);item.position.y+=delayed*2.1;item.position.x+=Math.sin(elapsed*3.6+i)*.05;if(delayed>=.98)item.visible=false;});
        if(release>.4){blue.rotation.x=-.08*finish;navy.rotation.x=-.08*finish;}
        if(elapsed>2.8){setSmile(blueWalker,.75*finish);setSmile(navyWalker,.75*finish);}
        break;
      }
      case 9: { // 앞발 맞대고 점프
        const join=holdAt(elapsed,.55,1.2,3.35,3.75)*finish;
        const crouch=holdAt(elapsed,1.5,1.9,1.9,2.0);
        const jump=pulseAt(elapsed,1.9,2.45);
        const land=pulseAt(elapsed,2.4,2.92);
        lookIn(join*.8);
        innerArms(mix(.12,1.32,join),mix(-1.08,.1,join));
        blue.position.y+=jump*.68;navy.position.y+=jump*.68;squashWalker(blueWalker,crouch+land*.5);squashWalker(navyWalker,crouch+land*.5);
        if(elapsed>=1.05&&elapsed<=3.45) withRole("joined",item=>{item.position.y+=jump*.68;item.scale.multiplyScalar(.72+jump*.35);});
        if(jump>.1||elapsed>2.5){setSmile(blueWalker,.85*finish);setSmile(navyWalker,.85*finish);}
        break;
      }
      case 10: { // DKU MED
        let bearScale=1;
        if(elapsed>=.5&&elapsed<1)bearScale=1-phaseAt(elapsed,.5,1);
        else if(elapsed>=1&&elapsed<3.2)bearScale=.001;
        else if(elapsed>=3.2)bearScale=Math.max(.001,phaseAt(elapsed,3.2,3.7));
        sceneScale(.82*bearScale);const spinAway=1-phaseAt(elapsed,3.2,3.75);blue.rotation.z=-phaseAt(elapsed,.5,1)*.12*spinAway;navy.rotation.z=phaseAt(elapsed,.5,1)*.12*spinAway;
        if(elapsed>=1.2&&elapsed<=3.15) withRole("dku",item=>{item.position.y+=mix(-.22,0,phaseAt(elapsed,1.2,1.5));item.scale.multiplyScalar(holdAt(elapsed,1.2,1.5,2.7,3.15));});
        if(elapsed>=1.4&&elapsed<=3.15) withRole("med",item=>{item.position.y+=mix(-.18,0,phaseAt(elapsed,1.4,1.7));item.scale.multiplyScalar(holdAt(elapsed,1.4,1.7,2.7,3.15));});
        if((elapsed>=.55&&elapsed<=1.05)||(elapsed>=3.15&&elapsed<=3.75)) withRole("pop",(item,i)=>item.scale.multiplyScalar(.65+pulseAt(elapsed,elapsed<2?.55:3.15,elapsed<2?1.05:3.75)*.55));
        break;
      }
      case 11: { // 26
        let bearScale=1;
        if(elapsed>=.9&&elapsed<1.3)bearScale=1-phaseAt(elapsed,.9,1.3);
        else if(elapsed>=1.3&&elapsed<3.1)bearScale=.001;
        else if(elapsed>=3.1)bearScale=Math.max(.001,phaseAt(elapsed,3.1,3.6));
        sceneScale(.82*bearScale);const spinAway=1-phaseAt(elapsed,3.1,3.65);blue.rotation.z=-phaseAt(elapsed,.9,1.3)*.22*spinAway;navy.rotation.z=phaseAt(elapsed,.9,1.3)*.22*spinAway;
        if(elapsed>=1.3&&elapsed<=3.1) withRole("number",item=>{const pop=phaseAt(elapsed,1.3,1.7);item.scale.multiplyScalar((.7+pop*.45)-(pop>.75?(pop-.75)*.2:0));item.position.y+=phaseAt(elapsed,2.7,3.1)*.2;});
        if(elapsed>=1.55&&elapsed<=2.9) withRole("numberSpark",(item,i)=>{item.scale.multiplyScalar(.75+Math.abs(Math.sin(elapsed*6+i))*.4);});
        break;
      }
      case 12: { // 번개
        if(elapsed>=.6&&elapsed<=.82){withRole("lightning",item=>item.scale.multiplyScalar(.8+pulseAt(elapsed,.6,.82)*.45));withRole("lightFlash");}
        const blueJump=pulseAt(elapsed,.78,1.3);const navyJump=pulseAt(elapsed,1.4,2.02);
        blue.position.y+=blueJump*.58;navy.position.y+=navyJump*.78;
        if(blueJump>.05){setSurprised(blueWalker,blueJump);blueWalker.parts.leftArm.rotation.z-=blueJump*.85;blueWalker.parts.rightArm.rotation.z+=blueJump*.85;}
        if(navyJump>.05){setSurprised(navyWalker,navyJump);navyWalker.parts.leftArm.rotation.z-=navyJump*.55;navyWalker.parts.rightArm.rotation.z+=navyJump*.55;}
        if(elapsed>=2&&elapsed<=2.55)navy.rotation.z=Math.sin(elapsed*24)*.07;
        if(elapsed>=3.05&&elapsed<=3.65)navyWalker.parts.rightArm.rotation.z=mix(1.08,2.0,holdAt(elapsed,3.05,3.25,3.5,3.65));
        if(elapsed>2.5){lookIn(.55*finish);setSmile(blueWalker,.8*finish);setSmile(navyWalker,.55*finish);}
        break;
      }
      case 13: { // 연속 재채기
        const bluePrep=holdAt(elapsed,.5,1.15,1.15,1.3);const blueSneeze=pulseAt(elapsed,1.2,1.72);
        blueWalker.parts.leftArm.rotation.z-=bluePrep*1.1;blueWalker.parts.rightArm.rotation.z+=bluePrep*1.1;
        blue.rotation.x=blueSneeze*.34;blue.position.y-=blueSneeze*.18;navy.position.x+=blueSneeze*.18;navy.rotation.z=-blueSneeze*.08;
        if(blueSneeze>.05){setEyes(blueWalker,.1);withRole("blueSneeze",(item,i)=>{item.position.x+=blueSneeze*(.18+i*.08);item.scale.multiplyScalar(.6+blueSneeze*.5);});setSurprised(navyWalker,blueSneeze*.8);}
        const navyPrep=holdAt(elapsed,2.2,2.75,2.75,2.9);const navySneeze=pulseAt(elapsed,2.8,3.32);
        navyWalker.parts.leftArm.rotation.z-=navyPrep*.85;navyWalker.parts.rightArm.rotation.z+=navyPrep*.85;
        navy.rotation.x=navySneeze*.28;navy.position.y-=navySneeze*.14;blue.position.x-=navySneeze*.11;
        if(navySneeze>.05){setEyes(navyWalker,.1);withRole("navySneeze",(item,i)=>{item.position.x-=navySneeze*(.15+i*.07);item.scale.multiplyScalar(.6+navySneeze*.45);});}
        if(elapsed>3.25){lookIn(.6*finish);setSmile(blueWalker,.75*finish);setSmile(navyWalker,.75*finish);}
        break;
      }
      case 14: { // 딸꾹질
        const hic1=pulseAt(elapsed,.5,.92);const hic2=pulseAt(elapsed,1.5,1.92);const fake=pulseAt(elapsed,2.7,3.12);
        blue.position.y+=hic1*.22+hic2*.31;navy.position.y+=fake*.28;
        if(hic1>.1||hic2>.1){setSurprised(blueWalker,Math.max(hic1,hic2));withRole("blueHic",item=>{item.scale.multiplyScalar(.7+Math.max(hic1,hic2)*.45);});}
        if(hic2>.1){blueWalker.parts.leftArm.rotation.z-=hic2*.75;blueWalker.parts.rightArm.rotation.z+=hic2*.75;}
        if(fake>.1){setSurprised(navyWalker,fake);withRole("navyHic",item=>item.scale.multiplyScalar(.7+fake*.45));}
        if(elapsed>3.05){lookIn(.55*finish);setSmile(blueWalker,.85*finish);setSmile(navyWalker,.55*finish);}
        break;
      }
      case 15: { // 졸다 기대기
        const nod1=pulseAt(elapsed,.6,1.02);const nod2=pulseAt(elapsed,1.08,1.52);
        blue.rotation.x=(nod1*.12+nod2*.24);blue.position.y-=nod1*.05+nod2*.1;
        if(elapsed>.65&&elapsed<3.35)setEyes(blueWalker,.14);
        const lean=holdAt(elapsed,1.5,2.2,3.25,3.8)*finish;
        blue.rotation.z=-lean*.2;blue.position.x+=lean*.28;navy.position.x+=lean*.05;
        navyWalker.parts.leftArm.rotation.z=mix(-1.08,-.2,lean);
        if(elapsed>=2.2&&elapsed<=2.85) withRole("sleep",item=>{item.position.y+=slow*.05;});
        const tap=elapsed>=2.7&&elapsed<=3.3?Math.abs(Math.sin((elapsed-2.7)*10)):0;
        navyWalker.parts.leftArm.rotation.z-=tap*.18;if(tap>.7)withRole("tap",item=>item.scale.multiplyScalar(.7+tap*.4));
        const wake=pulseAt(elapsed,3.3,3.82);blue.position.y+=wake*.35;if(wake>.1)setSurprised(blueWalker,wake);
        if(elapsed>3.75){lookIn(.45*finish);setSmile(blueWalker,.55*finish);setSmile(navyWalker,.8*finish);}
        break;
      }
      case 16: { // 비눗방울
        const rise=phaseAt(elapsed,0,.65);const reach=holdAt(elapsed,1.3,2.0,2.0,2.2)*finish;
        if(elapsed<2.02)withRole("bubble",item=>{item.position.y+=rise*.85;item.position.x+=Math.sin(elapsed*3)*.05;});
        blue.rotation.y=reach*.25;blueWalker.parts.rightArm.rotation.z=mix(.12,1.02,reach);
        const pop=pulseAt(elapsed,1.98,2.25);if(pop>0)withRole("bubblePop",(item,i)=>{item.position.x+=(i-2)*pop*.12;item.position.y+=pop*.2;item.scale.multiplyScalar(.55+pop*.55);});
        const recoil=pulseAt(elapsed,2.05,2.75);blue.rotation.z=-recoil*.12;navy.rotation.z=-pulseAt(elapsed,2.22,2.78)*.07;
        if(recoil>.1)setSurprised(blueWalker,recoil);
        if(elapsed>2.75){lookIn(.45*finish);setSmile(blueWalker,.65*finish);setSmile(navyWalker,.8*finish);}
        break;
      }
      case 17: { // 떨어지는 별
        const fall=phaseAt(elapsed,.5,1.75);const rest=holdAt(elapsed,1.7,1.9,3.0,3.55);
        if(elapsed>=.5)withRole("fallingStar",item=>{item.position.x=mix(-.2,.72,fall);item.position.y=mix(1.35,.72,fall)+phaseAt(elapsed,3.0,3.55)*.75;item.rotation.z+=elapsed*.8;item.scale.multiplyScalar(.9+Math.abs(Math.sin(elapsed*8))*rest*.18);if(elapsed>3.5)item.visible=false;});
        const dodge=holdAt(elapsed,1.18,1.55,2.1,2.6)*finish;blue.position.x-=dodge*.22;blue.rotation.z=-dodge*.1;
        if(elapsed>=1.7&&elapsed<=3.2){navy.rotation.z=Math.sin(elapsed*7)*.04;setSurprised(navyWalker,.45);}
        if(elapsed>2.35){setSmile(blueWalker,.8*finish);}
        break;
      }
      case 18: { // 깃털 재채기
        const approach=phaseAt(elapsed,.5,2.05);const sneeze=pulseAt(elapsed,2.08,2.62);
        if(elapsed>=.5)withRole("feather",(item,i)=>{if(elapsed<2.58){item.position.x=mix(-1.55,-.68,approach)+Math.sin(elapsed*5+i)*.05;item.position.y=mix(1.15,.62,approach);}else{const fly=phaseAt(elapsed,2.58,3.12);item.position.x=mix(-.68,1.8,fly);item.position.y=.62+fly*.3;}item.rotation.z+=Math.sin(elapsed*4)*.18;if(elapsed>3.12)item.visible=false;});
        const tickle=holdAt(elapsed,1.4,1.8,2.05,2.18);blueWalker.parts.leftArm.rotation.z-=tickle*.9;blueWalker.parts.rightArm.rotation.z+=tickle*.9;blue.rotation.z=Math.sin(elapsed*20)*tickle*.018;
        blue.rotation.x=sneeze*.34;blue.position.y-=sneeze*.18;if(sneeze>.1)setEyes(blueWalker,.1);
        const duck=pulseAt(elapsed,2.55,3.15);navy.position.y-=duck*.22;squashWalker(navyWalker,duck*.5);
        if(elapsed>3.08){lookIn(.5*finish);setSmile(blueWalker,.55*finish);setSmile(navyWalker,.8*finish);}
        break;
      }
      case 19: { // 바람에 밀리기
        const wind=holdAt(elapsed,.5,1.1,2.8,3.35)*finish;
        if(wind>0)withRole("wind",(item,i)=>{item.position.x+=phaseAt(elapsed,.5,2.45)*2.5;item.position.y+=Math.sin(elapsed*4+i)*.04;item.scale.multiplyScalar(.75+wind*.35);});
        blue.rotation.z=-wind*.12;navy.rotation.z=-wind*.08;setEyes(blueWalker,1-wind*.55);setEyes(navyWalker,1-wind*.55);
        const slide=holdAt(elapsed,1.8,2.3,2.8,3.35);blue.position.x+=slide*.2;navy.position.x+=slide*.04;navyWalker.parts.leftArm.rotation.z=mix(-1.08,-.28,slide);
        if(elapsed>3.2){lookIn(.45*finish);setSmile(blueWalker,.6*finish);setSmile(navyWalker,.65*finish);}
        break;
      }
      case 20: { // 잎사귀
        const fall=phaseAt(elapsed,0,.7);const attached=elapsed>=.65&&elapsed<3.45;
        withRole("leaf",item=>{if(elapsed<.7){item.position.x+=Math.sin(elapsed*7)*.15;item.position.y-=fall*.58;}else if(elapsed<3.2){item.position.set(.72,.72,item.position.z);item.rotation.z=slow*.08;}else{const drop=phaseAt(elapsed,3.2,3.65);item.position.set(.72,.72-drop*1.45,item.position.z);item.rotation.z+=drop*2.2;}if(elapsed>3.65)item.visible=false;});
        if(attached)setSurprised(blueWalker,.45);
        const signal=holdAt(elapsed,1.2,2.0,2.7,3.15);blueWalker.parts.leftArm.rotation.z=mix(-.12,-1.65,signal);navyWalker.parts.rightArm.rotation.z=mix(1.08,1.85,holdAt(elapsed,2,2.7,3.2,3.55));
        if(elapsed>=3.15&&elapsed<=3.6)navy.rotation.z=Math.sin(elapsed*24)*.07;
        if(elapsed>3.55){lookIn(.5*finish);setSmile(blueWalker,.75*finish);setSmile(navyWalker,.75*finish);}
        break;
      }
      case 21: { // 공 놓치기
        let x=-1.5,y=-.55;
        if(elapsed<1.9){const move=phaseAt(elapsed,0,1.9);x=mix(-1.5,0,move);y=-.55+Math.abs(Math.sin(move*Math.PI*2.3))*(.28+move*.3);}else{const move=phaseAt(elapsed,1.9,2.9);x=mix(0,1.65,move);y=-.15-Math.abs(Math.sin(move*Math.PI*1.7))*.38;}
        withRole("ball",item=>{item.position.x=x;item.position.y=y;if(elapsed>2.85)item.visible=false;});
        const reach=holdAt(elapsed,1.3,1.9,2.2,2.65);innerArms(mix(.12,1.25,reach),mix(-1.08,.08,reach));lookIn(holdAt(elapsed,.6,1.1,2.7,3.35)*finish);
        if(elapsed>=1.88&&elapsed<=2.25)withRole("ballContact",item=>item.scale.multiplyScalar(.7+pulseAt(elapsed,1.88,2.25)*.5));
        if(elapsed>2.7){blue.rotation.z=Math.sin(elapsed*5)*.04*finish;navy.rotation.z=-Math.sin(elapsed*5)*.04*finish;setSmile(blueWalker,.65*finish);setSmile(navyWalker,.65*finish);}
        break;
      }
      case 22: { // 종이비행기
        const fly=phaseAt(elapsed,.5,2.8);if(elapsed>=.5)withRole("plane",item=>{item.position.x=mix(-1.7,1.8,fly);item.position.y=.82+Math.sin(fly*Math.PI)*.18;item.rotation.z-=fly*.12;if(fly>=.99)item.visible=false;});
        const blueDuck=holdAt(elapsed,1.15,1.42,1.6,1.95);blue.position.y-=blueDuck*.25;squashWalker(blueWalker,blueDuck*.55);
        const navyDuck=holdAt(elapsed,2.15,2.45,2.65,3.05);navy.position.y-=navyDuck*.32;squashWalker(navyWalker,navyDuck*.65);if(navyDuck>.2)setSurprised(navyWalker,navyDuck);
        if(elapsed>3.05){lookIn(.5*finish);setSmile(blueWalker,.8*finish);setSmile(navyWalker,.55*finish);}
        break;
      }
      case 23: { // 나비
        const travel=phaseAt(elapsed,.5,3.7);if(elapsed>=.5)withRole("butterfly",(item,i)=>{const angle=mix(-Math.PI*.9,Math.PI*.65,Math.min(1,travel*1.25));item.position.x=Math.cos(angle)*.75;item.position.y=.25+Math.sin(angle)*.55+phaseAt(elapsed,3.3,3.7)*1.0;if(i<2)item.scale.x*=.75+Math.abs(Math.sin(elapsed*7))* .35;if(elapsed>3.68)item.visible=false;});
        const follow=holdAt(elapsed,.55,1.15,3.3,3.8)*finish;blue.rotation.z=Math.sin(elapsed*2.2)*.07*follow;navy.rotation.z=Math.sin((elapsed-.2)*2.2)*.07*follow;
        const meetLook=holdAt(elapsed,2.3,2.8,3.3,3.7);lookIn(meetLook*.9);if(elapsed>2.75){setSmile(blueWalker,.75*finish);setSmile(navyWalker,.75*finish);}
        break;
      }
      case 24: { // 눈
        const fall=phaseAt(elapsed,.5,3.15);if(elapsed>=.5)withRole("snow",(item,i)=>{item.position.y-=fall*(1.25+i*.13);item.position.x+=Math.sin(elapsed*2.5+i)*.08;if(elapsed>3.55)item.visible=false;});
        const react=holdAt(elapsed,1.1,1.55,3.05,3.65)*finish;blueWalker.parts.leftArm.rotation.z-=react*.75;blueWalker.parts.rightArm.rotation.z+=react*.75;blue.position.y+=react*.08;setSmile(blueWalker,.8*react);
        const cold=holdAt(elapsed,1.2,1.65,3.0,3.6);navy.scale.x*=1-cold*.05;navy.scale.y*=1-cold*.08;navy.rotation.z=Math.sin(elapsed*18)*cold*.035;setEyes(navyWalker,1-cold*.45);
        const cuddle=holdAt(elapsed,2.5,3.1,3.25,3.65);navy.position.x-=cuddle*.18;blueWalker.parts.rightArm.rotation.z+=cuddle*.48;
        if(elapsed>=3.1&&elapsed<=3.65){blue.rotation.z=Math.sin(elapsed*22)*.045;navy.rotation.z=-Math.sin(elapsed*22)*.045;}
        break;
      }
      case 25: { // 물방울
        const dropBlue=phaseAt(elapsed,.5,.9);if(elapsed>=.5)withRole("dropBlue",item=>{item.position.y-=dropBlue*.72;if(dropBlue>=.98)item.visible=false;});
        const hitBlue=pulseAt(elapsed,.78,1.18);if(hitBlue>.05){blue.position.y+=hitBlue*.28;setSurprised(blueWalker,hitBlue);withRole("splashBlue",(item,i)=>{item.position.x+=(i-1)*hitBlue*.08;item.position.y+=hitBlue*.14;item.scale.multiplyScalar(.65+hitBlue*.4);});}
        const dropNavy=phaseAt(elapsed,2.1,2.5);if(elapsed>=2.1)withRole("dropNavy",item=>{item.position.y-=dropNavy*.72;if(dropNavy>=.98)item.visible=false;});
        const hitNavy=pulseAt(elapsed,2.38,3.05);if(hitNavy>.05){navy.position.y+=hitNavy*.42;squashWalker(navyWalker,hitNavy*.35);setSurprised(navyWalker,hitNavy);withRole("splashNavy",(item,i)=>{item.position.x+=(i-1)*hitNavy*.08;item.position.y+=hitNavy*.14;item.scale.multiplyScalar(.65+hitNavy*.4);});}
        if(elapsed>3.05){lookIn(.55*finish);setSmile(blueWalker,.8*finish);setSmile(navyWalker,.7*finish);blue.rotation.z=Math.sin(elapsed*20)*.035;navy.rotation.z=-Math.sin(elapsed*20)*.035;}
        break;
      }
      case 26: { // 구름
        const move=phaseAt(elapsed,.5,3.25);if(elapsed>=.5)withRole("cloud",item=>{item.position.x+=mix(-1.7,1.7,move);if(move>=.99)item.visible=false;});
        const shade=holdAt(elapsed,1.2,1.65,2.5,3.2);if(shade>0)withRole("shadow",item=>{item.material.opacity=.18*shade;item.scale.multiplyScalar(.75+shade*.25);});
        const lookBlue=holdAt(elapsed,1.15,1.55,3.0,3.5);const lookNavy=holdAt(elapsed,1.45,1.85,3.25,3.65);blue.rotation.x=-lookBlue*.1;navy.rotation.x=-lookNavy*.1;blue.rotation.z=slow*.025*lookBlue;navy.rotation.z=-slow*.025*lookNavy;
        break;
      }
      case 27: { // 순간이동 반짝임
        if(elapsed>=.5&&elapsed<1.1)withRole("sparkCenter",item=>item.scale.multiplyScalar(.8+pulseAt(elapsed,.5,1.1)*.45));
        if(elapsed>=1.1&&elapsed<1.7)withRole("sparkRight",item=>item.scale.multiplyScalar(.8+pulseAt(elapsed,1.1,1.7)*.45));
        if(elapsed>=1.7&&elapsed<2.3)withRole("sparkLeft",item=>item.scale.multiplyScalar(.8+pulseAt(elapsed,1.7,2.3)*.45));
        if(elapsed>=2.3&&elapsed<3.3)withRole("sparkFinal",item=>item.scale.multiplyScalar(.75+pulseAt(elapsed,2.3,3.3)*.65));
        blue.rotation.y=(elapsed<1.7?.22:elapsed<2.3?-.28:0)*finish;navy.rotation.y=(elapsed<1.1?-.2:elapsed<1.7?-.3:elapsed<2.3?.28:0)*finish;
        if(elapsed>3.25){lookIn(.45*finish);blue.rotation.z=.12*finish;navy.rotation.z=.12*finish;setSmile(blueWalker,.65*finish);setSmile(navyWalker,.65*finish);}
        break;
      }
      case 28: { // 캐릭터 영역만 흔들림
        const shake1=holdAt(elapsed,.6,.72,1.0,1.1);const shake2=holdAt(elapsed,1.55,1.68,2.0,2.12);const vibration=Math.sin(elapsed*28)*(shake1*.06+shake2*.1);
        blue.position.x+=vibration;navy.position.x-=vibration*.8;blue.rotation.z+=vibration*.7;navy.rotation.z-=vibration*.85;
        if(shake1>0||shake2>0)withRole("shakeLine",(item,i)=>{item.position.x+=(i<2?-1:1)*Math.abs(vibration)*2;item.scale.multiplyScalar(.7+Math.abs(vibration)*4);});
        const stumble=holdAt(elapsed,1.1,2.15,2.8,3.35)*finish;navy.position.x-=stumble*.28;navy.rotation.z=stumble*.18;blueWalker.parts.rightArm.rotation.z=mix(.12,.88,stumble);
        if(stumble>.2){setSurprised(blueWalker,.55);setSurprised(navyWalker,.65);}
        if(elapsed>2.8){lookIn(.55*finish);setSmile(blueWalker,.55*finish);setSmile(navyWalker,.55*finish);}
        break;
      }
    }
  }

  function poseFrame(index, elapsed) {
    const progress = Math.min(1, elapsed / 0.28);
    const settle = ease(progress);
    const held = Math.min(1, elapsed / (POSE_DURATIONS[index] || 3.8));
    const breathe = Math.sin(elapsed * 5) * 0.035;
    const blueX = meetCenter - POSE_GAP;
    const navyX = meetCenter + POSE_GAP;
    resetPoseTransforms();
    walkers.blue.model.position.set(blueX, -2.53 + breathe, 0.1);
    walkers.navy.model.position.set(navyX, -2.53 + breathe, 0.15);
    stopLegs(walkers.blue);
    stopLegs(walkers.navy);
    poseProps.position.set(meetCenter, 0, 0);
    poseProps.rotation.set(0, 0, 0);
    poseProps.scale.setScalar(1);

    applySequenceLayout(index, elapsed);
    if (settle < 1 || held < 1) {
      walkers.blue.model.rotation.z *= settle;
      walkers.navy.model.rotation.z *= settle;
    }
  }

  function beginNextPose() {
    if (interaction || (!sequenceReady && !forcedPoseEnabled)) return;
    const now = performance.now() / 1000;
    const forcedPose = forcedPoseEnabled;
    const nextPose = forcedPose
      ? poseTest - 1
      : getSequencedPose(sequenceCursor);
    if (!forcedPose) {
      sequenceCursor = (sequenceCursor + 1) % SEQUENCE_CYCLE_LENGTH;
      poseRequestCount += 1;
      saveAccountSequence();
    }
    interaction = {
      mode: "recall",
      index: nextPose,
      started: now,
      blue: { position: blue.position.clone(), rotationY: blue.rotation.y },
      navy: { position: navy.position.clone(), rotationY: navy.rotation.y },
    };
    poseButton.disabled = true;
  }

  function recallForPose(elapsed) {
    const progress = ease(Math.min(1, elapsed / RECALL_SECONDS));
    resetPoseTransforms();
    blue.position.set(mix(interaction.blue.position.x, meetCenter - POSE_GAP, progress), mix(interaction.blue.position.y, -2.48, progress), mix(interaction.blue.position.z, 0.1, progress));
    navy.position.set(mix(interaction.navy.position.x, meetCenter + POSE_GAP, progress), mix(interaction.navy.position.y, -2.48, progress), mix(interaction.navy.position.z, 0.15, progress));
    blue.rotation.y = mix(interaction.blue.rotationY, 0, progress);
    navy.rotation.y = mix(interaction.navy.rotationY, 0, progress);
    poseHands();
    walkMotion(walkers.blue, elapsed, 0.45);
    walkMotion(walkers.navy, elapsed, 0.45);
  }

  function approach(elapsed) {
    const progress = ease(Math.min(1, elapsed / approachDuration));
    walkers.blue.model.position.x = mix(-edge, meetCenter - meet, progress);
    walkers.navy.model.position.x = mix(edge, meetCenter + meet, progress);
    walkers.blue.model.position.z = 0;
    walkers.navy.model.position.z = 0.2;
    walkers.blue.model.rotation.y = 0.18;
    walkers.navy.model.rotation.y = -0.18;
    walkMotion(walkers.blue, elapsed);
    walkMotion(walkers.navy, elapsed);
  }

  function poseCooldown(elapsed) {
    resetPoseTransforms();
    const returnProgress = phaseAt(elapsed, 2, POSE_COOLDOWN_SECONDS);
    const gap = mix(POSE_GAP, meet, returnProgress);
    sceneScale(.82);
    scenePlace(gap, -2.48);
    stopLegs(walkers.blue);
    stopLegs(walkers.navy);
  }

  function restartFromEdges() {
    const now = performance.now() / 1000;
    chooseHands(now);
    cycleStarted = now - approachDuration * 0.28;
    interaction = null;
    clearPoseProps();
    poseButton.disabled = !sequenceReady && !forcedPoseEnabled;
    lastFrame = 0;
    resetPoseTransforms();
    poseHands();
    approach(approachDuration * 0.28);
    renderer.render(scene, camera);
  }

  function highFive(elapsed) {
    const progress = Math.min(1, elapsed / highFiveDuration);
    const jump = Math.sin(progress * Math.PI) * 0.72;
    walkers.blue.model.position.set(meetCenter - meet, -2.53 + jump, 0);
    walkers.navy.model.position.set(meetCenter + meet, -2.53 + jump, 0.2);
    walkers.blue.model.rotation.y = 0;
    walkers.navy.model.rotation.y = 0;
    walkers.blue.model.rotation.z = -Math.sin(progress * Math.PI) * 0.055;
    walkers.navy.model.rotation.z = Math.sin(progress * Math.PI) * 0.055;
    stopLegs(walkers.blue);
    stopLegs(walkers.navy);
  }

  function crossingHighFive(elapsed) {
    const progress = Math.min(1, elapsed / highFiveDuration);
    const blueFrom = walkers.blue.handUp ? BLUE_HIGH : BLUE_LOW;
    const navyFrom = walkers.navy.handUp ? NAVY_HIGH : NAVY_LOW;
    poseHandAngles(mix(blueFrom, BLUE_CONTACT, ease(progress)), mix(navyFrom, NAVY_CONTACT, ease(progress)));
    const smallHop = Math.sin(progress * Math.PI) * 0.2;
    walkers.blue.model.position.set(meetCenter - meet, -2.53 + smallHop, 0.25);
    walkers.navy.model.position.set(meetCenter + meet, -2.53 + smallHop, -0.3);
    walkers.blue.model.rotation.y = 0;
    walkers.navy.model.rotation.y = 0;
    walkers.blue.model.rotation.z = -Math.sin(progress * Math.PI) * 0.035;
    walkers.navy.model.rotation.z = Math.sin(progress * Math.PI) * 0.035;
    stopLegs(walkers.blue);
    stopLegs(walkers.navy);
  }

  function retreat(elapsed) {
    const progress = ease(Math.min(1, elapsed / exitDuration));
    walkers.blue.model.position.x = mix(meetCenter - meet, -edge, progress);
    walkers.navy.model.position.x = mix(meetCenter + meet, edge, progress);
    walkers.blue.model.rotation.y = -0.58;
    walkers.navy.model.rotation.y = 0.58;
    walkers.blue.model.position.z = 0;
    walkers.navy.model.position.z = 0.2;
    walkMotion(walkers.blue, elapsed);
    walkMotion(walkers.navy, elapsed);
  }

  function passBy(elapsed) {
    const progress = ease(Math.min(1, elapsed / exitDuration));
    const handProgress = ease(Math.min(1, elapsed / 0.7));
    const blueEnd = walkers.blue.handUp ? BLUE_LOW : BLUE_HIGH;
    const navyEnd = walkers.navy.handUp ? NAVY_LOW : NAVY_HIGH;
    walkers.blue.model.position.x = mix(meetCenter - meet, edge, progress);
    walkers.navy.model.position.x = mix(meetCenter + meet, -edge, progress);
    walkers.blue.model.rotation.y = 0.18;
    walkers.navy.model.rotation.y = -0.18;
    walkers.blue.model.position.z = 0.25;
    walkers.navy.model.position.z = -0.3;
    poseHandAngles(mix(BLUE_CONTACT, blueEnd, handProgress), mix(NAVY_CONTACT, navyEnd, handProgress));
    walkMotion(walkers.blue, elapsed);
    walkMotion(walkers.navy, elapsed);
  }

  function frame(time) {
    requestAnimationFrame(frame);
    if (!running || time - lastFrame < 1000 / 30) return;
    lastFrame = time;
    const now = time / 1000;
    const elapsed = now - cycleStarted;
    if (interaction) {
      const interactionElapsed = now - interaction.started;
      if (interaction.mode === "recall") {
        recallForPose(interactionElapsed);
        if (interactionElapsed >= RECALL_SECONDS) {
          buildPoseProps(interaction.index);
          poseButton.setAttribute("aria-label", `단웅이와 단비: ${POSE_NAMES[interaction.index]}`);
          interaction = { mode: "pose", index: interaction.index, started: now };
        }
      } else if (interaction.mode === "pose") {
        poseFrame(interaction.index, interactionElapsed);
        if (interactionElapsed >= (POSE_DURATIONS[interaction.index] || 3.8)) {
          interaction = { mode: "cooldown", index: interaction.index, started: now };
          clearPoseProps();
          poseButton.setAttribute("aria-label", "단웅이와 단비가 잠시 쉬는 중");
        }
      } else {
        poseCooldown(interactionElapsed);
        if (interactionElapsed >= POSE_COOLDOWN_SECONDS) {
          interaction = null;
          poseButton.setAttribute("aria-label", `다음 동작: ${POSE_NAMES[getSequencedPose(sequenceCursor)]}`);
          poseButton.disabled = !sequenceReady && !forcedPoseEnabled;
          cycleStarted = now - approachDuration;
        }
      }
      renderer.render(scene, camera);
      return;
    }
    resetPoseTransforms();
    poseHands();
    if (testPattern === "highfive-up" || testPattern === "highfive-down") {
      highFive(highFiveDuration / 2);
      renderer.render(scene, camera);
      return;
    }
    if (testPattern === "highfive-mismatch") {
      crossingHighFive(highFiveDuration);
      renderer.render(scene, camera);
      return;
    }
    if (elapsed < approachDuration) {
      approach(elapsed);
    } else if (elapsed < approachDuration + highFiveDuration) {
      if (sameHands) highFive(elapsed - approachDuration);
      else crossingHighFive(elapsed - approachDuration);
    } else {
      const exitElapsed = elapsed - approachDuration - highFiveDuration;
      if (sameHands) retreat(exitElapsed);
      else passBy(exitElapsed);
      if (exitElapsed >= exitDuration) {
        chooseHands(now);
        cycleStarted = now - approachDuration * 0.12;
        approach(approachDuration * 0.12);
      }
    }
    renderer.render(scene, camera);
  }

  function setMascotVisibility(visible, restart = false) {
    const shouldRestart = visible && (restart || !visibleState);
    visibleState = visible;
    canvas.hidden = !visible;
    poseButton.hidden = !visible;
    if (visible) canvas.style.removeProperty("display");
    else canvas.style.setProperty("display", "none", "important");
    if (shouldRestart) {
      resize();
      restartFromEdges();
    }
    running = visible && !document.hidden;
  }

  window.addEventListener("dkuMascotVisibility", (event) => {
    const visible = event.detail?.visible !== false;
    setMascotVisibility(visible, event.detail?.restart !== false && visible);
  });
  new MutationObserver(() => {
    const visible = document.documentElement.dataset.mascots !== "hide";
    setMascotVisibility(visible, visible && !visibleState);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-mascots"] });
  document.addEventListener("visibilitychange", () => {
    running = document.documentElement.dataset.mascots !== "hide" && !document.hidden;
  });
  window.addEventListener("resize", resize, { passive: true });
  if (!Number.isInteger(poseTest)) {
    poseButton.setAttribute("aria-label", `다음 동작: ${POSE_NAMES[getSequencedPose(sequenceCursor)]}`);
  }
  poseButton.addEventListener("click", (event) => {
    if (!compactHeader) {
      const homeLink = header.querySelector('.nav-menu a[href="index.html"]');
      const homeRect = homeLink?.getBoundingClientRect();
      if (homeLink && homeRect
        && event.clientX >= homeRect.left && event.clientX <= homeRect.right
        && event.clientY >= homeRect.top && event.clientY <= homeRect.bottom) {
        location.assign(homeLink.href);
        return;
      }
    }
    beginNextPose();
  });
  resize();
  restartFromEdges();
  if (Number.isInteger(poseTest) && poseTest >= 1 && poseTest <= POSE_NAMES.length) {
    window.setTimeout(beginNextPose, 250);
  }
  requestAnimationFrame(frame);
}
