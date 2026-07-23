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
  let characterX = 11;
  let lastFrame = 0;
  let nextSpawnIn = 3.4;
  let currentUser = null;
  let lastObstacleType = "";
  let unsubscribeRanking = null;
  let gameOverAt = 0;

  function animationDurationSeconds() {
    const raw = getComputedStyle(track).animationDuration.split(",")[0].trim();
    const value = Number.parseFloat(raw) || 120;
    return raw.endsWith("ms") ? value / 1000 : value;
  }

  function currentLaps() {
    return elapsedSeconds / Math.max(animationDurationSeconds(), 1);
  }

  function formattedLaps(value = currentLaps()) {
    return Math.max(0, value).toFixed(2);
  }

  function renderScore() {
    scoreElement.textContent = formattedLaps();
  }

  function difficultyFor(laps) {
    if (laps < 1) return 1;
    return Math.min(2.15, 1 + Math.floor((laps - 1) * 2 + 1) * 0.12);
  }

  function resetTrackAnimation() {
    track.style.animation = "none";
    void track.offsetWidth;
    track.style.animation = "";
  }

  function clearObstacles() {
    obstacles.splice(0).forEach((obstacle) => obstacle.element.remove());
  }

  function obstacleTypeForProgress(laps) {
    const choices = laps < 0.25
      ? ["puddle", "rock", "curb"]
      : laps < 0.65
        ? ["puddle", "rock", "curb", "planter", "basket", "bollard"]
        : laps < 1
          ? ["puddle", "rock", "curb", "planter", "basket", "bollard", "cone", "bin", "sign"]
          : ["puddle", "rock", "curb", "planter", "basket", "bollard", "cone", "bin", "sign", "barrier"];
    let type = choices[Math.floor(Math.random() * choices.length)];
    const tallTypes = new Set(["bin", "sign", "barrier"]);
    if (type === lastObstacleType || (tallTypes.has(type) && tallTypes.has(lastObstacleType))) {
      type = laps < 0.25 ? "puddle" : "rock";
    }
    lastObstacleType = type;
    return type;
  }

  function sizeObstacle(obstacle) {
    const turtle = scene.dataset.character === "turtle";
    const mobileTurtle = turtle && window.matchMedia("(pointer: coarse)").matches;
    const characterWidth = character.offsetWidth;
    const characterHeight = character.offsetHeight;
    const visibleCharacterWidth = characterWidth * (turtle ? 0.72 : 0.68);
    const ratios = {
      puddle: { width: 1.02, height: 0.10 },
      rock: { width: 0.64, height: 0.19 },
      curb: { width: 0.90, height: 0.16 },
      planter: { width: 0.55, height: 0.34 },
      basket: { width: 0.68, height: 0.34 },
      bollard: { width: 0.32, height: 0.48 },
      cone: { width: 0.40, height: 0.50 },
      bin: { width: 0.48, height: 0.66 },
      sign: { width: 0.58, height: 0.72 },
      barrier: { width: 0.52, height: 0.82 },
    };
    const ratio = ratios[obstacle.type] || ratios.curb;
    const widthScale = mobileTurtle ? 0.90 : 1;
    const heightScale = mobileTurtle ? 0.90 : 1;
    obstacle.element.style.setProperty("--obstacle-w", `${Math.max(12, visibleCharacterWidth * ratio.width * widthScale)}px`);
    obstacle.element.style.setProperty("--obstacle-h", `${Math.max(8, characterHeight * ratio.height * heightScale)}px`);
  }

  function spawnObstacle() {
    const type = obstacleTypeForProgress(currentLaps());
    const element = document.createElement("div");
    element.className = `cheonho-obstacle cheonho-obstacle-${type}`;
    element.dataset.obstacleType = type;
    if (type === "barrier") {
      element.insertAdjacentHTML("beforeend", '<span class="cheonho-double-jump-label">2× JUMP</span>');
    }
    obstacleLayer.appendChild(element);
    const obstacle = { element, x: 108, type };
    sizeObstacle(obstacle);
    obstacles.push(obstacle);
  }

  function scheduleNextSpawn(laps) {
    const difficulty = difficultyFor(laps);
    const base = 2.9 + Math.random() * 1.5;
    const recoveryMinimum = lastObstacleType === "barrier" ? 2.25 : 1.42;
    nextSpawnIn = Math.max(recoveryMinimum, base / difficulty);
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

  function obstaclePixelIsOpaque(type, localX, localY, width, height) {
    if (type === "puddle" || type === "rock") {
      const centerX = width / 2;
      const centerY = height / 2;
      const radiusX = Math.max(width / 2, 1);
      const radiusY = Math.max(height / 2, 1);
      const normalizedX = (localX - centerX) / radiusX;
      const normalizedY = (localY - centerY) / radiusY;
      return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
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
      planter: "작은 화분",
      basket: "피크닉 바구니",
      bollard: "안전 볼라드",
      cone: "안전콘",
      bin: "산책로 쓰레기통",
      sign: "호수 안내 표지판",
      barrier: "높은 차단판",
    };
    if (crashReasonElement) crashReasonElement.textContent = `${names[obstacle?.type] || "장애물"}에 부딪혔어요.`;
    if (finalScoreElement) finalScoreElement.textContent = formattedLaps(score);
    if (gameOverElement) gameOverElement.hidden = false;
    saveBestScore(score);
  }

  function restartGame() {
    clearObstacles();
    elapsedSeconds = 0;
    nextSpawnIn = 3.4;
    lastObstacleType = "";
    gameOver = false;
    scene.dataset.gameOver = "false";
    scene.classList.remove("has-jumped", "is-jumping");
    scene.classList.remove("has-collision");
    setCharacterX(initialCharacterX());
    renderScore();
    if (gameOverElement) gameOverElement.hidden = true;
    resetTrackAnimation();
    scene.dispatchEvent(new CustomEvent("cheonho:setrunning", { detail: { running: true } }));
  }

  function updateGame(delta) {
    const laps = currentLaps();
    elapsedSeconds += delta;
    renderScore();

    const sceneWidth = Math.max(scene.clientWidth, 1);
    const obstaclePercentPerSecond = (sceneWidth * 0.095 * difficultyFor(laps) / sceneWidth) * 100;
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
    if (!running || event.target.closest("input, textarea, select, button")) return;
    if (event.code === "ArrowLeft" || event.code === "KeyA") {
      movement.left = true;
      event.preventDefault();
    }
    if (event.code === "ArrowRight" || event.code === "KeyD") {
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
    nextSpawnIn = 3.4;
    gameOver = false;
    scene.dataset.gameOver = "false";
    scene.classList.remove("has-collision", "has-jumped", "is-jumping");
    if (gameOverElement) gameOverElement.hidden = true;
    setCharacterX(initialCharacterX());
    renderScore();
    resetTrackAnimation();
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
