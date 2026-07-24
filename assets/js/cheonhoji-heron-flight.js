import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js";
import { createHeron } from "./cheonhoji-heron.js";

const sceneElement = document.querySelector("#cheonhoRunScene");
const canvas = document.querySelector("#cheonhoHeronCanvas");
const characterCanvas = document.querySelector("#cheonhoCharacterCanvas");

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

  const warning = document.createElement("div");
  warning.className = "cheonho-heron-warning";
  warning.setAttribute("aria-hidden", "true");
  sceneElement.appendChild(warning);

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

  const TALL_OBSTACLE_SELECTOR = ["barrier", "fence", "gate", "kiosk", "mapboard"]
    .map((type) => `[data-obstacle-type="${type}"]`)
    .join(",");
  const ATTACK_PATTERNS = ["straight", "dive", "figureEight", "returnPass"];
  let patternBag = [];
  let patrolPhase = -Math.PI * 0.38;
  let previousTime = 0;
  let flightState = "patrol";
  let stateElapsed = 0;
  let stateDuration = 0;
  let nextAttackIn = 6.5;
  let currentPattern = "straight";
  let direction = 1;
  let attackTargetX = 50;
  let displayX = 10;
  let displayY = 16;
  let previousX = displayX;
  let transitionStart = { x: displayX, y: displayY };
  let recoveryTarget = { x: displayX, y: displayY };
  let safetyLift = 0;
  let targetSafetyLift = 0;
  let hazardous = false;

  const clamp01 = (value) => Math.max(0, Math.min(1, value));
  const smoothstep = (value) => {
    const t = clamp01(value);
    return t * t * (3 - 2 * t);
  };
  const mix = (from, to, amount) => from + (to - from) * amount;

  function shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function nextPattern() {
    if (!patternBag.length) patternBag = shuffle(ATTACK_PATTERNS);
    return patternBag.shift() || "straight";
  }

  function hasTallObstacle() {
    return Boolean(sceneElement.querySelector(TALL_OBSTACLE_SELECTOR));
  }

  function patrolPosition(phase = patrolPhase) {
    return {
      x: 50 + Math.cos(phase) * 42,
      y: 15 + Math.sin(phase) * 7,
    };
  }

  function currentPlayerX() {
    if (!characterCanvas) return 50;
    const sceneRect = sceneElement.getBoundingClientRect();
    const characterRect = characterCanvas.getBoundingClientRect();
    if (!sceneRect.width) return 50;
    const center = characterRect.left + characterRect.width / 2;
    return Math.max(7, Math.min(93, ((center - sceneRect.left) / sceneRect.width) * 100));
  }

  function patternEntry(pattern, flightDirection, targetX) {
    const sideX = flightDirection > 0 ? -12 : 112;
    if (pattern === "dive") return { x: sideX, y: 13 };
    if (pattern === "figureEight") return { x: targetX, y: 34 };
    if (pattern === "returnPass") return { x: sideX, y: 23 };
    return { x: sideX, y: 44 };
  }

  function patternDuration(pattern) {
    if (pattern === "dive") return 4.2;
    if (pattern === "figureEight") return 5.8;
    if (pattern === "returnPass") return 5.6;
    return 3.5;
  }

  function patternPosition(pattern, progress, flightDirection, targetX) {
    const t = clamp01(progress);
    const fromX = flightDirection > 0 ? -12 : 112;
    const toX = flightDirection > 0 ? 112 : -12;
    if (pattern === "dive") {
      const x = t < 0.5
        ? mix(fromX, targetX, smoothstep(t * 2))
        : mix(targetX, toX, smoothstep((t - 0.5) * 2));
      return {
        x,
        y: 13 + Math.pow(Math.sin(Math.PI * t), 1.28) * 42,
      };
    }
    if (pattern === "figureEight") {
      const angle = t * Math.PI * 2;
      const radius = Math.max(12, Math.min(32, targetX - 5, 95 - targetX));
      return {
        x: Math.max(3, Math.min(97, targetX + Math.sin(angle) * radius * flightDirection)),
        y: 34 + Math.sin(angle * 2) * 19,
      };
    }
    if (pattern === "returnPass") {
      if (t < 0.42) {
        return { x: mix(fromX, toX, smoothstep(t / 0.42)), y: 23 };
      }
      if (t < 0.58) {
        const turn = smoothstep((t - 0.42) / 0.16);
        return { x: toX + Math.sin(turn * Math.PI) * 5 * flightDirection, y: mix(23, 46, turn) };
      }
      return { x: mix(toX, fromX, smoothstep((t - 0.58) / 0.42)), y: 46 };
    }
    return {
      x: mix(fromX, toX, smoothstep(t)),
      y: 44 - Math.sin(Math.PI * t) * 4,
    };
  }

  function beginWarning() {
    currentPattern = nextPattern();
    attackTargetX = currentPlayerX();
    direction = attackTargetX >= 50 ? 1 : -1;
    flightState = "warning";
    stateElapsed = 0;
    stateDuration = 1.6;
    transitionStart = { x: displayX, y: displayY };
    warning.dataset.direction = direction > 0 ? "right" : "left";
    warning.innerHTML = `<b>${direction > 0 ? "→" : "←"}</b><span>백로 접근</span>`;
    warning.classList.add("is-visible");
  }

  function beginAttack() {
    if (hasTallObstacle() || targetSafetyLift > 0) {
      beginRecovery(2.2);
      return;
    }
    flightState = "attack";
    stateElapsed = 0;
    stateDuration = patternDuration(currentPattern);
    warning.classList.remove("is-visible");
  }

  function beginRecovery(delay = 0) {
    flightState = "recovery";
    stateElapsed = -delay;
    stateDuration = 1.8;
    transitionStart = { x: displayX, y: displayY };
    recoveryTarget = patrolPosition();
    warning.classList.remove("is-visible");
    hazardous = false;
  }

  function updateFlight(delta, moving, runMode) {
    patrolPhase += delta * (moving ? 0.24 : 0.15);
    safetyLift += (targetSafetyLift - safetyLift) * Math.min(1, delta * 1.25);

    if (!moving || !runMode) {
      if (flightState !== "patrol" && flightState !== "recovery") beginRecovery(0);
      nextAttackIn = Math.max(nextAttackIn, 3.5);
    }

    let position = patrolPosition();
    hazardous = false;

    if (flightState === "patrol") {
      position = patrolPosition();
      if (moving && runMode) {
        nextAttackIn -= delta;
        if (nextAttackIn <= 0 && !hasTallObstacle() && targetSafetyLift <= 0) beginWarning();
        else if (nextAttackIn <= 0) nextAttackIn = 1.1;
      }
    } else if (flightState === "warning") {
      stateElapsed += delta;
      const entry = patternEntry(currentPattern, direction, attackTargetX);
      const amount = smoothstep(stateElapsed / stateDuration);
      position = {
        x: mix(transitionStart.x, entry.x, amount),
        y: mix(transitionStart.y, entry.y, amount),
      };
      if (hasTallObstacle() || targetSafetyLift > 0) beginRecovery(0.5);
      else if (stateElapsed >= stateDuration) beginAttack();
    } else if (flightState === "attack") {
      stateElapsed += delta;
      position = patternPosition(currentPattern, stateElapsed / stateDuration, direction, attackTargetX);
      hazardous = position.y >= 29;
      if (hasTallObstacle() || targetSafetyLift > 0) beginRecovery(0);
      else if (stateElapsed >= stateDuration) beginRecovery(0);
    } else {
      stateElapsed += delta;
      if (stateElapsed < 0) {
        position = transitionStart;
      } else {
        const amount = smoothstep(stateElapsed / stateDuration);
        const movingTarget = patrolPosition();
        position = {
          x: mix(transitionStart.x, mix(recoveryTarget.x, movingTarget.x, amount), amount),
          y: mix(transitionStart.y, mix(recoveryTarget.y, movingTarget.y, amount), amount),
        };
        if (stateElapsed >= stateDuration) {
          flightState = "patrol";
          nextAttackIn = 5.5 + Math.random() * 4.5;
          position = patrolPosition();
        }
      }
    }

    displayX = position.x;
    displayY = position.y - safetyLift;
  }

  window.getCheonhoHeronForecast = (seconds = 0) => {
    if (flightState !== "patrol") return { x: displayX, y: displayY, attacking: true };
    const futurePhase = patrolPhase + Math.max(0, Number(seconds) || 0) * 0.24;
    return { ...patrolPosition(futurePhase), attacking: false };
  };
  window.setCheonhoHeronSafetyLift = (active) => {
    targetSafetyLift = active ? 11 : 0;
  };
  window.isCheonhoHeronAttackActive = () => flightState === "warning" || flightState === "attack";
  window.isCheonhoHeronHazardous = () => hazardous && flightState === "attack";

  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const pixelRatio = renderer.getPixelRatio();
    if (canvas.width === Math.floor(width * pixelRatio) && canvas.height === Math.floor(height * pixelRatio)) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function updateVisuals(time, delta) {
    const moving = sceneElement.classList.contains("is-running");
    const runMode = sceneElement.dataset.mode !== "walk";
    updateFlight(delta, moving, runMode);
    canvas.style.left = `${displayX}%`;
    canvas.style.top = `${displayY}%`;

    const horizontalVelocity = displayX - previousX;
    if (Math.abs(horizontalVelocity) > 0.01) {
      const targetFacing = horizontalVelocity >= 0 ? Math.PI : 0;
      const facingDelta = Math.atan2(Math.sin(targetFacing - heron.rotation.y), Math.cos(targetFacing - heron.rotation.y));
      heron.rotation.y += facingDelta * Math.min(1, delta * 7.5);
    }
    previousX = displayX;
    heron.rotation.z = Math.max(-0.10, Math.min(0.10, horizontalVelocity * 0.11));

    const flapSpeed = flightState === "attack" ? 0.009 : 0.0065;
    const flap = Math.sin(time * flapSpeed);
    if (leftWing) leftWing.scale.y = 1 + flap * 0.065;
    if (rightWing) rightWing.scale.y = 1 + flap * 0.065;
    heron.position.y = -0.35 + Math.sin(time * 0.004) * 0.045;
  }

  function frame(time) {
    resize();
    const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0;
    previousTime = time;
    updateVisuals(time, delta);
    renderer.render(stage, camera);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
