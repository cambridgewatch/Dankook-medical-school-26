import { auth, db, ADMIN_EMAIL, emailToName } from "./firebase-init.js?v=12";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const scene = document.querySelector("#cheonhoRunScene");
const track = scene?.querySelector(".cheonho-background-track");
const character = document.querySelector("#cheonhoCharacterCanvas");
const obstacleLayer = document.querySelector("#cheonhoObstacleLayer");
const moveControls = scene?.querySelector(".cheonho-mobile-move-controls");
const scoreElement = document.querySelector("#cheonhoLapScore");
const finalScoreElement = document.querySelector("#cheonhoFinalScore");
const crashReasonElement = document.querySelector("#cheonhoCrashReason");
const gameOverElement = document.querySelector("#cheonhoGameOver");
const retryButton = document.querySelector("#cheonhoRetryButton");
const moveButtons = [...document.querySelectorAll("[data-cheonho-move]")];
const rankingStatus = document.querySelector("#cheonhoRankingStatus");
const rankingSummary = document.querySelector("#cheonhoRankingSummary");
const myBestElement = document.querySelector("#cheonhoMyBest");
const myRankElement = document.querySelector("#cheonhoMyRank");
const topScoreElement = document.querySelector("#cheonhoTopScore");
const adminRanking = document.querySelector("#cheonhoAdminRanking");

if (scene && track && character && obstacleLayer && scoreElement) {
  const obstacles = [];
  const movement = { left: false, right: false };
  let running = false;
  let gameOver = false;
  let gameMode = "run";
  let elapsedSeconds = 0;
  let distanceLaps = 0;
  let characterX = 11;
  let lastFrame = 0;
  let nextSpawnIn = 3.4;
  let currentUser = null;
  let lastObstacleType = "";
  let unsubscribeRanking = null;
  let gameOverAt = 0;
  let regularObstacleBag = [];
  let doubleObstacleBag = [];
  let obstacleCategoryBag = [];
  let consecutiveDoubleJumps = 0;
  let obstacleTier = -1;
  let obstacleRateTier = -1;

  function animationDurationSeconds() {
    const raw = getComputedStyle(track).animationDuration.split(",")[0].trim();
    const value = Number.parseFloat(raw) || 120;
    return raw.endsWith("ms") ? value / 1000 : value;
  }

  function currentLaps() {
    return distanceLaps;
  }

  function formattedLaps(value = currentLaps()) {
    return Math.max(0, value).toFixed(2);
  }

  function renderScore() {
    scoreElement.textContent = formattedLaps();
  }

  function difficultyFor(laps) {
    return 1 + Math.max(0, laps) * 0.5;
  }

  const DOUBLE_JUMP_TYPES = new Set(["barrier", "fence", "gate", "kiosk", "mapboard"]);
  const OBSTACLE_TIERS = [
    ["puddle", "rock", "curb", "bottle", "leaves", "picnicmat", "ducktoy", "rainboot"],
    ["cooler", "planter", "basket", "bollard", "chair", "stump", "sandbag", "flowerpot", "backpack", "umbrella", "bucket", "crate"],
    ["cone", "bin", "sign", "scooter", "lifebuoy", "lantern", "hydrant", "bench", "cart", "bike", "tire", "flowerbox", "camera", "tripod", "skateboard"],
    ["barrier", "fence", "gate", "kiosk", "mapboard"],
  ];

  const baseLapDuration = Math.max(animationDurationSeconds(), 1);

  function setBackgroundSpeed(multiplier) {
    track.getAnimations().forEach((animation) => {
      if (Math.abs(animation.playbackRate - multiplier) <= 0.005) return;
      if (typeof animation.updatePlaybackRate === "function") animation.updatePlaybackRate(multiplier);
      else animation.playbackRate = multiplier;
    });
  }

  function resetTrackAnimation() {
    track.style.animation = "none";
    void track.offsetWidth;
    track.style.animation = "";
  }

  function clearObstacles() {
    obstacles.splice(0).forEach((obstacle) => obstacle.element.remove());
  }

  function shuffled(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function obstacleTypeForProgress(laps) {
    const tier = laps < 0.25 ? 0 : laps < 0.65 ? 1 : laps < 1 ? 2 : 3;
    if (tier !== obstacleTier) {
      obstacleTier = tier;
      regularObstacleBag = [];
    }

    const rateTier = laps < 1 ? 0 : 1;
    if (rateTier !== obstacleRateTier) {
      obstacleRateTier = rateTier;
      obstacleCategoryBag = [];
      consecutiveDoubleJumps = 0;
    }

    if (obstacleCategoryBag.length === 0) {
      obstacleCategoryBag = rateTier === 0
        ? shuffled([
          "double", "double", "double", "double",
          "regular", "regular", "regular", "regular",
          "regular", "regular", "regular", "regular",
        ])
        : shuffled([
          "double", "double", "double", "double", "double", "double",
          "regular", "regular", "regular", "regular", "regular", "regular",
        ]);
    }

    if (consecutiveDoubleJumps >= 3 && obstacleCategoryBag[0] === "double") {
      const regularIndex = obstacleCategoryBag.indexOf("regular");
      if (regularIndex >= 0) {
        [obstacleCategoryBag[0], obstacleCategoryBag[regularIndex]] = [
          obstacleCategoryBag[regularIndex],
          obstacleCategoryBag[0],
        ];
      }
    }

    const category = obstacleCategoryBag.shift() || "regular";
    if (category === "double") {
      if (doubleObstacleBag.length === 0) doubleObstacleBag = shuffled(OBSTACLE_TIERS[3]);
      const type = doubleObstacleBag.shift() || "barrier";
      consecutiveDoubleJumps += 1;
      lastObstacleType = type;
      return type;
    }

    const regularChoices = OBSTACLE_TIERS.slice(0, Math.min(tier, 2) + 1).flat();
    if (regularObstacleBag.length === 0) regularObstacleBag = shuffled(regularChoices);
    let type = regularObstacleBag.shift() || "puddle";
    const tallTypes = new Set(["bin", "sign", "lantern", "hydrant", "tripod", ...DOUBLE_JUMP_TYPES]);
    if (tallTypes.has(type) && tallTypes.has(lastObstacleType)) {
      const replacementIndex = regularObstacleBag.findIndex((candidate) => !tallTypes.has(candidate));
      if (replacementIndex >= 0) {
        [type, regularObstacleBag[replacementIndex]] = [regularObstacleBag[replacementIndex], type];
      }
    }
    consecutiveDoubleJumps = 0;
    lastObstacleType = type;
    return type;
  }

  function sizeObstacle(obstacle) {
    const turtle = scene.dataset.character === "turtle";
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const mobileTurtle = turtle && coarsePointer;
    const sceneWidth = Math.max(scene.clientWidth, 1);
    const sceneHeight = Math.max(scene.clientHeight, 1);
    const ratios = {
      puddle: { width: 0.075, height: 0.020 },
      rock: { width: 0.045, height: 0.040 },
      curb: { width: 0.065, height: 0.032 },
      bottle: { width: 0.020, height: 0.070 },
      cooler: { width: 0.050, height: 0.065 },
      planter: { width: 0.045, height: 0.075 },
      basket: { width: 0.055, height: 0.075 },
      bollard: { width: 0.025, height: 0.085 },
      chair: { width: 0.050, height: 0.085 },
      cone: { width: 0.030, height: 0.090 },
      bin: { width: 0.040, height: 0.100 },
      sign: { width: 0.045, height: 0.100 },
      scooter: { width: 0.070, height: 0.085 },
      lifebuoy: { width: 0.045, height: 0.100 },
      barrier: { width: 0.035, height: 0.180 },
      leaves: { width: 0.060, height: 0.025 },
      stump: { width: 0.042, height: 0.060 },
      sandbag: { width: 0.060, height: 0.045 },
      flowerpot: { width: 0.038, height: 0.070 },
      backpack: { width: 0.045, height: 0.080 },
      umbrella: { width: 0.065, height: 0.070 },
      picnicmat: { width: 0.080, height: 0.018 },
      lantern: { width: 0.032, height: 0.105 },
      hydrant: { width: 0.035, height: 0.095 },
      bench: { width: 0.075, height: 0.085 },
      cart: { width: 0.070, height: 0.095 },
      fence: { width: 0.050, height: 0.180 },
      gate: { width: 0.055, height: 0.180 },
      kiosk: { width: 0.060, height: 0.180 },
      bike: { width: 0.075, height: 0.085 },
      tire: { width: 0.045, height: 0.075 },
      bucket: { width: 0.043, height: 0.070 },
      crate: { width: 0.055, height: 0.075 },
      flowerbox: { width: 0.065, height: 0.070 },
      camera: { width: 0.045, height: 0.065 },
      tripod: { width: 0.050, height: 0.105 },
      ducktoy: { width: 0.050, height: 0.050 },
      rainboot: { width: 0.035, height: 0.070 },
      skateboard: { width: 0.075, height: 0.035 },
      mapboard: { width: 0.060, height: 0.180 },
    };
    const ratio = ratios[obstacle.type] || ratios.curb;
    const mobileScale = coarsePointer ? 0.94 : 1;
    const widthScale = mobileTurtle ? 0.87 : mobileScale;
    let obstacleWidth = Math.max(12, sceneWidth * ratio.width * widthScale);
    let obstacleHeight;

    if (DOUBLE_JUMP_TYPES.has(obstacle.type)) {
      const gravity = Number.parseFloat(scene.dataset.jumpGravity || "13.5") || 13.5;
      const firstJumpVelocity = Number.parseFloat(scene.dataset.firstJumpVelocity || "6.2") || 6.2;
      const secondJumpVelocity = Number.parseFloat(scene.dataset.secondJumpVelocity || "6.4") || 6.4;
      const jumpScale = Number.parseFloat(scene.dataset.jumpScale || "0.32") || 0.32;
      const jumpPixelsPerUnit = Math.max(character.offsetHeight, 1) * jumpScale;
      const maximumDoubleJump = (
        (firstJumpVelocity ** 2 + secondJumpVelocity ** 2) / (2 * gravity)
      ) * jumpPixelsPerUnit;
      const obstacleSpeed = Math.max(sceneWidth * 0.095 * difficultyFor(currentLaps()), 1);
      const collisionFootprintRatio = turtle ? 0.55 : 0.50;
      const characterCollisionWidth = character.offsetWidth * collisionFootprintRatio;
      const optimalAirTime = (firstJumpVelocity / gravity) + (2 * secondJumpVelocity / gravity);
      const maximumPassableWidth = Math.max(
        10,
        obstacleSpeed * optimalAirTime * 0.90 - characterCollisionWidth
      );
      obstacleWidth = Math.min(obstacleWidth, maximumPassableWidth);
      const effectiveCrossingWidth = obstacleWidth + characterCollisionWidth;
      const halfCrossingTime = (effectiveCrossingWidth / 2) / obstacleSpeed;
      const trajectoryDrop = 0.5 * gravity * (halfCrossingTime ** 2) * jumpPixelsPerUnit;
      const controlMargin = Math.max(5, character.offsetHeight * 0.07);
      const thicknessAdjustedHeight = Math.max(
        5,
        (maximumDoubleJump - trajectoryDrop - controlMargin) * 0.92
      );
      obstacleHeight = Math.min(sceneHeight * 0.18, thicknessAdjustedHeight);
      obstacle.element.style.setProperty("--jump-arc-w", `${Math.max(effectiveCrossingWidth * 1.18, obstacleWidth * 2.2)}px`);
      obstacle.element.style.setProperty("--jump-arc-h", `${Math.max(obstacleHeight + 24, maximumDoubleJump * 0.90)}px`);
    } else {
      const heightScale = mobileTurtle ? 0.88 : mobileScale;
      obstacleHeight = Math.max(8, sceneHeight * ratio.height * heightScale);
    }

    obstacle.element.style.setProperty("--obstacle-w", `${obstacleWidth}px`);
    obstacle.element.style.setProperty("--obstacle-h", `${obstacleHeight}px`);
  }

  function spawnObstacle() {
    const type = obstacleTypeForProgress(currentLaps());
    const element = document.createElement("div");
    element.className = `cheonho-obstacle cheonho-obstacle-${type}`;
    element.dataset.obstacleType = type;
    if (DOUBLE_JUMP_TYPES.has(type)) {
      element.insertAdjacentHTML("beforeend", `
        <span class="cheonho-jump-arc" aria-hidden="true">
          <svg viewBox="0 0 100 48" preserveAspectRatio="none"><path d="M2 46 Q50 1 98 46" /></svg>
        </span>
      `);
    }
    obstacleLayer.appendChild(element);
    const obstacle = { element, x: 108, type };
    sizeObstacle(obstacle);
    obstacles.push(obstacle);
  }

  function scheduleNextSpawn(laps) {
    const difficulty = difficultyFor(laps);
    const base = 2.9 + Math.random() * 1.5;
    const recoveryMinimum = DOUBLE_JUMP_TYPES.has(lastObstacleType) ? 2.25 : 1.42;
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const turtle = scene.dataset.character === "turtle";
    const spacingScale = coarsePointer ? (turtle ? 1.32 : 1.14) : 1;
    nextSpawnIn = Math.max(
      recoveryMinimum * spacingScale,
      (base * spacingScale) / difficulty
    );
  }

  function setCharacterX(value) {
    const sceneWidth = Math.max(scene.clientWidth, 1);
    const visibleWidthRatio = scene.dataset.character === "turtle" ? 0.72 : 0.68;
    const characterHalfWidth = Math.min(
      45,
      (character.offsetWidth * visibleWidthRatio / sceneWidth) * 50
    );
    const edgePadding = 0.75;
    const minimumX = characterHalfWidth + edgePadding;
    const maximumX = 100 - characterHalfWidth - edgePadding;
    characterX = Math.max(minimumX, Math.min(maximumX, value));
    character.style.left = `${characterX}%`;
  }

  function initialCharacterX() {
    if (!moveControls || getComputedStyle(moveControls).display === "none") return 11;
    const sceneWidth = Math.max(scene.clientWidth, 1);
    const visibleWidthRatio = scene.dataset.character === "turtle" ? 0.72 : 0.68;
    const visibleCharacterWidth = character.offsetWidth * visibleWidthRatio;
    const controlsRight = moveControls.offsetLeft + moveControls.offsetWidth;
    return ((controlsRight + 12 + visibleCharacterWidth / 2) / sceneWidth) * 100;
  }

  function roundedRectContains(x, y, left, top, right, bottom, radius) {
    if (x < left || x > right || y < top || y > bottom) return false;
    const r = Math.max(0, Math.min(radius, (right - left) / 2, (bottom - top) / 2));
    const closestX = Math.max(left + r, Math.min(right - r, x));
    const closestY = Math.max(top + r, Math.min(bottom - r, y));
    const dx = x - closestX;
    const dy = y - closestY;
    return dx * dx + dy * dy <= r * r;
  }

  function ellipseContains(x, y, centerX, centerY, radiusX, radiusY) {
    const normalizedX = (x - centerX) / Math.max(radiusX, 1);
    const normalizedY = (y - centerY) / Math.max(radiusY, 1);
    return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
  }

  function obstaclePixelIsOpaque(type, localX, localY, width, height) {
    if (type === "puddle" || type === "rock") {
      return ellipseContains(localX, localY, width / 2, height / 2, width / 2, height / 2);
    }
    if (type === "bottle") {
      const body = roundedRectContains(localX, localY, width * 0.18, height * 0.20, width * 0.82, height, width * 0.16);
      const neck = roundedRectContains(localX, localY, width * 0.34, 0, width * 0.66, height * 0.28, width * 0.08);
      return body || neck;
    }
    if (type === "cooler") {
      const body = roundedRectContains(localX, localY, 0, height * 0.22, width, height, Math.min(8, height * 0.14));
      const handle = roundedRectContains(localX, localY, width * 0.16, 0, width * 0.84, height * 0.42, Math.min(8, height * 0.14));
      return body || handle;
    }
    if (type === "chair") {
      const seat = roundedRectContains(localX, localY, width * 0.08, height * 0.43, width * 0.92, height * 0.58, 3);
      const back = roundedRectContains(localX, localY, width * 0.10, 0, width * 0.24, height * 0.50, 3);
      const leftLeg = roundedRectContains(localX, localY, width * 0.16, height * 0.52, width * 0.27, height, 2);
      const rightLeg = roundedRectContains(localX, localY, width * 0.73, height * 0.52, width * 0.84, height, 2);
      return seat || back || leftLeg || rightLeg;
    }
    if (type === "scooter") {
      const leftWheel = ellipseContains(localX, localY, width * 0.18, height * 0.88, width * 0.12, height * 0.12);
      const rightWheel = ellipseContains(localX, localY, width * 0.76, height * 0.88, width * 0.12, height * 0.12);
      const deck = roundedRectContains(localX, localY, width * 0.12, height * 0.72, width * 0.79, height * 0.83, 3);
      const stem = roundedRectContains(localX, localY, width * 0.70, height * 0.12, width * 0.78, height * 0.76, 2);
      const handle = roundedRectContains(localX, localY, width * 0.55, height * 0.08, width * 0.94, height * 0.18, 3);
      return leftWheel || rightWheel || deck || stem || handle;
    }
    if (type === "lifebuoy") {
      const outerRing = ellipseContains(localX, localY, width * 0.50, height * 0.30, width * 0.42, height * 0.28);
      const innerRing = ellipseContains(localX, localY, width * 0.50, height * 0.30, width * 0.22, height * 0.13);
      const post = roundedRectContains(localX, localY, width * 0.45, height * 0.53, width * 0.55, height * 0.94, 2);
      const foot = roundedRectContains(localX, localY, width * 0.20, height * 0.90, width * 0.80, height, 3);
      return (outerRing && !innerRing) || post || foot;
    }
    if (type === "cone") {
      if (localY >= height * 0.82) return localX >= 0 && localX <= width;
      const progress = Math.max(0, Math.min(1, localY / (height * 0.82)));
      const halfWidth = width * (0.07 + progress * 0.25);
      return Math.abs(localX - width / 2) <= halfWidth;
    }
    if (type === "basket") {
      const body = roundedRectContains(localX, localY, 0, height * 0.25, width, height, Math.min(8, height * 0.15));
      const outerHandle = roundedRectContains(localX, localY, width * 0.22, 0, width * 0.78, height * 0.52, Math.min(10, width * 0.16));
      const innerHandle = roundedRectContains(localX, localY, width * 0.34, height * 0.10, width * 0.66, height * 0.42, Math.min(7, width * 0.10));
      return body || (outerHandle && !innerHandle);
    }
    if (type === "sign") {
      const board = roundedRectContains(localX, localY, 0, 0, width, height * 0.48, Math.min(7, height * 0.08));
      const post = roundedRectContains(localX, localY, width * 0.43, height * 0.42, width * 0.57, height * 0.94, Math.min(3, width * 0.05));
      const foot = roundedRectContains(localX, localY, width * 0.25, height * 0.90, width * 0.75, height, Math.min(4, height * 0.04));
      return board || post || foot;
    }
    if (type === "barrier") {
      const board = roundedRectContains(localX, localY, width * 0.08, height * 0.24, width * 0.92, height * 0.90, Math.min(7, height * 0.10));
      const base = roundedRectContains(localX, localY, 0, height * 0.87, width, height, Math.min(6, height * 0.08));
      return board || base;
    }
    if (DOUBLE_JUMP_TYPES.has(type)) {
      return roundedRectContains(localX, localY, 0, 0, width, height, Math.min(8, width * 0.12));
    }
    const radius = type === "bollard" || type === "bin"
      ? Math.min(11, width * 0.42)
      : type === "planter"
        ? Math.min(9, width * 0.18)
        : Math.min(7, height * 0.30);
    return roundedRectContains(localX, localY, 0, 0, width, height, radius);
  }

  function pixelsOverlap(obstacleElement, type) {
    function sceneLocalRect(element) {
      const transformValue = getComputedStyle(element).transform;
      const matrix = transformValue && transformValue !== "none"
        ? new DOMMatrixReadOnly(transformValue)
        : new DOMMatrixReadOnly();
      return {
        left: element.offsetLeft + matrix.e,
        top: element.offsetTop + matrix.f,
        width: element.offsetWidth,
        height: element.offsetHeight,
        right: element.offsetLeft + matrix.e + element.offsetWidth,
        bottom: element.offsetTop + matrix.f + element.offsetHeight,
      };
    }

    const characterRect = sceneLocalRect(character);
    const obstacleRect = sceneLocalRect(obstacleElement);
    const left = Math.max(characterRect.left, obstacleRect.left);
    const right = Math.min(characterRect.right, obstacleRect.right);
    const top = Math.max(characterRect.top, obstacleRect.top);
    const bottom = Math.min(characterRect.bottom, obstacleRect.bottom);
    if (left >= right || top >= bottom) return false;

    const mask = window.getCheonhoCharacterPixelMask?.();
    if (!mask?.data?.length || !mask.width || !mask.height) return false;
    const startX = Math.floor(left);
    const endX = Math.ceil(right);
    const startY = Math.floor(top);
    const endY = Math.ceil(bottom);

    for (let screenY = startY; screenY < endY; screenY += 1) {
      const characterY = Math.min(mask.height - 1, Math.max(0,
        mask.height - 1 - Math.floor(((screenY + 0.5 - characterRect.top) / characterRect.height) * mask.height)
      ));
      const obstacleY = screenY + 0.5 - obstacleRect.top;
      for (let screenX = startX; screenX < endX; screenX += 1) {
        const obstacleX = screenX + 0.5 - obstacleRect.left;
        if (!obstaclePixelIsOpaque(type, obstacleX, obstacleY, obstacleRect.width, obstacleRect.height)) continue;
        const characterXPixel = Math.min(mask.width - 1, Math.max(0,
          Math.floor(((screenX + 0.5 - characterRect.left) / characterRect.width) * mask.width)
        ));
        const alpha = mask.data[(characterY * mask.width + characterXPixel) * 4 + 3];
        if (alpha >= 96) return true;
      }
    }
    return false;
  }

  async function saveBestScore(score) {
    if (!currentUser || !Number.isFinite(score)) return;
    const uid = currentUser.uid;
    const scoreRef = doc(db, "gameScores", uid);
    const leaderboardRef = doc(db, "gameLeaderboard", uid);
    try {
      await runTransaction(db, async (transaction) => {
        const existing = await transaction.get(scoreRef);
        const previousBest = existing.exists() ? Number(existing.data().bestLaps || 0) : 0;
        if (score <= previousBest) return;
        const bestLaps = Number(score.toFixed(4));
        transaction.set(scoreRef, {
          uid,
          email: currentUser.email || "",
          name: emailToName(currentUser.email || "") || "동기",
          bestLaps,
          updatedAt: serverTimestamp(),
        });
        transaction.set(leaderboardRef, { bestLaps, updatedAt: serverTimestamp() });
      });
      if (currentUser.email !== ADMIN_EMAIL) await refreshMyRank();
    } catch (error) {
      if (rankingStatus) rankingStatus.textContent = "기록 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.";
      console.error("Cheonhoji score save failed", error);
    }
  }

  function finishGame(obstacle) {
    if (gameOver) return;
    gameOver = true;
    gameOverAt = performance.now();
    scene.dataset.gameOver = "true";
    scene.dispatchEvent(new CustomEvent("cheonho:setrunning", { detail: { running: false } }));
    movement.left = false;
    movement.right = false;
    scene.classList.add("has-collision");
    obstacle?.element.classList.add("is-hit");
    if (obstacle?.element && !obstacle.element.querySelector(".cheonho-impact-mark")) {
      obstacle.element.insertAdjacentHTML("beforeend", '<span class="cheonho-impact-mark">!</span>');
    }
    moveButtons.forEach((button) => button.classList.remove("is-pressed"));
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const score = currentLaps();
    const names = {
      puddle: "물웅덩이",
      rock: "호숫가 돌",
      curb: "낮은 돌턱",
      bottle: "산책로 물병",
      cooler: "피크닉 아이스박스",
      planter: "작은 화분",
      basket: "피크닉 바구니",
      bollard: "안전 볼라드",
      chair: "접이식 의자",
      cone: "안전콘",
      bin: "산책로 쓰레기통",
      sign: "호수 안내 표지판",
      scooter: "주차된 킥보드",
      lifebuoy: "구명환 거치대",
      barrier: "높은 차단판",
      leaves: "낙엽 더미",
      stump: "나무 그루터기",
      sandbag: "모래주머니",
      flowerpot: "꽃 화분",
      backpack: "놓인 배낭",
      umbrella: "접힌 우산",
      picnicmat: "접힌 돗자리",
      lantern: "산책로 랜턴",
      hydrant: "소화전",
      bench: "이동식 벤치",
      cart: "관리용 손수레",
      fence: "높은 안전 펜스",
      gate: "산책로 통제문",
      kiosk: "안내 키오스크",
      bike: "세워 둔 자전거",
      tire: "굴러온 타이어",
      bucket: "청소용 양동이",
      crate: "나무 상자",
      flowerbox: "긴 꽃 상자",
      camera: "놓인 카메라",
      tripod: "카메라 삼각대",
      ducktoy: "오리 장난감",
      rainboot: "장화",
      skateboard: "스케이트보드",
      mapboard: "대형 호수 안내판",
    };
    if (crashReasonElement) crashReasonElement.textContent = `${names[obstacle?.type] || "장애물"}에 부딪혔어요.`;
    if (finalScoreElement) finalScoreElement.textContent = formattedLaps(score);
    if (gameOverElement) gameOverElement.hidden = false;
    saveBestScore(score);
  }

  function restartGame() {
    clearObstacles();
    elapsedSeconds = 0;
    distanceLaps = 0;
    nextSpawnIn = 3.4;
    lastObstacleType = "";
    regularObstacleBag = [];
    doubleObstacleBag = [];
    obstacleCategoryBag = [];
    consecutiveDoubleJumps = 0;
    obstacleTier = -1;
    obstacleRateTier = -1;
    gameOver = false;
    scene.dataset.gameOver = "false";
    scene.classList.remove("has-jumped", "is-jumping");
    scene.classList.remove("has-collision");
    setCharacterX(initialCharacterX());
    renderScore();
    if (gameOverElement) gameOverElement.hidden = true;
    resetTrackAnimation();
    setBackgroundSpeed(1);
    scene.dispatchEvent(new CustomEvent("cheonho:setrunning", { detail: { running: true } }));
  }

  function updateGame(delta) {
    const laps = currentLaps();
    const speedMultiplier = difficultyFor(laps);
    elapsedSeconds += delta;
    distanceLaps += (delta / baseLapDuration) * speedMultiplier;
    setBackgroundSpeed(speedMultiplier);
    renderScore();

    const sceneWidth = Math.max(scene.clientWidth, 1);
    const obstaclePercentPerSecond = (sceneWidth * 0.095 * speedMultiplier / sceneWidth) * 100;
    const characterPercentPerSecond = (sceneWidth * 0.08 / sceneWidth) * 100;
    if (movement.left !== movement.right) {
      setCharacterX(characterX + (movement.right ? 1 : -1) * characterPercentPerSecond * delta);
    }

    nextSpawnIn -= delta;
    if (nextSpawnIn <= 0) {
      spawnObstacle();
      scheduleNextSpawn(laps);
    }

    for (let index = obstacles.length - 1; index >= 0; index -= 1) {
      const obstacle = obstacles[index];
      sizeObstacle(obstacle);
      obstacle.x -= obstaclePercentPerSecond * delta;
      obstacle.element.style.setProperty("--obstacle-x", `${obstacle.x}%`);
      if (obstacle.x < -10) {
        obstacle.element.remove();
        obstacles.splice(index, 1);
      } else if (pixelsOverlap(obstacle.element, obstacle.type)) {
        finishGame(obstacle);
        break;
      }
    }
  }

  function updateWalking(delta) {
    elapsedSeconds += delta;
    distanceLaps += delta / baseLapDuration;
    setBackgroundSpeed(1);
    renderScore();
    const characterPercentPerSecond = 8;
    if (movement.left !== movement.right) {
      setCharacterX(characterX + (movement.right ? 1 : -1) * characterPercentPerSecond * delta);
    }
  }

  function frame(time) {
    const delta = lastFrame ? Math.min((time - lastFrame) / 1000, 0.05) : 0;
    lastFrame = time;
    if (running && !gameOver && delta > 0) {
      if (gameMode === "walk") updateWalking(delta);
      else updateGame(delta);
    }
    requestAnimationFrame(frame);
  }

  function setMovement(direction, active, button = null) {
    movement[direction] = active;
    if (button) button.classList.toggle("is-pressed", active);
  }

  function containMoveControlEvent(event) {
    if (event?.cancelable) event.preventDefault();
    event?.stopPropagation();
  }

  moveButtons.forEach((button) => {
    const direction = button.dataset.cheonhoMove;
    const stop = (event) => {
      containMoveControlEvent(event);
      setMovement(direction, false, button);
    };
    button.addEventListener("pointerdown", (event) => {
      containMoveControlEvent(event);
      setMovement(direction, true, button);
      try { button.setPointerCapture(event.pointerId); } catch (error) { /* Optional. */ }
    });
    button.addEventListener("pointerup", stop);
    button.addEventListener("pointercancel", stop);
    button.addEventListener("lostpointercapture", stop);
    button.addEventListener("touchstart", (event) => {
      containMoveControlEvent(event);
      setMovement(direction, true, button);
    }, { passive: false });
    button.addEventListener("touchend", (event) => {
      containMoveControlEvent(event);
      stop();
    }, { passive: false });
    button.addEventListener("touchcancel", stop, { passive: false });
    button.addEventListener("touchmove", containMoveControlEvent, { passive: false });
    button.addEventListener("click", containMoveControlEvent);
    button.addEventListener("dblclick", containMoveControlEvent);
    button.addEventListener("contextmenu", (event) => event.preventDefault());
    button.addEventListener("selectstart", (event) => event.preventDefault());
    button.addEventListener("dragstart", (event) => event.preventDefault());
  });
  scene.addEventListener("selectstart", (event) => event.preventDefault());
  scene.addEventListener("dragstart", (event) => event.preventDefault());

  window.addEventListener("keydown", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
    const isLeft = event.code === "ArrowLeft" || event.code === "KeyA";
    const isRight = event.code === "ArrowRight" || event.code === "KeyD";
    if ((!isLeft && !isRight) || gameOver) return;
    if (!running) scene.dispatchEvent(new CustomEvent("cheonho:setrunning", { detail: { running: true } }));
    if (isLeft) {
      movement.left = true;
      event.preventDefault();
    }
    if (isRight) {
      movement.right = true;
      event.preventDefault();
    }
  });
  window.addEventListener("keyup", (event) => {
    if (event.code === "ArrowLeft" || event.code === "KeyA") movement.left = false;
    if (event.code === "ArrowRight" || event.code === "KeyD") movement.right = false;
  });
  window.addEventListener("blur", () => {
    movement.left = false;
    movement.right = false;
  });

  scene.addEventListener("cheonho:runningchange", (event) => {
    running = Boolean(event.detail?.running) && !gameOver;
  });
  scene.addEventListener("cheonho:modechange", (event) => {
    gameMode = event.detail?.mode === "walk" ? "walk" : "run";
    clearObstacles();
    elapsedSeconds = 0;
    distanceLaps = 0;
    nextSpawnIn = 3.4;
    lastObstacleType = "";
    regularObstacleBag = [];
    doubleObstacleBag = [];
    obstacleCategoryBag = [];
    consecutiveDoubleJumps = 0;
    obstacleTier = -1;
    obstacleRateTier = -1;
    gameOver = false;
    scene.dataset.gameOver = "false";
    scene.classList.remove("has-collision", "has-jumped", "is-jumping");
    if (gameOverElement) gameOverElement.hidden = true;
    setCharacterX(initialCharacterX());
    renderScore();
    resetTrackAnimation();
    setBackgroundSpeed(1);
  });
  scene.addEventListener("cheonho:restart", restartGame);
  scene.addEventListener("cheonho:characterchange", () => setCharacterX(initialCharacterX()));
  scene.addEventListener("cheonho:layoutchange", () => {
    if (elapsedSeconds < 0.5) setCharacterX(initialCharacterX());
  });
  retryButton?.addEventListener("click", (event) => {
    if (performance.now() - gameOverAt < 650) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    restartGame();
  });

  async function refreshMyRank() {
    if (!currentUser) return;
    try {
      const ownSnapshot = await getDoc(doc(db, "gameScores", currentUser.uid));
      const ownBest = ownSnapshot.exists() ? Number(ownSnapshot.data().bestLaps || 0) : 0;
      if (!ownBest) {
        if (myRankElement) myRankElement.textContent = "기록 없음";
        return;
      }
      const higherScores = await getCountFromServer(query(
        collection(db, "gameLeaderboard"),
        where("bestLaps", ">", ownBest)
      ));
      if (myRankElement) myRankElement.textContent = `${higherScores.data().count + 1}위`;
    } catch (error) {
      if (myRankElement) myRankElement.textContent = "불러오기 실패";
    }
  }

  function subscribeRankings(user) {
    if (unsubscribeRanking) unsubscribeRanking();
    const isAdmin = user.email === ADMIN_EMAIL;
    if (rankingStatus) rankingStatus.textContent = "최고 기록은 계정별로 저장됩니다.";

    if (isAdmin) {
      if (rankingSummary) rankingSummary.hidden = true;
      if (adminRanking) adminRanking.hidden = false;
      unsubscribeRanking = onSnapshot(
        query(collection(db, "gameScores"), orderBy("bestLaps", "desc")),
        (snapshot) => {
          if (!adminRanking) return;
          if (snapshot.empty) {
            adminRanking.innerHTML = '<p class="cheonho-ranking-empty">아직 저장된 기록이 없습니다.</p>';
            return;
          }
          adminRanking.innerHTML = snapshot.docs.map((entry, index) => {
            const data = entry.data();
            const name = String(data.name || emailToName(data.email || "") || "동기").replace(/[<>&"']/g, "");
            return `<div class="cheonho-ranking-row"><span>${index + 1}위</span><strong>${name}</strong><b>${formattedLaps(Number(data.bestLaps || 0))}바퀴</b></div>`;
          }).join("");
        },
        () => {
          if (rankingStatus) rankingStatus.textContent = "기록 저장 규칙을 확인해 주세요.";
          if (adminRanking) adminRanking.innerHTML = '<p class="cheonho-ranking-empty">랭킹을 불러오지 못했습니다.</p>';
        }
      );
    } else {
      if (rankingSummary) rankingSummary.hidden = false;
      if (adminRanking) adminRanking.hidden = true;
      const unsubscribers = [];
      unsubscribers.push(onSnapshot(
        doc(db, "gameScores", user.uid),
        (snapshot) => {
          const best = snapshot.exists() ? Number(snapshot.data().bestLaps || 0) : 0;
          if (myBestElement) myBestElement.textContent = best ? `${formattedLaps(best)}바퀴` : "기록 없음";
          refreshMyRank();
        },
        () => {
          if (rankingStatus) rankingStatus.textContent = "기록 저장 기능을 불러오지 못했습니다.";
          if (myBestElement) myBestElement.textContent = "불러오기 실패";
          if (myRankElement) myRankElement.textContent = "불러오기 실패";
        }
      ));
      unsubscribers.push(onSnapshot(
        query(collection(db, "gameLeaderboard"), orderBy("bestLaps", "desc"), limit(1)),
        (snapshot) => {
          const best = snapshot.empty ? 0 : Number(snapshot.docs[0].data().bestLaps || 0);
          if (topScoreElement) topScoreElement.textContent = best ? `${formattedLaps(best)}바퀴` : "기록 없음";
        },
        () => {
          if (rankingStatus) rankingStatus.textContent = "전체 최고 기록을 불러오지 못했습니다.";
          if (topScoreElement) topScoreElement.textContent = "불러오기 실패";
        }
      ));
      unsubscribeRanking = () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    }
  }

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (!user) {
      if (rankingStatus) rankingStatus.textContent = "로그인하면 최고 기록이 계정에 저장됩니다.";
      return;
    }
    subscribeRankings(user);
  });

  renderScore();
  setCharacterX(initialCharacterX());
  requestAnimationFrame(frame);
}
