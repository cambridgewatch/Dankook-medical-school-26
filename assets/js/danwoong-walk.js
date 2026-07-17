import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js";
import { createBlueDanwoong, createNavyDanwoong, getDanwoongParts } from "./danwoong-models.js?v=4";

const APPROACH_SECONDS = 6.6;
const HIGH_FIVE_SECONDS = 1.25;
const EXIT_SECONDS = 5.2;
const RECALL_SECONDS = 1.15;
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
  poseButton.setAttribute("aria-label", "단웅이와 단비의 랜덤 포즈 보기");
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
  let lastPoseIndex = -1;
  let triggerLeft = 0;
  let triggerWidth = 40;
  const testPattern = new URLSearchParams(location.search).get("danwoongTest");

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
    triggerWidth = hasHeaderGap ? Math.max(24, gapRight - gapLeft - 4) : 56;
    poseButton.style.left = `${Math.round(triggerLeft)}px`;
    poseButton.style.width = `${Math.round(triggerWidth)}px`;
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
  }

  const POSE_NAMES = [
    "청진기 진찰", "의학책 공부", "현미경 관찰", "DNA 모형", "흰 가운 영웅", "심전도 하트", "구급상자 출동", "심장 모형", "시험지 깜짝", "의료 가방 별",
    "노트북 강의", "칠판 설명", "큰 연필", "책가방 등교", "종이비행기", "카메라 사진", "폴라로이드", "이어폰 나눔", "커피 건배", "간식 나눔", "우산 함께", "담요 함께", "소풍", "지도 찾기", "알람 깜짝",
    "트로피", "응원 깃발", "색종이 하이파이브", "생일 케이크", "꽃다발", "별 풍선", "금메달", "선물 상자", "야광봉", "작은 북",
    "벚꽃 사진", "선글라스 부채", "튜브 물놀이", "낙엽 던지기", "목도리", "눈사람 만세", "눈 하트", "크리스마스", "달빛 랜턴", "뒤집힌 우산",
    "점프 하이파이브", "영웅 착지", "어깨동무 춤", "회전 하트", "축하 폭발"
  ];

  function clearPoseProps() {
    while (poseProps.children.length) {
      const item = poseProps.children.pop();
      item.traverse?.((child) => {
        child.geometry?.dispose?.();
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

  function addBurst(color, count = 8, radius = 1.4) {
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2;
      const distance = radius * (0.65 + (i % 3) * 0.16);
      addBall(i % 2 ? color : 0xffffff, Math.cos(angle) * distance, 0.15 + Math.sin(angle) * distance, 0.07 + (i % 2) * 0.025);
    }
  }

  function buildPoseProps(index) {
    clearPoseProps();
    poseProps.position.x = meetCenter;
    const accent = new THREE.Color().setHSL((index * 0.087) % 1, 0.72, 0.56).getHex();
    const gold = 0xf3c64f;
    const white = 0xf5f7fb;
    const dark = 0x29364e;
    const red = 0xe85b62;
    const green = 0x4aa978;
    const brown = 0x9a633c;
    switch (index) {
      case 0: addRing(dark, 0, 0.25, 0.55, 0.055); addBall(dark, 0, -0.38, 0.12); break;
      case 1: addBox(0x376ca8, 0, 0.1, 0.85, 0.58, 0.08); addBox(white, 0, 0.12, 0.03, 0.52, 0.1); break;
      case 2: addBox(dark, 0, -0.25, 0.55, 0.12); addBox(dark, 0.05, 0.15, 0.1, 0.48, 0.1, -0.45); addRing(0x8cc7df, 0.2, 0.58, 0.2, 0.05); break;
      case 3: for (let i=0;i<6;i++){const y=-0.65+i*0.25; addBall(i%2?red:0x6eb9e2, Math.sin(i*1.7)*0.28, y, 0.09);} break;
      case 4: addBox(white, -0.6, 0.15, 0.28, 0.82, 0.08); addBox(white, 0.6, 0.15, 0.28, 0.82, 0.08); break;
      case 5: addRing(red, 0, 0.1, 0.48, 0.055); addBox(red, 0, 0.1, 0.7, 0.035, 0.05); break;
      case 6: addBox(red, 0, 0, 0.7, 0.48); addBox(white, 0, 0, 0.13, 0.35, 0.2); addBox(white, 0, 0, 0.42, 0.12, 0.2); break;
      case 7: addBall(red, -0.2, 0.15, 0.34); addBall(red, 0.2, 0.15, 0.34); addBox(red, 0, -0.15, 0.35, 0.45, 0.18, Math.PI/4); break;
      case 8: addBox(white, 0, 0.1, 0.75, 0.52, 0.04); for(let i=0;i<3;i++) addBox(dark, 0, 0.3-i*0.18, 0.45, 0.025, 0.06); break;
      case 9: addBox(0x426f96, 0, -0.05, 0.72, 0.55); addRing(gold, 0, 0.55, 0.25); addBurst(gold, 7, 1.05); break;
      case 10: addBox(dark, 0, 0.05, 0.82, 0.5, 0.08); addBox(0x7fb6d7, 0, 0.1, 0.65, 0.34, 0.04); break;
      case 11: addBox(0x315f47, 0, 0.15, 1.0, 0.68, 0.08); addBox(white, 0.15, 0.2, 0.4, 0.025, 0.1, 0.2); break;
      case 12: addBox(gold, 0, 0.05, 0.12, 1.05, 0.12, -0.5); addBall(0xf0a0a0, -0.48, 0.78, 0.15); break;
      case 13: addBox(accent, 0, -0.05, 0.68, 0.62); addRing(dark, 0, 0.52, 0.32); break;
      case 14: addBox(white, 0, 0.15, 0.9, 0.02, 0.42, 0.18); addBox(accent, -0.35, 0.12, 0.12, 0.5, 0.03, -0.5); break;
      case 15: addBox(dark, 0, 0, 0.72, 0.52); addRing(0x8cc7df, 0, 0.06, 0.24); break;
      case 16: addBox(white, 0, 0.05, 0.62, 0.68, 0.04); addBox(accent, 0, 0.28, 0.45, 0.18, 0.05); break;
      case 17: addRing(dark, -0.38, 0.25, 0.27, 0.06); addRing(dark, 0.38, 0.25, 0.27, 0.06); addBox(dark, 0, 0.25, 0.32, 0.035); break;
      case 18: addBox(0xf8f5ec, -0.35, 0.05, 0.3, 0.42); addBox(0xf8f5ec, 0.35, 0.05, 0.3, 0.42); addBall(brown, -0.35, 0.16, 0.18); addBall(brown, 0.35, 0.16, 0.18); break;
      case 19: addBox(accent, 0, 0, 0.7, 0.58); addBurst(gold, 6, 0.7); break;
      case 20: addRing(0x6b85a3, 0, 0.25, 0.72, 0.06); addBox(0x6b85a3, 0, -0.18, 0.06, 0.68); break;
      case 21: addBox(0x9cc5df, 0, 0.05, 1.0, 0.62, 0.06); break;
      case 22: addBox(0x78a85d, 0, -0.4, 1.0, 0.08); addBall(red, -0.35, 0, 0.18); addBall(gold, 0.35, 0.05, 0.18); break;
      case 23: addBox(0xe8d7a8, 0, 0.05, 1.05, 0.7, 0.04); addBox(red, -0.25, 0.05, 0.04, 0.55, 0.06); addBox(0x4f91c5, 0.25, 0.05, 0.04, 0.55, 0.06); break;
      case 24: addRing(red, 0, 0.08, 0.52, 0.1); addBox(dark, 0, 0.08, 0.04, 0.35); break;
      case 25: addBox(gold, 0, -0.2, 0.55, 0.14); addBox(gold, 0, 0.15, 0.35, 0.55); addRing(gold, -0.42, 0.25, 0.22); addRing(gold, 0.42, 0.25, 0.22); break;
      case 26: addBox(brown, 0, -0.15, 0.08, 1.0); addBox(accent, 0.42, 0.42, 0.72, 0.4, 0.04, -0.15); break;
      case 27: addBurst(accent, 12, 1.5); break;
      case 28: addBox(0xf4c58a, 0, -0.15, 0.72, 0.42); addBall(white, -0.3, 0.22, 0.16); addBall(white, 0, 0.28, 0.16); addBall(white, 0.3, 0.22, 0.16); break;
      case 29: for(let i=0;i<7;i++){addBall(i%2?red:gold,(i-3)*0.16,-0.05+Math.abs(i-3)*0.09,0.12);} break;
      case 30: addBall(gold, 0, 0.35, 0.45); addBox(gold, 0, -0.35, 0.035, 0.68); break;
      case 31: addRing(gold, 0, 0.25, 0.38, 0.13); addBox(0x386ab3, 0, -0.32, 0.28, 0.45); break;
      case 32: addBox(accent, 0, 0, 0.72, 0.62); addBox(gold, 0, 0, 0.08, 0.62); addBox(gold, 0, 0, 0.72, 0.08); break;
      case 33: addBox(red, -0.35, 0.05, 0.12, 0.75, 0.1, -0.35); addBox(0x60d0ff, 0.35, 0.05, 0.12, 0.75, 0.1, 0.35); break;
      case 34: addBox(brown, 0, -0.3, 0.62, 0.28); addRing(white, 0, 0.12, 0.42, 0.06); break;
      case 35: addBurst(0xf3a8bf, 12, 1.35); addBox(dark, 0, 0, 0.72, 0.5); break;
      case 36: addRing(dark, -0.32, 0.35, 0.28, 0.08); addRing(dark, 0.32, 0.35, 0.28, 0.08); addBox(gold, 0, -0.15, 0.48, 0.08, 0.05, 0.5); break;
      case 37: addRing(accent, 0, -0.05, 0.72, 0.2); addBall(white, 0, 0.2, 0.18); break;
      case 38: addBurst(0xd97736, 12, 1.35); break;
      case 39: addRing(red, 0, 0.1, 0.82, 0.12); break;
      case 40: addBall(white, 0, -0.3, 0.48); addBall(white, 0, 0.35, 0.34); addBall(dark, -0.11, 0.42, 0.045); addBall(dark, 0.11, 0.42, 0.045); break;
      case 41: addBall(white, -0.25, 0.1, 0.36); addBall(white, 0.25, 0.1, 0.36); addBox(white, 0, -0.18, 0.38, 0.45, 0.15, Math.PI/4); break;
      case 42: addBox(red, -0.55, 0.38, 0.38, 0.26); addBox(red, 0.55, 0.38, 0.38, 0.26); addBox(green, 0, -0.1, 0.72, 0.52); break;
      case 43: addBox(brown, -0.38, 0.05, 0.08, 0.72); addBox(brown, 0.38, 0.05, 0.08, 0.72); addBall(gold, -0.38, 0.55, 0.18); addBall(gold, 0.38, 0.55, 0.18); break;
      case 44: addRing(0x6b85a3, 0, 0.15, 0.75, 0.06); addBox(0x6b85a3, 0.2, -0.25, 0.06, 0.7, 0.06, -0.4); break;
      case 45: addBurst(gold, 8, 1.2); break;
      case 46: addBurst(0x88c7ff, 10, 1.45); break;
      case 47: addRing(accent, 0, 0.1, 0.72, 0.08); break;
      case 48: addBall(red, -0.22, 0.15, 0.3); addBall(red, 0.22, 0.15, 0.3); addBox(red, 0, -0.12, 0.32, 0.4, 0.15, Math.PI/4); break;
      case 49: addBurst(gold, 16, 1.6); addRing(red, 0, 0.08, 0.55, 0.07); break;
      default: addBall(accent, 0, 0, 0.4);
    }
  }

  function poseFrame(index, elapsed) {
    const progress = Math.min(1, elapsed / 0.28);
    const settle = ease(progress);
    const held = Math.min(1, elapsed / 2.5);
    const breathe = Math.sin(elapsed * 5) * 0.035;
    const jump = [27, 30, 45, 46, 49].includes(index) ? Math.abs(Math.sin(elapsed * 7)) * 0.44 : 0;
    const blueX = meetCenter - meet;
    const navyX = meetCenter + meet;
    resetPoseTransforms();
    walkers.blue.model.position.set(blueX, -2.53 + jump, 0.1);
    walkers.navy.model.position.set(navyX, -2.53 + jump, 0.15);
    walkers.blue.model.position.y += breathe;
    walkers.navy.model.position.y += breathe;
    stopLegs(walkers.blue);
    stopLegs(walkers.navy);
    poseProps.position.x = meetCenter;
    poseProps.position.y = Math.sin(elapsed * 4 + index) * 0.04;
    poseProps.rotation.z = Math.sin(elapsed * 3 + index) * 0.025;

    // 50개의 소품에 열 가지 큰 동작을 조합해 작은 헤더에서도 차이가 분명하게 보이게 합니다.
    switch (index % 10) {
      case 0: // 양팔을 높이 들어 소품을 보여주기
        poseHandAngles(2.08, -0.72);
        walkers.blue.parts.leftArm.rotation.z = -1.15;
        walkers.navy.parts.rightArm.rotation.z = 1.15;
        break;
      case 1: // 가운데 소품을 함께 받치기
        poseHandAngles(1.65, -0.15);
        walkers.blue.parts.leftArm.rotation.z = -0.55;
        walkers.navy.parts.rightArm.rotation.z = 0.55;
        break;
      case 2: // 옆으로 마주 보고 살펴보기
        walkers.blue.model.rotation.y = 0.52;
        walkers.navy.model.rotation.y = -0.52;
        poseHandAngles(1.42, -0.05);
        break;
      case 3: // 정면에서 좌우로 흔들기
        poseHandAngles(1.92 + Math.sin(elapsed * 6) * 0.2, -0.52 - Math.sin(elapsed * 6) * 0.2);
        walkers.blue.model.rotation.z = Math.sin(elapsed * 5) * 0.07;
        walkers.navy.model.rotation.z = -Math.sin(elapsed * 5) * 0.07;
        break;
      case 4: // 한쪽이 소개하고 다른 쪽이 환영하기
        poseHandAngles(1.35, -0.72);
        walkers.navy.parts.rightArm.rotation.z = 1.18;
        break;
      case 5: // 점프하며 만세
        poseHandAngles(2.15, -0.82);
        walkers.blue.parts.leftArm.rotation.z = -1.28;
        walkers.navy.parts.rightArm.rotation.z = 1.28;
        break;
      case 6: // 등을 살짝 맞댄 영웅 포즈
        walkers.blue.model.rotation.y = -0.28;
        walkers.navy.model.rotation.y = 0.28;
        poseHandAngles(2.0, -0.65);
        walkers.blue.model.rotation.z = -0.055;
        walkers.navy.model.rotation.z = 0.055;
        break;
      case 7: // 하이파이브와 입자 효과
        walkers.blue.model.rotation.y = 0.42;
        walkers.navy.model.rotation.y = -0.42;
        poseHandAngles(2.05, -0.58);
        break;
      case 8: // 앞발을 가운데 모으기
        poseHandAngles(1.76, -0.28);
        walkers.blue.parts.leftArm.rotation.z = -0.72;
        walkers.navy.parts.rightArm.rotation.z = 0.72;
        break;
      case 9: // 크게 축하하며 좌우로 점프
        poseHandAngles(2.18, -0.82);
        walkers.blue.model.position.x -= Math.sin(elapsed * 5) * 0.12;
        walkers.navy.model.position.x += Math.sin(elapsed * 5) * 0.12;
        break;
    }
    if (settle < 1 || held < 1) {
      walkers.blue.model.rotation.z *= settle;
      walkers.navy.model.rotation.z *= settle;
    }
  }

  function beginRandomPose() {
    if (interaction) return;
    const now = performance.now() / 1000;
    let nextPose = Math.floor(Math.random() * POSE_NAMES.length);
    if (nextPose === lastPoseIndex) nextPose = (nextPose + 1 + Math.floor(Math.random() * 7)) % POSE_NAMES.length;
    lastPoseIndex = nextPose;
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
    blue.position.set(mix(interaction.blue.position.x, meetCenter - meet, progress), mix(interaction.blue.position.y, -2.53, progress), mix(interaction.blue.position.z, 0.1, progress));
    navy.position.set(mix(interaction.navy.position.x, meetCenter + meet, progress), mix(interaction.navy.position.y, -2.53, progress), mix(interaction.navy.position.z, 0.15, progress));
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

  function restartFromEdges() {
    const now = performance.now() / 1000;
    chooseHands(now);
    cycleStarted = now - approachDuration * 0.28;
    interaction = null;
    clearPoseProps();
    poseButton.disabled = false;
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
      } else {
        poseFrame(interaction.index, interactionElapsed);
        if (interactionElapsed >= 2.5) {
          interaction = null;
          clearPoseProps();
          poseButton.setAttribute("aria-label", "단웅이와 단비의 랜덤 포즈 보기");
          poseButton.disabled = false;
          cycleStarted = now - approachDuration - highFiveDuration;
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
  poseButton.addEventListener("click", beginRandomPose);
  resize();
  restartFromEdges();
  requestAnimationFrame(frame);
}
