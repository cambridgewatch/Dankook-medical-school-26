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
  const searchParams = new URLSearchParams(location.search);
  const testPattern = searchParams.get("danwoongTest");
  const poseTest = Number.parseInt(searchParams.get("mascotPose") || "", 10);

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
    "안경 쓰고 등장", "단웅이가 커져서 단비 놀라기", "단비 물구나무", "단웅이 앞구르기", "차례대로 점프",
    "생일 모자", "배너 폭죽", "위·아래 하이파이브", "단웅이가 단비 뛰어넘기", "단비 작아지기",
    "양팔 들고 좌우 흔들기", "양팔을 옆에서 위로", "자동차 타고 등장", "손잡고 안쪽 포즈", "점프해 사라졌다 양쪽 등장",
    "가위바위보 세 번", "DKU 글자", "누워서 자기", "토라져 헤어지기", "사이의 하트"
  ];
  const POSE_DURATIONS = [
    3.6,4.4,4.2,4.2,4.4,3.8,4.8,4.8,4.5,4.2,
    4.8,4.2,5.0,4.2,4.8,6.4,4.2,5.2,4.6,4.2
  ];

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

  function addText(text, color = "#ffffff", x = 0, y = 0, width = 1.2, fontSize = 74) {
    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 512;
    labelCanvas.height = 256;
    const context = labelCanvas.getContext("2d");
    context.clearRect(0, 0, 512, 256);
    context.font = `900 ${fontSize}px Pretendard, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 14;
    context.strokeStyle = "rgba(0,32,91,.72)";
    context.strokeText(text, 256, 128);
    context.fillStyle = color;
    context.fillText(text, 256, 128);
    const texture = new THREE.CanvasTexture(labelCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.position.set(x, y, 2);
    sprite.scale.set(width, width * .5, 1);
    poseProps.add(sprite);
    return sprite;
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
      case 0:
        [-1.32, 1.32].forEach((baseX) => { addRing(dark, baseX-.16,.6,.18,.045); addRing(dark,baseX+.16,.6,.18,.045); addBox(dark,baseX,.6,.12,.025,.04); });
        break;
      case 1: addText("!", "#ffd34e", .95, .85, .65, 118); addBurst(gold,6,.8); break;
      case 2: addBurst(0x8cc7df,7,1.0); break;
      case 3: for(let i=0;i<8;i++) addRing(i%2?accent:gold,0,0,.35+i*.11,.025); break;
      case 4: addBurst(gold,8,1.1); break;
      case 5:
        propMesh(new THREE.ConeGeometry(.3,.62,20),red,[-1.25,.88,1.25]); propMesh(new THREE.ConeGeometry(.3,.62,20),0x4c8fe2,[1.25,.88,1.25]);
        addBall(gold,-1.25,1.22,.09); addBall(gold,1.25,1.22,.09); addBurst(0xff7eb6,8,1.25); break;
      case 6: {
        const spread = Math.min(halfWidth * .62, 6.4);
        addBurst(0xff6b8a,14,1.25,-spread,.35);
        addBurst(gold,16,1.5,0,.15);
        addBurst(0x6ec8ff,14,1.25,spread,.35);
        addBurst(0xb69cff,10,.9,-spread*.5,-.05);
        addBurst(0x75e6b0,10,.9,spread*.5,-.05);
        break;
      }
      case 7: addText("↑  HIGH  ↓  LOW", "#ffffff",0,.9,2.4,62); addBurst(gold,8,1.15); break;
      case 8: for(let i=0;i<9;i++) addBall(i%2?gold:0x8cc7df,-1.4+i*.35,.55+Math.sin(i/8*Math.PI)*.7,.075); break;
      case 9: addText("!?", "#ffd34e",-.9,.8,.75,108); break;
      case 10: addText("♪", "#8fd1ff",0,.85,.7,110); addBurst(0x8cc7df,8,1.0); break;
      case 11: addText("↑", "#ffffff",0,.9,.65,120); break;
      case 12:
        addBox(red,0,-.55,1.5,.4); addBox(0x9ed7f2,0,-.14,.75,.3); addBox(white,0,-.55,.18,.1,.22); addRing(dark,-.92,-.84,.25,.08); addRing(dark,.92,-.84,.25,.08); addBall(gold,-1.28,-.48,.11); addBall(gold,1.28,-.48,.11); break;
      case 13: addBall(red,-.16,.52,.22); addBall(red,.16,.52,.22); addBox(red,0,.3,.22,.3,.12,Math.PI/4); break;
      case 14: addBurst(white,12,1.35); addBurst(0x8cc7df,8,.85); break;
      case 15: {
        const markRound = (item, round) => { item.userData.rpsRound = round; return item; };
        const addRock = (x, round) => {
          markRound(addBall(0x8590a0,x,.58,.23),round);
          markRound(addText("바위","#f5f7fb",x,1.0,.72,68),round);
        };
        const addPaper = (x, round) => {
          markRound(addBox(white,x,.58,.27,.34,.05),round);
          markRound(addText("보","#f5f7fb",x,1.0,.62,74),round);
        };
        const addScissors = (x, round) => {
          markRound(addBox(0x9ed7f2,x-.07,.58,.045,.31,.06,Math.PI/4),round);
          markRound(addBox(0x9ed7f2,x+.07,.58,.045,.31,.06,-Math.PI/4),round);
          markRound(addText("가위","#f5f7fb",x,1.0,.72,68),round);
        };
        addRock(-.72,0); addScissors(.72,0);
        addPaper(-.72,1); addRock(.72,1);
        addScissors(-.72,2); addPaper(.72,2);
        addText("가위 · 바위 · 보!", "#ffd34e",0,1.42,2.15,58);
        break;
      }
      case 16: addText("DKU", "#79bfff",0,.35,2.4,112); addBurst(gold,10,1.5); break;
      case 17: addText("Z Z Z", "#9ed7f2",.25,1.0,1.5,82); addBall(white,-.25,-.48,.1); addBall(white,.15,-.38,.14); addBall(white,.55,-.25,.18); break;
      case 18: addText("흥!", "#ff9aa7",0,.9,1.0,94); addBurst(0xaab3c2,6,.9); break;
      case 19: addBall(red,-.22,.38,.34); addBall(red,.22,.38,.34); addBox(red,0,.08,.34,.45,.14,Math.PI/4); addBurst(0xff9fbc,10,1.35); break;
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
    const duration = POSE_DURATIONS[index] || 4;
    const t = Math.min(1, elapsed / duration);
    switch (index) {
      case 0: scenePlace(1.32,-2.48); poseHandAngles(1.8+wave*.18,-.45-wave*.18); break;
      case 1: {
        const grow=ease(Math.min(1,t*1.3)); blue.scale.setScalar(modelScale*(.78+grow*.62)); navy.scale.setScalar(modelScale*.82);
        scenePlace(1.12,-2.48); navy.position.x+=grow*.45; navy.rotation.z=grow*.13; poseHandAngles(2.05,-.75); poseProps.scale.setScalar(.75+grow*.35); break;
      }
      case 2: sceneScale(.72); scenePlace(1.0,-2.25,0,1.05); navy.rotation.z=Math.PI; poseHandAngles(1.5,-.1); walkers.navy.parts.leftLeg.rotation.z=wave*.35; walkers.navy.parts.rightLeg.rotation.z=-wave*.35; break;
      case 3: {
        sceneScale(.72); const roll=Math.min(1,t*1.25); scenePlace(1.2,-2.25); blue.position.x=meetCenter-1.4+roll*2.2; blue.position.y+=Math.sin(roll*Math.PI)*.55; blue.rotation.z=-roll*Math.PI*2; navy.rotation.z=-.05; break;
      }
      case 4: {
        sceneScale(.82); const blueJump=Math.max(0,Math.sin(Math.min(1,t*2)*Math.PI)); const navyJump=t<.42?0:Math.max(0,Math.sin(Math.min(1,(t-.42)*1.72)*Math.PI));
        scenePlace(.92,-2.48,blueJump*.62,navyJump*.62); poseHandAngles(2.05,-.72); break;
      }
      case 5: sceneScale(.84); scenePlace(1.25,-2.48,hop*.12,hop*.12); poseHandAngles(1.9+wave*.2,-.55-wave*.2); poseProps.rotation.y=slow*.1; break;
      case 6: sceneScale(.76); scenePlace(.8,-2.42); poseHandAngles(2.18,-.82); walkers.blue.parts.leftArm.rotation.z=-1.28; walkers.navy.parts.rightArm.rotation.z=1.28; poseProps.rotation.y=elapsed*.55; poseProps.scale.setScalar(.85+hop*.18); break;
      case 7: {
        sceneScale(.8); scenePlace(.78,-2.4); blue.rotation.y=.38; navy.rotation.y=-.38; const high=t<.52;
        poseHandAngles(high?2.12:1.15,high?-.72:.42); blue.position.y+=(high?hop*.28:0); navy.position.y+=(high?hop*.28:0); break;
      }
      case 8: {
        sceneScale(.72); const leap=ease(Math.min(1,t*1.2)); scenePlace(.55,-2.42); blue.position.x=meetCenter-1.45+leap*2.9; blue.position.y+=Math.sin(leap*Math.PI)*1.18; blue.rotation.z=-Math.sin(leap*Math.PI)*.18; navy.scale.set(modelScale*.72,modelScale*.58,modelScale*.72); poseHandAngles(1.8,-.35); break;
      }
      case 9: {
        const shrink=1-ease(Math.min(1,t*1.35))*.62; blue.scale.setScalar(modelScale*.85); navy.scale.setScalar(modelScale*shrink); scenePlace(1.0,-2.48); blue.rotation.z=-.09; poseHandAngles(2.12,-.15); poseProps.scale.setScalar(.8+hop*.15); break;
      }
      case 10: sceneScale(.8); scenePlace(.82,-2.42); poseHandAngles(2.15+slow*.2,-.82-slow*.2); walkers.blue.parts.leftArm.rotation.z=-1.32+slow*.25; walkers.navy.parts.rightArm.rotation.z=1.32-slow*.25; blue.rotation.z=slow*.1; navy.rotation.z=slow*.1; break;
      case 11: {
        sceneScale(.82); scenePlace(.82,-2.44); const lift=ease(Math.min(1,t*1.6)); walkers.blue.parts.leftArm.rotation.z=mix(-1.42,-2.05,lift); walkers.blue.parts.rightArm.rotation.z=mix(1.42,2.12,lift); walkers.navy.parts.leftArm.rotation.z=mix(-1.42,-2.12,lift); walkers.navy.parts.rightArm.rotation.z=mix(1.42,2.05,lift); break;
      }
      case 12: {
        const travel = ease(t);
        const driveRange = Math.min(halfWidth * .55, 5.2);
        const carX = mix(meetCenter-driveRange,meetCenter+driveRange,travel);
        sceneScale(.46);
        blue.position.set(carX-.42,-1.95+Math.abs(wave)*.04,.1);
        navy.position.set(carX+.42,-1.95+Math.abs(wave)*.04,.15);
        poseHandAngles(1.2,.08);
        poseProps.position.x=carX;
        poseProps.rotation.z=slow*.025;
        break;
      }
      case 13: sceneScale(.82); scenePlace(.72,-2.45); walkers.blue.parts.rightArm.rotation.z=1.62; walkers.navy.parts.leftArm.rotation.z=-.18; walkers.blue.parts.leftArm.rotation.z=-1.68; walkers.navy.parts.rightArm.rotation.z=1.68; blue.rotation.z=.035; navy.rotation.z=-.035; poseProps.scale.setScalar(.9+hop*.12); break;
      case 14: {
        const vanish=t<.48?1-ease(t/.48):ease((t-.48)/.52); const jumpArc=t<.48?Math.sin(t/.48*Math.PI):0; sceneScale(.72*Math.max(.05,vanish));
        if(t<.48){scenePlace(.7,-2.35,jumpArc*1.25,jumpArc*1.25);}else{const enter=ease((t-.48)/.52); blue.position.set(mix(-edge,meetCenter-.8,enter),-2.35,0.1); navy.position.set(mix(edge,meetCenter+.8,enter),-2.35,.15);} poseHandAngles(2.15,-.8); poseProps.scale.setScalar(.7+hop*.4); break;
      }
      case 15: {
        sceneScale(.78);
        scenePlace(.78,-2.42);
        const round=Math.min(2,Math.floor(elapsed/2.05));
        const roundTime=elapsed%2.05;
        const shake=roundTime<.82?Math.sin(roundTime*17)*.34:0;
        poseHandAngles(1.55+shake,-.1-shake);
        poseProps.children.forEach(item=>{
          if(item.userData.rpsRound!==undefined)item.visible=item.userData.rpsRound===round&&roundTime>=.82;
        });
        if(roundTime>=.82){blue.position.y+=.08;navy.position.y+=.08;}
        break;
      }
      case 16: sceneScale(.7); scenePlace(1.15,-2.42); poseHandAngles(1.55,-.08); walkers.blue.parts.leftArm.rotation.z=-1.0; walkers.navy.parts.rightArm.rotation.z=1.0; poseProps.scale.setScalar(.82+hop*.18); break;
      case 17: sceneScale(.62); scenePlace(.7,-1.68); blue.rotation.z=-Math.PI/2; navy.rotation.z=Math.PI/2; poseHandAngles(1.0,.45); poseProps.position.y=.05+slow*.08; break;
      case 18: sceneScale(.76); scenePlace(1.0+ease(t)*.65,-2.45); blue.rotation.y=-.65; navy.rotation.y=.65; walkers.blue.parts.leftArm.rotation.z=-.7; walkers.blue.parts.rightArm.rotation.z=.7; walkers.navy.parts.leftArm.rotation.z=-.7; walkers.navy.parts.rightArm.rotation.z=.7; blue.rotation.z=-.06; navy.rotation.z=.06; break;
      case 19: sceneScale(.78); scenePlace(.72,-2.44); poseHandAngles(1.82,-.3); walkers.blue.parts.leftArm.rotation.z=-.72; walkers.navy.parts.rightArm.rotation.z=.72; poseProps.scale.setScalar(.82+hop*.22); poseProps.rotation.y=slow*.08; break;
    }
  }

  function poseFrame(index, elapsed) {
    const progress = Math.min(1, elapsed / 0.28);
    const settle = ease(progress);
    const held = Math.min(1, elapsed / (POSE_DURATIONS[index] || 3.8));
    const breathe = Math.sin(elapsed * 5) * 0.035;
    const blueX = meetCenter - meet;
    const navyX = meetCenter + meet;
    resetPoseTransforms();
    walkers.blue.model.position.set(blueX, -2.53 + breathe, 0.1);
    walkers.navy.model.position.set(navyX, -2.53 + breathe, 0.15);
    stopLegs(walkers.blue);
    stopLegs(walkers.navy);
    poseProps.position.x = meetCenter;
    poseProps.position.y = Math.sin(elapsed * 4 + index) * 0.04;
    poseProps.rotation.z = Math.sin(elapsed * 3 + index) * 0.025;

    applySceneLayout(index, elapsed);
    if (settle < 1 || held < 1) {
      walkers.blue.model.rotation.z *= settle;
      walkers.navy.model.rotation.z *= settle;
    }
  }

  function beginRandomPose() {
    if (interaction) return;
    const now = performance.now() / 1000;
    let nextPose = Number.isInteger(poseTest) && poseTest >= 1 && poseTest <= POSE_NAMES.length
      ? poseTest - 1
      : Math.floor(Math.random() * POSE_NAMES.length);
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
  if (Number.isInteger(poseTest) && poseTest >= 1 && poseTest <= POSE_NAMES.length) {
    window.setTimeout(beginRandomPose, 250);
  }
  requestAnimationFrame(frame);
}
