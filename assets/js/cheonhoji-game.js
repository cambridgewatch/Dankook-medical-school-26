import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js";
import {
  createOtterV3 as createOtter,
  createTurtleV3 as createTurtle,
  disposeAnimalV3 as disposeAnimal,
} from "./cheonhoji-animals-v3-curved.js?rev=game-v6";

const sceneElement = document.querySelector("#cheonhoRunScene");
const canvas = document.querySelector("#cheonhoCharacterCanvas");
const playButton = document.querySelector("#cheonhoPlayButton");
const fullscreenButton = document.querySelector("#cheonhoFullscreenButton");
const fullscreenExit = document.querySelector("#cheonhoFullscreenExit");
const lightToggleButtons = [...document.querySelectorAll("[data-cheonho-light-toggle]")];
const characterButtons = [...document.querySelectorAll("[data-cheonho-character]")];
const modeButtons = [...document.querySelectorAll("[data-cheonho-mode]")];

if (sceneElement && canvas && playButton) {
  const savedCharacter = localStorage.getItem("cheonhojiGameCharacter") === "turtle" ? "turtle" : "otter";
  let selectedTime = "day";
  let selectedCharacter = savedCharacter;
  let selectedMode = "run";
  let running = false;
  let animal = null;
  let jumping = false;
  let jumpOffset = 0;
  let jumpVelocity = 0;
  let jumpCount = 0;
  let previousFrameTime = 0;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  let collisionPixelBuffer = new Uint8Array(0);
  window.getCheonhoCharacterPixelMask = () => {
    const gl = renderer.getContext();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const requiredLength = width * height * 4;
    if (!width || !height) return null;
    if (collisionPixelBuffer.length !== requiredLength) collisionPixelBuffer = new Uint8Array(requiredLength);
    try {
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, collisionPixelBuffer);
      return { data: collisionPixelBuffer, width, height };
    } catch (error) {
      return null;
    }
  };

  const stage = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 30);
  camera.position.set(0.15, 2.05, 7.2);
  camera.lookAt(0, 1.36, 0);
  stage.add(new THREE.HemisphereLight(0xf3fbff, 0x52644d, 2.6));
  const key = new THREE.DirectionalLight(0xffffff, 3.3);
  key.position.set(-3.5, 7, 5.5);
  key.castShadow = true;
  stage.add(key);
  const rim = new THREE.DirectionalLight(0x8ec9ff, 1.6);
  rim.position.set(4, 3, -4);
  stage.add(rim);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.92, 48),
    new THREE.ShadowMaterial({ color: 0x07131a, opacity: 0.28 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1.25, 0.62, 1);
  shadow.position.y = -0.03;
  shadow.receiveShadow = true;
  stage.add(shadow);

  function setButtonState(buttons, selected, keyName) {
    buttons.forEach((button) => {
      const active = button.dataset[keyName] === selected;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function applyTime(value) {
    selectedTime = value === "night" ? "night" : "day";
    sceneElement.dataset.time = selectedTime;
    localStorage.removeItem("cheonhojiGameTime");
    const isNight = selectedTime === "night";
    lightToggleButtons.forEach((button) => {
      button.classList.toggle("is-night", isNight);
      button.setAttribute("aria-pressed", isNight ? "true" : "false");
      button.setAttribute("aria-label", isNight ? "불을 켜고 낮으로 전환" : "불을 끄고 밤으로 전환");
      button.querySelector("i").textContent = isNight ? "☾" : "☀";
      button.querySelector("b").textContent = isNight ? "불 켜기" : "불 끄기";
    });
    document.querySelector(".cheonho-run-card")?.classList.toggle("is-night", selectedTime === "night");
    renderer.toneMappingExposure = selectedTime === "night" ? 0.90 : 1.08;
  }

  function applyCharacter(value) {
    selectedCharacter = value === "turtle" ? "turtle" : "otter";
    sceneElement.dataset.character = selectedCharacter;
    localStorage.setItem("cheonhojiGameCharacter", selectedCharacter);
    setButtonState(characterButtons, selectedCharacter, "cheonhoCharacter");
    if (animal) {
      stage.remove(animal);
      disposeAnimal(animal);
    }
    animal = selectedCharacter === "turtle" ? createTurtle() : createOtter();
    animal.rotation.y = selectedCharacter === "turtle" ? Math.PI - 0.34 : 0.50;
    animal.scale.setScalar(selectedCharacter === "turtle" ? 0.82 : 0.88);
    animal.position.set(selectedCharacter === "turtle" ? -0.05 : 0, selectedCharacter === "turtle" ? 0.05 : 0.02, 0);
    const parts = animal.userData.parts || {};
    animal.userData.restHeadX = parts.head?.position.x ?? 0;
    stage.add(animal);
    fitCameraToCharacter();
    sceneElement.dispatchEvent(new CustomEvent("cheonho:characterchange"));
  }

  function fitCameraToCharacter() {
    if (!animal) return;

    const fitOtterForDesktopFullscreen = selectedCharacter === "otter" &&
      fullscreenActive() &&
      !window.matchMedia("(max-width: 900px)").matches;

    if (selectedCharacter !== "turtle" && !fitOtterForDesktopFullscreen) {
      camera.position.set(0.15, 2.05, 7.2);
      camera.lookAt(0, 1.36, 0);
      return;
    }

    animal.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(animal);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(camera.aspect, 0.1));
    const verticalDistance = size.y / (2 * Math.tan(verticalFov / 2));
    const horizontalDistance = size.x / (2 * Math.tan(horizontalFov / 2));
    const distance = Math.max(verticalDistance, horizontalDistance) *
      (selectedCharacter === "otter" ? 1.15 : 1.18);

    const cameraLift = selectedCharacter === "otter" ? 0.08 : 0.16;
    const lookLift = selectedCharacter === "otter" ? 0.02 : 0.06;
    camera.position.set(center.x, center.y + cameraLift, center.z + distance);
    camera.lookAt(center.x, center.y + lookLift, center.z);
  }

  function resetJump() {
    jumping = false;
    jumpOffset = 0;
    jumpVelocity = 0;
    jumpCount = 0;
    canvas.style.setProperty("--cheonho-jump-y", "0px");
    sceneElement.classList.remove("is-jumping");
  }

  function startJump() {
    if (!running || jumpCount >= 2) return false;
    jumping = true;
    jumpVelocity = jumpCount === 0 ? 6.2 : 6.4;
    jumpCount += 1;
    sceneElement.classList.add("is-jumping", "has-jumped");
    return true;
  }

  function updateJump(time) {
    const delta = previousFrameTime ? Math.min((time - previousFrameTime) / 1000, 0.034) : 0;
    previousFrameTime = time;
    if (!jumping || delta <= 0) return jumpOffset;

    jumpVelocity -= 13.5 * delta;
    jumpOffset += jumpVelocity * delta;

    if (jumpOffset <= 0 && jumpVelocity < 0) {
      resetJump();
      return 0;
    }
    return jumpOffset;
  }

  function setRunning(value) {
    running = Boolean(value);
    if (!running) resetJump();
    sceneElement.classList.toggle("is-running", running);
    sceneElement.classList.toggle("is-paused", !running);
    playButton.classList.toggle("is-running", running);
    playButton.setAttribute("aria-pressed", running ? "true" : "false");
    playButton.querySelector("span").textContent = running
      ? "잠시 멈추기"
      : (selectedMode === "walk" ? "산책 시작" : "달리기 시작");
    playButton.querySelector("i").textContent = running ? "Ⅱ" : "▶";
    sceneElement.dispatchEvent(new CustomEvent("cheonho:runningchange", {
      detail: { running },
    }));
  }

  lightToggleButtons.forEach((button) => button.addEventListener("click", () => applyTime(selectedTime === "day" ? "night" : "day")));
  characterButtons.forEach((button) => button.addEventListener("click", () => applyCharacter(button.dataset.cheonhoCharacter)));
  modeButtons.forEach((button) => button.addEventListener("click", () => {
    selectedMode = button.dataset.cheonhoMode === "walk" ? "walk" : "run";
    setButtonState(modeButtons, selectedMode, "cheonhoMode");
    sceneElement.dataset.mode = selectedMode;
    setRunning(false);
    sceneElement.dispatchEvent(new CustomEvent("cheonho:modechange", { detail: { mode: selectedMode } }));
  }));
  playButton.addEventListener("click", () => {
    if (sceneElement.dataset.gameOver === "true") {
      sceneElement.dispatchEvent(new CustomEvent("cheonho:restart"));
      return;
    }
    setRunning(!running);
  });
  sceneElement.addEventListener("cheonho:setrunning", (event) => {
    setRunning(Boolean(event.detail?.running));
  });

  function fullscreenActive() {
    return document.fullscreenElement === sceneElement ||
      document.webkitFullscreenElement === sceneElement ||
      sceneElement.classList.contains("is-fullscreen-fallback");
  }

  function syncFullscreenState() {
    const active = fullscreenActive();
    sceneElement.classList.toggle("is-native-fullscreen", active && !sceneElement.classList.contains("is-fullscreen-fallback"));
    document.body.classList.toggle("cheonho-fullscreen-open", active);
    if (fullscreenButton) {
      fullscreenButton.setAttribute("aria-pressed", active ? "true" : "false");
      fullscreenButton.setAttribute("aria-label", active ? "전체화면 닫기" : "전체화면으로 보기");
    }
    fitCameraToCharacter();
    sceneElement.dispatchEvent(new CustomEvent("cheonho:layoutchange"));
  }

  async function enterFullscreen() {
    if (sceneElement.dataset.gameOver === "true") {
      sceneElement.dispatchEvent(new CustomEvent("cheonho:restart"));
    } else {
      setRunning(true);
    }
    try {
      if (sceneElement.requestFullscreen) {
        await sceneElement.requestFullscreen();
      } else if (sceneElement.webkitRequestFullscreen) {
        sceneElement.webkitRequestFullscreen();
      } else {
        sceneElement.classList.add("is-fullscreen-fallback");
      }
    } catch (error) {
      sceneElement.classList.add("is-fullscreen-fallback");
    }
    if (window.matchMedia("(max-width: 900px)").matches && screen.orientation?.lock) {
      try {
        await screen.orientation.lock("landscape");
      } catch (error) {
        // iOS and some browsers use the portrait-to-landscape CSS fallback.
      }
    }
    syncFullscreenState();
  }

  async function exitFullscreen() {
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    } catch (error) {
      // The fixed-position fallback below still restores the page.
    }
    if (screen.orientation?.unlock) screen.orientation.unlock();
    sceneElement.classList.remove("is-fullscreen-fallback");
    syncFullscreenState();
  }

  fullscreenButton?.addEventListener("click", () => fullscreenActive() ? exitFullscreen() : enterFullscreen());
  fullscreenExit?.addEventListener("click", exitFullscreen);
  document.addEventListener("fullscreenchange", syncFullscreenState);
  document.addEventListener("webkitfullscreenchange", syncFullscreenState);

  sceneElement.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button") || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (!startJump()) return;
    event.preventDefault();
    try { sceneElement.setPointerCapture(event.pointerId); } catch (error) { /* Pointer capture is optional. */ }
  });
  sceneElement.addEventListener("contextmenu", (event) => {
    if (running && !event.target.closest("button")) event.preventDefault();
  });
  window.addEventListener("keydown", (event) => {
    if (event.code !== "Space" || event.repeat || event.target.closest("input, textarea, select, button")) return;
    if (startJump()) event.preventDefault();
  });

  let lastFullscreenTouchEnd = 0;
  sceneElement.addEventListener("touchend", (event) => {
    if (!fullscreenActive() || !window.matchMedia("(pointer: coarse)").matches) return;
    const now = Date.now();
    if (now - lastFullscreenTouchEnd < 360) event.preventDefault();
    lastFullscreenTouchEnd = now;
  }, { passive: false });
  sceneElement.addEventListener("dblclick", (event) => {
    if (fullscreenActive() && window.matchMedia("(pointer: coarse)").matches) event.preventDefault();
  });

  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const pixelRatio = renderer.getPixelRatio();
    if (canvas.width !== Math.floor(width * pixelRatio) || canvas.height !== Math.floor(height * pixelRatio)) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      fitCameraToCharacter();
    }
  }

  function animateAnimal(time) {
    if (!animal) return;
    const t = time * 0.001;
    const speed = selectedCharacter === "turtle" ? 5.2 : 8.2;
    const phase = t * speed;
    const strength = running ? 1 : 0.10;
    const currentJumpOffset = updateJump(time);
    canvas.style.setProperty(
      "--cheonho-jump-y",
      `${currentJumpOffset * sceneElement.clientHeight * 0.10}px`
    );
    const parts = animal.userData.parts || {};

    if (selectedCharacter === "otter") {
      animal.position.y = 0.02 + Math.abs(Math.sin(phase)) * 0.10 * strength;
      animal.rotation.z = Math.sin(phase) * 0.025 * strength;
      if (parts.leftArm) parts.leftArm.rotation.x = Math.sin(phase) * 0.64 * strength;
      if (parts.rightArm) parts.rightArm.rotation.x = -Math.sin(phase) * 0.64 * strength;
      if (parts.leftLeg) parts.leftLeg.rotation.x = -Math.sin(phase) * 0.52 * strength;
      if (parts.rightLeg) parts.rightLeg.rotation.x = Math.sin(phase) * 0.52 * strength;
      if (parts.tail) parts.tail.rotation.z = Math.sin(phase * 0.55) * 0.18 * strength;
      if (parts.head) parts.head.rotation.z = -Math.sin(phase) * 0.025 * strength;
    } else {
      animal.position.y = 0.05 + Math.abs(Math.sin(phase)) * 0.045 * strength;
      animal.rotation.z = Math.sin(phase) * 0.018 * strength;
      ["FrontNear", "BackFar"].forEach((name) => { if (parts[name]) parts[name].rotation.z = Math.sin(phase) * 0.42 * strength; });
      ["FrontFar", "BackNear"].forEach((name) => { if (parts[name]) parts[name].rotation.z = -Math.sin(phase) * 0.42 * strength; });
      if (parts.head) parts.head.position.x = (animal.userData.restHeadX ?? -1.38) + Math.sin(phase * 0.5) * 0.035 * strength;
      if (parts.tail) parts.tail.rotation.y = Math.sin(phase * 0.65) * 0.14 * strength;
    }
  }

  function frame(time) {
    resize();
    animateAnimal(time);
    renderer.render(stage, camera);
    requestAnimationFrame(frame);
  }

  applyTime(selectedTime);
  applyCharacter(selectedCharacter);
  sceneElement.dataset.mode = selectedMode;
  setButtonState(modeButtons, selectedMode, "cheonhoMode");
  setRunning(false);
  requestAnimationFrame(frame);
}
