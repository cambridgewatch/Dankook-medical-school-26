import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js";
import { createBlueDanwoong, createNavyDanwoong, getDanwoongParts } from "./danwoong-models.js?v=4";

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
  blue.rotation.y = Math.PI / 2;
  navy.rotation.y = -Math.PI / 2;
  navy.position.z = 0.2;
  scene.add(blue, navy);

  const walkers = [
    { model: blue, parts: getDanwoongParts(blue), direction: 1, phase: 0 },
    { model: navy, parts: getDanwoongParts(navy), direction: -1, phase: Math.PI },
  ];
  let halfWidth = 20;
  let duration = 18;
  let headerHeight = 68;
  let lastFrame = 0;
  let running = !document.hidden;

  function resize() {
    const rect = header.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    headerHeight = Math.max(1, Math.round(rect.height || 68));
    renderer.setSize(width, headerHeight, false);
    const aspect = width / headerHeight;
    halfWidth = 2.65 * aspect;
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = 2.65;
    camera.bottom = -2.65;
    camera.updateProjectionMatrix();
    const mobile = width <= 820;
    const modelScale = mobile ? 0.86 : 0.94;
    blue.scale.setScalar(modelScale);
    navy.scale.setScalar(modelScale);
    duration = mobile ? 11 : 18;
  }

  function animateWalker(walker, elapsed, progress) {
    const stride = Math.sin(elapsed * 9 + walker.phase);
    const bounce = Math.abs(Math.cos(elapsed * 9 + walker.phase));
    const travelEdge = halfWidth + 2.2;
    walker.model.position.x = walker.direction > 0
      ? -travelEdge + progress * travelEdge * 2
      : travelEdge - progress * travelEdge * 2;
    walker.model.position.y = -2.53 + bounce * 0.09;
    walker.model.rotation.z = stride * 0.025;
    walker.parts.leftLeg.rotation.x = stride * 0.68;
    walker.parts.rightLeg.rotation.x = -stride * 0.68;
    walker.parts.leftArm.rotation.x = -stride * 0.46;
    walker.parts.rightArm.rotation.x = stride * 0.46;
  }

  function frame(time) {
    requestAnimationFrame(frame);
    if (!running || time - lastFrame < 1000 / 30) return;
    lastFrame = time;
    const elapsed = time / 1000;
    const progress = (elapsed % duration) / duration;
    walkers.forEach((walker) => animateWalker(walker, elapsed, progress));
    renderer.render(scene, camera);
  }

  document.addEventListener("visibilitychange", () => { running = !document.hidden; });
  window.addEventListener("resize", resize, { passive: true });
  resize();
  requestAnimationFrame(frame);
}
