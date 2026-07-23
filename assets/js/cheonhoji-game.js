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
const lightToggleButton = document.querySelector("#cheonhoLightToggle");
const characterButtons = [...document.querySelectorAll("[data-cheonho-character]")];

if (sceneElement && canvas && playButton) {
  const savedCharacter = localStorage.getItem("cheonhojiGameCharacter") === "turtle" ? "turtle" : "otter";
  let selectedTime = "day";
  let selectedCharacter = savedCharacter;
  let running = false;
  let animal = null;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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
    if (lightToggleButton) {
      const isNight = selectedTime === "night";
      lightToggleButton.classList.toggle("is-night", isNight);
      lightToggleButton.setAttribute("aria-pressed", isNight ? "true" : "false");
      lightToggleButton.setAttribute("aria-label", isNight ? "불을 켜고 낮으로 전환" : "불을 끄고 밤으로 전환");
      lightToggleButton.querySelector("i").textContent = isNight ? "☾" : "☀";
      lightToggleButton.querySelector("b").textContent = isNight ? "불 켜기" : "불 끄기";
    }
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
  }

  function setRunning(value) {
    running = Boolean(value);
    sceneElement.classList.toggle("is-running", running);
    sceneElement.classList.toggle("is-paused", !running);
    playButton.classList.toggle("is-running", running);
    playButton.setAttribute("aria-pressed", running ? "true" : "false");
    playButton.querySelector("span").textContent = running ? "잠시 멈추기" : "달리기 시작";
    playButton.querySelector("i").textContent = running ? "Ⅱ" : "▶";
  }

  lightToggleButton?.addEventListener("click", () => applyTime(selectedTime === "day" ? "night" : "day"));
  characterButtons.forEach((button) => button.addEventListener("click", () => applyCharacter(button.dataset.cheonhoCharacter)));
  playButton.addEventListener("click", () => setRunning(!running));

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
  }

  async function enterFullscreen() {
    setRunning(true);
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

  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const pixelRatio = renderer.getPixelRatio();
    if (canvas.width !== Math.floor(width * pixelRatio) || canvas.height !== Math.floor(height * pixelRatio)) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
  }

  function animateAnimal(time) {
    if (!animal) return;
    const t = time * 0.001;
    const speed = selectedCharacter === "turtle" ? 5.2 : 8.2;
    const phase = t * speed;
    const strength = running ? 1 : 0.10;
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
  setRunning(false);
  requestAnimationFrame(frame);
}
