import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js";
import { createHeron } from "./cheonhoji-heron.js";

const sceneElement = document.querySelector("#cheonhoRunScene");
const canvas = document.querySelector("#cheonhoHeronCanvas");

if (sceneElement && canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.03;

  const stage = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(29, 1, 0.1, 40);
  camera.position.set(0, 2.0, 7.4);
  camera.lookAt(-0.15, 1.82, 0);
  stage.add(new THREE.HemisphereLight(0xffffff, 0x718999, 2.75));
  const key = new THREE.DirectionalLight(0xfffdf5, 3.3);
  key.position.set(-4, 7, 6);
  stage.add(key);
  const rim = new THREE.DirectionalLight(0xb9e2f7, 1.35);
  rim.position.set(5, 4, -5);
  stage.add(rim);

  const heron = createHeron();
  heron.scale.setScalar(0.96);
  heron.position.y = -0.35;
  stage.add(heron);
  const leftWing = heron.getObjectByName("left_Wing");
  const rightWing = heron.getObjectByName("right_Wing");

  let pixelBuffer = new Uint8Array(0);
  window.getCheonhoHeronPixelMask = () => {
    const gl = renderer.getContext();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const requiredLength = width * height * 4;
    if (!width || !height) return null;
    if (pixelBuffer.length !== requiredLength) pixelBuffer = new Uint8Array(requiredLength);
    try {
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuffer);
      return { data: pixelBuffer, width, height };
    } catch (error) {
      return null;
    }
  };

  let orbitPhase = -Math.PI * 0.38;
  let previousTime = 0;
  let safetyLift = 0;
  let targetSafetyLift = 0;

  window.getCheonhoHeronForecast = (seconds = 0) => {
    const moving = sceneElement.classList.contains("is-running");
    const futurePhase = orbitPhase + Math.max(0, Number(seconds) || 0) * (moving ? 0.47 : 0.30);
    return {
      x: 50 + Math.cos(futurePhase) * 42,
      y: 37 + Math.sin(futurePhase) * 27,
      phase: futurePhase,
    };
  };

  window.setCheonhoHeronSafetyLift = (active) => {
    targetSafetyLift = active ? 26 : 0;
  };

  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const pixelRatio = renderer.getPixelRatio();
    if (canvas.width === Math.floor(width * pixelRatio) && canvas.height === Math.floor(height * pixelRatio)) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function updateOrbit(time) {
    const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0;
    previousTime = time;
    const moving = sceneElement.classList.contains("is-running");
    orbitPhase += delta * (moving ? 0.47 : 0.30);
    safetyLift += (targetSafetyLift - safetyLift) * Math.min(1, delta * 3.8);

    const x = 50 + Math.cos(orbitPhase) * 42;
    const y = 37 + Math.sin(orbitPhase) * 27 - safetyLift;
    canvas.style.left = `${x}%`;
    canvas.style.top = `${y}%`;

    const horizontalVelocity = -Math.sin(orbitPhase);
    const targetFacing = horizontalVelocity >= 0 ? Math.PI : 0;
    const facingDelta = Math.atan2(Math.sin(targetFacing - heron.rotation.y), Math.cos(targetFacing - heron.rotation.y));
    heron.rotation.y += facingDelta * 0.13;
    heron.rotation.z = Math.cos(orbitPhase) * 0.035;

    const flap = Math.sin(time * 0.0065);
    if (leftWing) leftWing.scale.y = 1 + flap * 0.055;
    if (rightWing) rightWing.scale.y = 1 + flap * 0.055;
    heron.position.y = -0.35 + Math.sin(time * 0.004) * 0.045;
  }

  function frame(time) {
    resize();
    updateOrbit(time);
    renderer.render(stage, camera);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
