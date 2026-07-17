import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js";
import { createBlueDanwoong, createNavyDanwoong, getDanwoongParts } from "./danwoong-models.js?v=4";

const APPROACH_SECONDS = 6.6;
const HIGH_FIVE_SECONDS = 1.25;
const EXIT_SECONDS = 5.2;

function ease(value) { return value * value * (3 - 2 * value); }
function mix(from, to, amount) { return from + (to - from) * amount; }

export function mountDanwoongWalk() {
  const header = document.querySelector(".site-header");
  if (!header || header.querySelector(".danwoong-walk-canvas")) return;

  const canvas = document.createElement("canvas");
  canvas.className = "danwoong-walk-canvas";
  canvas.setAttribute("aria-hidden", "true");
  header.prepend(canvas);

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
  let running = !document.hidden;
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
    edge = halfWidth + 2.2;
    const brandRect = header.querySelector(".brand")?.getBoundingClientRect();
    const rightControl = width <= 820 ? header.querySelector(".nav-toggle") : header.querySelector(".nav-menu");
    const controlRect = rightControl?.getBoundingClientRect();
    const gapLeft = brandRect ? brandRect.right - rect.left : width * 0.3;
    const gapRight = controlRect && controlRect.width ? controlRect.left - rect.left : width * 0.7;
    const meetingPixel = gapRight - gapLeft >= 90 ? (gapLeft + gapRight) / 2 : width / 2;
    meetCenter = (meetingPixel / width * 2 - 1) * halfWidth;
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = 2.65;
    camera.bottom = -2.65;
    camera.updateProjectionMatrix();
    const modelScale = width <= 820 ? 0.86 : 0.94;
    blue.scale.setScalar(modelScale);
    navy.scale.setScalar(modelScale);
  }

  function poseHandAngles(blueAngle, navyAngle) {
    const blueParts = walkers.blue.parts;
    blueParts.leftArm.rotation.set(0, 0, -0.12);
    blueParts.rightArm.rotation.set(0, 0, blueAngle);
    const navyParts = walkers.navy.parts;
    navyParts.leftArm.rotation.set(0, 0, navyAngle);
    navyParts.rightArm.rotation.set(0, 0, -0.78);
  }

  function poseHands(blueUp = walkers.blue.handUp, navyUp = walkers.navy.handUp) {
    poseHandAngles(blueUp ? 2.15 : 1.15, navyUp ? -0.75 : 0.45);
  }

  function walkMotion(walker, elapsed, strength = 1) {
    const stride = Math.sin(elapsed * 9 + walker.phase) * strength;
    const bounce = Math.abs(Math.cos(elapsed * 9 + walker.phase)) * strength;
    walker.parts.leftLeg.rotation.z = stride * 0.28;
    walker.parts.rightLeg.rotation.z = -stride * 0.28;
    walker.model.position.y = -2.53 + bounce * 0.09;
    walker.model.rotation.z = stride * 0.025;
  }

  function stopLegs(walker) {
    walker.parts.leftLeg.rotation.z = 0;
    walker.parts.rightLeg.rotation.z = 0;
  }

  function approach(elapsed) {
    const progress = ease(Math.min(1, elapsed / APPROACH_SECONDS));
    walkers.blue.model.position.x = mix(-edge, meetCenter - meet, progress);
    walkers.navy.model.position.x = mix(edge, meetCenter + meet, progress);
    walkers.blue.model.position.z = 0;
    walkers.navy.model.position.z = 0.2;
    walkers.blue.model.rotation.y = 0.18;
    walkers.navy.model.rotation.y = -0.18;
    walkMotion(walkers.blue, elapsed);
    walkMotion(walkers.navy, elapsed);
  }

  function highFive(elapsed) {
    const progress = Math.min(1, elapsed / HIGH_FIVE_SECONDS);
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
    const progress = Math.min(1, elapsed / HIGH_FIVE_SECONDS);
    const blueFrom = walkers.blue.handUp ? 2.15 : 1.15;
    const blueTo = walkers.blue.handUp ? 1.15 : 2.15;
    const navyFrom = walkers.navy.handUp ? -0.75 : 0.45;
    const navyTo = walkers.navy.handUp ? 0.45 : -0.75;
    poseHandAngles(mix(blueFrom, blueTo, progress), mix(navyFrom, navyTo, progress));
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
    const progress = ease(Math.min(1, elapsed / EXIT_SECONDS));
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
    const progress = ease(Math.min(1, elapsed / EXIT_SECONDS));
    walkers.blue.model.position.x = mix(meetCenter - meet, edge, progress);
    walkers.navy.model.position.x = mix(meetCenter + meet, -edge, progress);
    walkers.blue.model.rotation.y = 0.18;
    walkers.navy.model.rotation.y = -0.18;
    walkers.blue.model.position.z = 0.25;
    walkers.navy.model.position.z = -0.3;
    poseHands(!walkers.blue.handUp, !walkers.navy.handUp);
    walkMotion(walkers.blue, elapsed);
    walkMotion(walkers.navy, elapsed);
  }

  function frame(time) {
    requestAnimationFrame(frame);
    if (!running || time - lastFrame < 1000 / 30) return;
    lastFrame = time;
    const now = time / 1000;
    const elapsed = now - cycleStarted;
    poseHands();
    if (testPattern === "highfive-up" || testPattern === "highfive-down") {
      highFive(HIGH_FIVE_SECONDS / 2);
      renderer.render(scene, camera);
      return;
    }
    if (testPattern === "highfive-mismatch") {
      crossingHighFive(HIGH_FIVE_SECONDS / 2);
      renderer.render(scene, camera);
      return;
    }
    if (elapsed < APPROACH_SECONDS) {
      approach(elapsed);
    } else if (elapsed < APPROACH_SECONDS + HIGH_FIVE_SECONDS) {
      if (sameHands) highFive(elapsed - APPROACH_SECONDS);
      else crossingHighFive(elapsed - APPROACH_SECONDS);
    } else {
      const exitElapsed = elapsed - APPROACH_SECONDS - HIGH_FIVE_SECONDS;
      if (sameHands) retreat(exitElapsed);
      else passBy(exitElapsed);
      if (exitElapsed >= EXIT_SECONDS) {
        chooseHands(now);
        approach(0);
      }
    }
    renderer.render(scene, camera);
  }

  document.addEventListener("visibilitychange", () => { running = !document.hidden; });
  window.addEventListener("resize", resize, { passive: true });
  resize();
  chooseHands(cycleStarted);
  requestAnimationFrame(frame);
}
