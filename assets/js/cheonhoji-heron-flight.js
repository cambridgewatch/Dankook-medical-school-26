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
  const targetMarker = document.createElement("div");
  targetMarker.className = "cheonho-heron-target";
  targetMarker.setAttribute("aria-hidden", "true");
  sceneElement.appendChild(targetMarker);

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
  const ATTACK_PATTERNS = ["horizontal", "vDive"];
  let patternIndex = 0;
  let patrolPhase = -Math.PI * 0.38;
  let previousTime = 0;
  let flightState = "patrol";
  let stateElapsed = 0;
  let stateDuration = 0;
  let nextAttackIn = 6.5;
  let currentPattern = "horizontal";
  let direction = 1;
  let attackTargetX = 50;
  let horizontalFlightY = 28;
  let diveBottomY = 58;
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

  function safeCanvasBounds() {
    const sceneWidth = Math.max(sceneElement.clientWidth, 1);
    const sceneHeight = Math.max(sceneElement.clientHeight, 1);
    const horizontalPadding = Math.min(32, Math.max(5, (canvas.clientWidth / sceneWidth) * 50 + 1));
    const verticalPadding = Math.min(32, Math.max(5, (canvas.clientHeight / sceneHeight) * 50 + 1));
    return {
      minX: horizontalPadding,
      maxX: 100 - horizontalPadding,
      minY: verticalPadding,
      maxY: 100 - verticalPadding,
    };
  }

  function containPosition(position) {
    const bounds = safeCanvasBounds();
    return {
      x: Math.max(bounds.minX, Math.min(bounds.maxX, position.x)),
      y: Math.max(bounds.minY, Math.min(bounds.maxY, position.y)),
    };
  }

  function nextPattern() {
    const pattern = ATTACK_PATTERNS[patternIndex % ATTACK_PATTERNS.length];
    patternIndex += 1;
    return pattern;
  }

  function hasTallObstacle() {
    return Boolean(sceneElement.querySelector(TALL_OBSTACLE_SELECTOR));
  }

  function patrolPosition(phase = patrolPhase) {
    const bounds = safeCanvasBounds();
    return containPosition({
      x: 50 + Math.cos(phase) * ((bounds.maxX - bounds.minX) / 2),
      y: bounds.minY + 7 + Math.sin(phase) * 5,
    });
  }

  function currentPlayerX() {
    if (!characterCanvas) return 50;
    const sceneRect = sceneElement.getBoundingClientRect();
    const characterRect = characterCanvas.getBoundingClientRect();
    if (!sceneRect.width) return 50;
    const center = characterRect.left + characterRect.width / 2;
    const bounds = safeCanvasBounds();
    return Math.max(bounds.minX, Math.min(bounds.maxX, ((center - sceneRect.left) / sceneRect.width) * 100));
  }

  function visibleVerticalBounds(mask, fallbackTop = 0.08, fallbackBottom = 0.92) {
    if (!mask?.data?.length || !mask.width || !mask.height) {
      return { top: fallbackTop, bottom: fallbackBottom };
    }
    let lowestBufferY = mask.height;
    let highestBufferY = -1;
    for (let y = 0; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) {
        if (mask.data[(y * mask.width + x) * 4 + 3] < 72) continue;
        lowestBufferY = Math.min(lowestBufferY, y);
        highestBufferY = Math.max(highestBufferY, y);
      }
    }
    if (highestBufferY < 0) return { top: fallbackTop, bottom: fallbackBottom };
    return {
      top: 1 - highestBufferY / Math.max(mask.height - 1, 1),
      bottom: 1 - lowestBufferY / Math.max(mask.height - 1, 1),
    };
  }

  function measureAttackHeights() {
    if (!characterCanvas) return;
    const sceneRect = sceneElement.getBoundingClientRect();
    const characterRect = characterCanvas.getBoundingClientRect();
    const heronRect = canvas.getBoundingClientRect();
    if (!sceneRect.height || !characterRect.height || !heronRect.height) return;
    const characterBounds = visibleVerticalBounds(window.getCheonhoCharacterPixelMask?.());
    const heronBounds = visibleVerticalBounds(window.getCheonhoHeronPixelMask?.());
    const characterHeight = Math.max(1, (characterBounds.bottom - characterBounds.top) * characterRect.height);
    const groundBottomValue = Number.parseFloat(
      getComputedStyle(sceneElement).getPropertyValue("--cheonho-ground-bottom")
    ) || 12;
    const groundY = sceneRect.bottom - sceneRect.height * (groundBottomValue / 100);
    const heronBottomOffset = (heronBounds.bottom - 0.5) * heronRect.height;
    const centerPercentForBottom = (bottomY) => (
      ((bottomY - heronBottomOffset - sceneRect.top) / sceneRect.height) * 100
    );
    horizontalFlightY = Math.max(4, Math.min(58,
      centerPercentForBottom(groundY - characterHeight * 1.5)
    ));
    diveBottomY = Math.max(30, Math.min(88, centerPercentForBottom(groundY)));
    targetMarker.style.left = `${attackTargetX}%`;
    targetMarker.style.top = `${((groundY - sceneRect.top) / sceneRect.height) * 100}%`;
  }

  function patternEntry(pattern, flightDirection, targetX) {
    const bounds = safeCanvasBounds();
    const sideX = flightDirection > 0 ? bounds.minX : bounds.maxX;
    if (pattern === "vDive") {
      const offset = targetX >= 50 ? 30 : -30;
      return containPosition({ x: targetX + offset, y: bounds.minY });
    }
    return containPosition({ x: sideX, y: horizontalFlightY });
  }

  function patternDuration(pattern) {
    return pattern === "vDive" ? 3.8 : 3.6;
  }

  function patternPosition(pattern, progress, flightDirection, targetX) {
    const t = clamp01(progress);
    const bounds = safeCanvasBounds();
    const fromX = flightDirection > 0 ? bounds.minX : bounds.maxX;
    const toX = flightDirection > 0 ? bounds.maxX : bounds.minX;
    if (pattern === "vDive") {
      const offset = targetX >= 50 ? 30 : -30;
      const startX = Math.max(bounds.minX, Math.min(bounds.maxX, targetX + offset));
      const endX = Math.max(bounds.minX, Math.min(bounds.maxX, targetX - offset));
      if (t < 0.5) {
        const amount = smoothstep(t * 2);
        return containPosition({ x: mix(startX, targetX, amount), y: mix(bounds.minY, diveBottomY, amount) });
      }
      const amount = smoothstep((t - 0.5) * 2);
      return containPosition({ x: mix(targetX, endX, amount), y: mix(diveBottomY, bounds.minY, amount) });
    }
    return containPosition({
      x: mix(fromX, toX, smoothstep(t)),
      y: horizontalFlightY,
    });
  }

  function beginWarning() {
    currentPattern = nextPattern();
    attackTargetX = currentPlayerX();
    direction = attackTargetX >= 50 ? -1 : 1;
    measureAttackHeights();
    flightState = "warning";
    stateElapsed = 0;
    stateDuration = 1.6;
    transitionStart = { x: displayX, y: displayY };
    warning.dataset.direction = direction > 0 ? "right" : "left";
    warning.innerHTML = currentPattern === "vDive"
      ? "<b>▼</b><span>백로 급강하 · 붉은 지점 주의</span>"
      : `<b>${direction > 0 ? "→" : "←"}</b><span>백로 수평 접근</span>`;
    warning.classList.add("is-visible");
    targetMarker.classList.toggle("is-visible", currentPattern === "vDive");
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
    targetMarker.classList.remove("is-visible");
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
      hazardous = true;
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

    const containedPosition = containPosition({ x: position.x, y: position.y - safetyLift });
    displayX = containedPosition.x;
    displayY = containedPosition.y;
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
