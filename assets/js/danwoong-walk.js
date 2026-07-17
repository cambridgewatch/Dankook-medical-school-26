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
    "자동차 드라이브", "버스 여행", "자전거 타기", "비행기 비행", "배 타기", "로켓 발사", "기차 여행", "스케이트보드", "킥보드", "열기구",
    "축구", "농구", "야구", "볼링", "줄넘기", "스키", "스케이트", "서핑", "배드민턴", "탁구",
    "기타 연주", "드럼 연주", "피아노 연주", "마이크 듀엣", "무대 춤", "캠핑", "낚시", "요리", "소풍", "기념사진",
    "빗속 우산", "눈사람", "썰매", "바다 튜브", "벚꽃놀이", "트로피", "생일 파티", "선물 상자", "영웅 등장", "폭죽 하이파이브"
  ];
  const POSE_DURATIONS = [
    3.6,3.8,4.0,4.0,3.5,3.8,3.5,3.7,3.4,4.0,
    4.2,4.5,4.3,4.2,4.0,4.5,4.5,3.8,4.0,4.5,
    3.8,3.8,4.0,3.6,3.8,4.2,4.0,4.2,4.0,3.8,
    4.0,3.8,4.2,4.0,4.3,
    4.5,4.3,4.0,4.2,4.0,4.3,4.5,4.0,4.2,4.3,
    3.8,4.2,4.0,3.8,4.5
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
    poseProps.position.set(meetCenter, 0, 0);
    poseProps.rotation.set(0, 0, 0);
    poseProps.scale.setScalar(1);
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
      case 10: addBox(red, 0, -0.55, 1.45, 0.38); addBox(0x9ed7f2, 0, -0.15, 0.72, 0.3); addRing(dark,-0.85,-0.82,0.24); addRing(dark,0.85,-0.82,0.24); break;
      case 11: addBox(gold, 0, -0.25, 1.55, 0.72); for(let i=-2;i<=2;i++) addBox(0x9ed7f2,i*0.48,-0.08,0.18,0.22); addRing(dark,-1,-0.75,0.2); addRing(dark,1,-0.75,0.2); break;
      case 12: addRing(dark,-0.62,-0.45,0.38); addRing(dark,0.62,-0.45,0.38); addBox(accent,0,-0.18,0.75,0.05,0.08,-0.12); addBox(dark,0.05,0.18,0.05,0.5); break;
      case 13: addBox(white,0,-0.05,1.5,0.12); addBox(0x74a9d8,0,-0.05,0.18,0.85); addBox(red,0.85,-0.05,0.35,0.05,0.06,0.45); break;
      case 14: addBox(0x6da8cf,0,-0.55,1.35,0.3,0.2,0.08); addBox(white,0,-0.25,0.75,0.3); addBox(brown,0,0.1,0.04,0.65); break;
      case 15: propMesh(new THREE.CylinderGeometry(.38,.55,1.6,18),white,[0,-0.05,1.25],[1,1,1],[0,0,0]); propMesh(new THREE.ConeGeometry(.5,.65,18),red,[0,1.05,1.25]); addBurst(gold,8,.85); break;
      case 16: addBox(0x3f78b5,0,-0.35,1.45,0.5); addBox(dark,-0.95,0.05,0.42,0.62); addRing(dark,-.75,-.75,.22); addRing(dark,.75,-.75,.22); break;
      case 17: addBox(accent,0,-0.6,1.0,0.08,0.18,0.04); for(let i=-1;i<=1;i+=2){addRing(dark,i*.65,-.78,.12);} break;
      case 18: addRing(dark,-.45,-.5,.28); addBox(accent,.15,-.35,.65,.05); addBox(dark,.48,.15,.04,.65); addBox(dark,.25,.48,.28,.04); break;
      case 19: addBall(accent,0,.85,.72); addBox(brown,0,-.28,.35,.26); for(let i=-2;i<=2;i++) addBox(gold,i*.12,.22,.025,.55,.03,i*.04); break;
      case 20: addBall(white,.3,-.25,.32); addBox(green,-.4,-.6,.05,.7,.05,-.45); break;
      case 21: addRing(red,0,-.05,.52,.07); addBall(gold,-.55,-.35,.28); break;
      case 22: addBox(brown,0,-.05,.06,.95,.08,-.2); addBall(white,.55,.25,.22); break;
      case 23: addBall(accent,.55,-.5,.28); for(let i=-2;i<=2;i++) addBox(white,-.45+i*.18,-.58,.08,.26,.08); break;
      case 24: addRing(red,0,0,.72,.055); addBox(red,0,-.62,.7,.035); break;
      case 25: addBox(0x7fb6d7,-.45,-.5,.08,.75,.08,-.28); addBox(0x7fb6d7,.45,-.5,.08,.75,.08,.28); addBurst(white,7,.8); break;
      case 26: addRing(0x9ed7f2,-.48,-.48,.3,.06); addRing(0x9ed7f2,.48,-.48,.3,.06); addBox(dark,0,-.5,.85,.045); break;
      case 27: addBox(0x5fa8d3,0,-.48,1.25,.08,.2,.04); addRing(white,0,.25,.48,.08); break;
      case 28: addBox(dark,0,.2,.04,1.15); addBox(dark,0,.72,.9,.035); addBall(white,-.45,.55,.12); addBall(white,.45,.3,.12); break;
      case 29: addBox(0x3a78a8,0,-.25,1.0,.42); addBox(white,0,-.25,.02,.42,.05); addBall(white,-.38,-.05,.11); addBall(white,.38,-.45,.11); break;
      case 30: addBox(brown,-.25,-.05,.28,.85,.12,-.28); addRing(gold,-.25,.28,.28,.05); break;
      case 31: addBox(brown,0,-.3,.65,.38); addRing(white,0,.12,.38,.05); addBox(white,0,.1,.55,.04); break;
      case 32: addBox(dark,0,-.25,1.15,.45); for(let i=-3;i<=3;i++) addBox(i%2?dark:white,i*.14,-.05,.06,.25,.03); break;
      case 33: addBall(0x444444,0,.1,.24); addBox(dark,0,-.45,.05,.65); addBurst(accent,6,.75); break;
      case 34: addBurst(accent,12,1.35); addRing(gold,0,.05,.55,.07); break;
      case 35: addBox(0x486b42,0,-.25,1.0,.72,.06); addBox(brown,0,-.6,.9,.05); addBall(gold,0,-.15,.18); break;
      case 36: addBox(brown,.15,-.1,.04,1.0,.04,-.45); addBox(0x8fcbe6,.65,-.58,.75,.04); addBall(white,.8,-.45,.09); break;
      case 37: addBox(0x888888,0,-.45,.72,.18); addBox(brown,-.5,.05,.08,.8); addBox(brown,.5,.05,.08,.8); addBurst(0xff9f43,6,.55); break;
      case 38: addBox(0x76a65e,0,-.58,1.2,.08); addBall(red,-.4,-.2,.16); addBall(gold,.4,-.15,.16); break;
      case 39: addBox(dark,0,-.05,.72,.5); addRing(0x9ed7f2,0,-.02,.22,.05); addBurst(white,6,.85); break;
      case 40: addRing(0x6b85a3,0,.18,.78,.06); addBox(0x6b85a3,0,-.28,.05,.72); addBurst(0x73b9e6,10,1.25); break;
      case 41: addBall(white,0,-.38,.5); addBall(white,0,.28,.34); addBall(dark,-.11,.36,.045); addBall(dark,.11,.36,.045); break;
      case 42: addBox(red,0,-.5,1.15,.12,.2,.08); addBox(brown,0,-.72,.75,.05); addBurst(white,8,1.05); break;
      case 43: addRing(accent,0,-.3,.78,.22); addBall(white,0,.12,.16); addBurst(0x80d7f2,8,1.1); break;
      case 44: addBurst(0xf3a8bf,14,1.35); addBox(dark,0,-.1,.72,.48); break;
      case 45: addBox(gold,0,-.28,.55,.14); addBox(gold,0,.1,.35,.55); addRing(gold,-.42,.2,.22); addRing(gold,.42,.2,.22); break;
      case 46: addBox(0xf4c58a,0,-.2,.72,.42); for(let i=-1;i<=1;i++) addBall(white,i*.3,.22,.16); addBurst(gold,8,1.05); break;
      case 47: addBox(accent,0,-.08,.75,.65); addBox(gold,0,-.08,.08,.65); addBox(gold,0,-.08,.75,.08); break;
      case 48: addBurst(0x88c7ff,12,1.45); addBox(gold,0,.05,.85,.08,0.05); break;
      case 49: addBurst(gold,18,1.65); addRing(red,0,.08,.55,.07); break;
      default: addBall(accent, 0, 0, 0.4);
    }
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

  function applySceneLayout(index, elapsed) {
    const wave = Math.sin(elapsed * 5);
    const slow = Math.sin(elapsed * 2.4);
    const hop = Math.abs(Math.sin(elapsed * 4.5));
    switch (index) {
      case 0: scenePlace(1.25,-2.48); blue.rotation.y=.55; navy.rotation.y=-.25; poseHandAngles(1.55,-.1); break;
      case 1: scenePlace(1.2,-2.48); sceneScale(.86); poseHandAngles(1.58,-.1); blue.rotation.z=-.05; navy.rotation.z=.05; break;
      case 2: scenePlace(1.25,-2.48); sceneScale(.82); navy.rotation.y=.55; blue.rotation.z=-.08; poseHandAngles(1.3,-.05); break;
      case 3: scenePlace(1.3,-2.48); sceneScale(.82); blue.rotation.y=.45; navy.rotation.y=-.45; blue.rotation.z=wave*.05; navy.rotation.z=-wave*.05; break;
      case 4: scenePlace(.85,-2.48,hop*.14,hop*.14); sceneScale(.88); poseHandAngles(2.15,-.78); walkers.blue.parts.leftArm.rotation.z=-1.25; walkers.navy.parts.rightArm.rotation.z=1.25; break;
      case 5: scenePlace(1.3,-2.48); sceneScale(.82); poseHandAngles(1.72,-.25); poseProps.scale.setScalar(1+slow*.08); break;
      case 6: scenePlace(1.05,-2.48); sceneScale(.8); poseHandAngles(1.6,-.1); blue.rotation.z=-.04; navy.rotation.z=.04; break;
      case 7: scenePlace(1.3,-2.48); sceneScale(.82); poseHandAngles(1.65,-.2); poseProps.scale.setScalar(1+Math.abs(slow)*.12); break;
      case 8: scenePlace(1.15,-2.48); blue.position.x-=.25*hop; navy.position.x+=.25*hop; blue.rotation.z=-hop*.12; navy.rotation.z=hop*.12; poseHandAngles(2.05,-.7); break;
      case 9: scenePlace(1.25,-2.48,hop*.18,hop*.18); sceneScale(.82); poseHandAngles(2.05,-.7); poseProps.rotation.y=elapsed*1.2; break;

      case 10: sceneScale(.48); scenePlace(.45,-1.98,Math.abs(wave)*.04,Math.abs(wave)*.04); poseHandAngles(1.25,.05); poseProps.position.x=meetCenter+slow*.45; break;
      case 11: sceneScale(.4); scenePlace(.5,-1.72); poseHandAngles(1.8,-.45); poseProps.position.x=meetCenter+slow*.25; break;
      case 12: sceneScale(.48); scenePlace(.42,-1.72,Math.abs(wave)*.08,Math.abs(wave)*.08); blue.rotation.z=-.08; navy.rotation.z=-.08; poseProps.rotation.z=slow*.04; break;
      case 13: sceneScale(.42); scenePlace(.38,-1.55); poseHandAngles(2.05,-.68); blue.rotation.z=.04; navy.rotation.z=-.04; poseProps.position.y=.2+slow*.42; break;
      case 14: sceneScale(.48); scenePlace(.48,-1.78); blue.rotation.z=slow*.04; navy.rotation.z=-slow*.04; poseProps.position.y=slow*.12; poseProps.rotation.z=slow*.05; break;
      case 15: sceneScale(.38); scenePlace(.34,-1.25); poseHandAngles(2.12,-.78); poseProps.position.y=Math.min(1.1,elapsed*.35)-.4; blue.position.y+=poseProps.position.y; navy.position.y+=poseProps.position.y; break;
      case 16: sceneScale(.4); scenePlace(.55,-1.72); poseHandAngles(1.9+wave*.2,-.55-wave*.2); poseProps.position.x=meetCenter+slow*.35; break;
      case 17: sceneScale(.58); scenePlace(.52,-1.88,hop*.18,hop*.18); blue.rotation.z=-.12; navy.rotation.z=.12; poseProps.rotation.z=wave*.05; break;
      case 18: sceneScale(.62); scenePlace(.6,-1.92,Math.abs(wave)*.08,Math.abs(wave)*.08); poseHandAngles(1.3,-.05); poseProps.rotation.z=slow*.08; break;
      case 19: sceneScale(.42); scenePlace(.35,-1.45); poseHandAngles(1.9,-.55); poseProps.position.y=.35+slow*.35; blue.position.y+=slow*.35; navy.position.y+=slow*.35; break;

      case 20: sceneScale(.72); scenePlace(1.05,-2.35); walkers.blue.parts.rightLeg.rotation.z=-.75*hop; walkers.navy.parts.leftArm.rotation.z=-1.35; walkers.navy.parts.rightArm.rotation.z=1.35; poseProps.position.x=meetCenter+slow*.65; break;
      case 21: sceneScale(.7); scenePlace(1.05,-2.35); navy.position.y+=hop*.45; walkers.navy.parts.leftArm.rotation.z=-1.5; walkers.navy.parts.rightArm.rotation.z=1.5; poseProps.position.y=.2+hop*.5; break;
      case 22: sceneScale(.68); scenePlace(1.1,-2.35); walkers.blue.parts.rightArm.rotation.z=1.2-wave*.35; navy.rotation.z=-.16*hop; poseProps.rotation.z=-elapsed*2; break;
      case 23: sceneScale(.72); scenePlace(1.1,-2.35); blue.rotation.z=.18; walkers.blue.parts.rightArm.rotation.z=1.55; poseProps.position.x=meetCenter+Math.min(.7,elapsed*.3); break;
      case 24: sceneScale(.68); scenePlace(.8,-2.28,hop*.42,hop*.42); poseHandAngles(1.9,-.55); poseProps.rotation.z=elapsed*3; break;
      case 25: sceneScale(.62); scenePlace(.75,-2.15); blue.rotation.z=-.18+wave*.08; navy.rotation.z=.18-wave*.08; poseProps.position.x=meetCenter+slow*.45; break;
      case 26: sceneScale(.62); scenePlace(.65,-2.16); blue.rotation.y=elapsed*1.8; navy.rotation.y=-elapsed*1.8; poseHandAngles(1.85,-.5); break;
      case 27: sceneScale(.62); scenePlace(.62,-2.02); blue.rotation.z=-slow*.18; navy.rotation.z=-slow*.18; poseProps.rotation.z=-slow*.12; poseProps.position.y=hop*.12; break;
      case 28: sceneScale(.68); scenePlace(1.0,-2.35); walkers.blue.parts.rightArm.rotation.z=1.5+wave*.35; walkers.navy.parts.leftArm.rotation.z=-1.1-wave*.35; poseProps.rotation.z=wave*.12; break;
      case 29: sceneScale(.66); scenePlace(1.05,-2.35); walkers.blue.parts.rightArm.rotation.z=1.3+wave*.28; walkers.navy.parts.leftArm.rotation.z=-.7-wave*.28; poseProps.position.x=meetCenter+slow*.18; break;

      case 30: sceneScale(.72); scenePlace(.85,-2.35); blue.rotation.z=slow*.08; walkers.blue.parts.rightArm.rotation.z=1.2+wave*.25; navy.position.y+=hop*.15; break;
      case 31: sceneScale(.68); scenePlace(.9,-2.35); walkers.navy.parts.leftArm.rotation.z=-1.2+wave*.3; walkers.navy.parts.rightArm.rotation.z=1.2-wave*.3; blue.position.y+=hop*.25; break;
      case 32: sceneScale(.64); scenePlace(.72,-2.28); walkers.blue.parts.rightArm.rotation.z=1.4+wave*.18; walkers.navy.parts.leftArm.rotation.z=-.9-wave*.18; break;
      case 33: sceneScale(.7); scenePlace(.9,-2.35); poseHandAngles(1.65+wave*.18,-.2-wave*.18); poseProps.position.y=slow*.12; break;
      case 34: sceneScale(.68); scenePlace(.72,-2.22,hop*.25,Math.abs(Math.sin(elapsed*4.5+1))* .25); blue.rotation.z=wave*.1; navy.rotation.z=-wave*.1; poseHandAngles(2.0,-.68); break;

      case 35: sceneScale(.62); scenePlace(.9,-2.28); poseHandAngles(1.42,-.05); poseProps.children.forEach((item,i)=>{item.rotation.y=slow*(i%2?.15:-.15);}); break;
      case 36: sceneScale(.64); scenePlace(.9,-2.3); blue.rotation.z=-.1; navy.rotation.z=.1; poseHandAngles(1.25,-.05); poseProps.rotation.z=-.15+slow*.08; break;
      case 37: sceneScale(.64); scenePlace(.85,-2.3); walkers.blue.parts.rightArm.rotation.z=1.3+wave*.35; walkers.navy.parts.leftArm.rotation.z=-1.0-wave*.35; poseProps.position.y=hop*.18; break;
      case 38: sceneScale(.62); scenePlace(.9,-2.25); poseHandAngles(1.4,-.05); blue.rotation.z=-.04; navy.rotation.z=.04; break;
      case 39: sceneScale(.68); scenePlace(.82,-2.3); poseHandAngles(1.85+wave*.15,-.5-wave*.15); poseProps.rotation.y=slow*.12; break;
      case 40: sceneScale(.58); scenePlace(.5,-2.1); blue.rotation.z=slow*.05; navy.rotation.z=-slow*.05; poseProps.rotation.z=slow*.08; break;
      case 41: sceneScale(.58); scenePlace(.9,-2.28); poseHandAngles(2.12,-.78); poseProps.rotation.y=slow*.18; break;
      case 42: sceneScale(.5); scenePlace(.42,-1.86); poseHandAngles(2.0,-.65); poseProps.position.x=meetCenter+slow*.55; poseProps.rotation.z=slow*.06; break;
      case 43: sceneScale(.5); scenePlace(.38,-1.75); blue.rotation.z=slow*.1; navy.rotation.z=-slow*.1; poseProps.position.y=hop*.18; break;
      case 44: sceneScale(.66); scenePlace(.75,-2.3); poseHandAngles(1.8,-.4); poseProps.rotation.y=elapsed*.35; break;

      case 45: sceneScale(.65); scenePlace(.8,-2.25,hop*.18,hop*.18); poseHandAngles(2.12,-.78); poseProps.scale.setScalar(1+hop*.1); break;
      case 46: sceneScale(.62); scenePlace(.72,-2.25); blue.rotation.z=-.08; navy.rotation.z=.08; poseHandAngles(1.55,-.1); poseProps.rotation.y=elapsed*.55; break;
      case 47: sceneScale(.6); scenePlace(.65,-2.2); poseHandAngles(1.7,-.25); poseProps.scale.setScalar(1+hop*.18); poseProps.rotation.y=elapsed*.8; break;
      case 48: sceneScale(.7); scenePlace(.68,-2.1,hop*.45,hop*.45); blue.rotation.z=-.12; navy.rotation.z=.12; poseHandAngles(2.15,-.8); poseProps.rotation.z=slow*.12; break;
      case 49: sceneScale(.68); scenePlace(.72,-2.2,hop*.5,hop*.5); blue.rotation.y=.38; navy.rotation.y=-.38; poseHandAngles(2.1,-.62); poseProps.rotation.y=elapsed*.7; poseProps.scale.setScalar(1+hop*.22); break;
    }
  }

  function poseFrame(index, elapsed) {
    const progress = Math.min(1, elapsed / 0.28);
    const settle = ease(progress);
    const held = Math.min(1, elapsed / (POSE_DURATIONS[index] || 3.8));
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
    applySceneLayout(index, elapsed);
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
        if (interactionElapsed >= (POSE_DURATIONS[interaction.index] || 3.8)) {
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
