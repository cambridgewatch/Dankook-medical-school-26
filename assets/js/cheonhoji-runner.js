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
    const choices = laps < 0.3
      ? ["curb", "planter", "bollard"]
      : ["curb", "planter", "bollard", "barrier"];
    let type = choices[Math.floor(Math.random() * choices.length)];
    if (type === "barrier" && lastObstacleType === "barrier") type = "curb";
    lastObstacleType = type;
    return type;
  }

  function sizeObstacle(obstacle) {
    const characterRect = character.getBoundingClientRect();
    const visibleCharacterWidth = characterRect.width * (scene.dataset.character === "turtle" ? 0.72 : 0.68);
    const ratios = {
      curb: { width: 0.90, height: 0.16 },
      planter: { width: 0.55, height: 0.34 },
      bollard: { width: 0.32, height: 0.48 },
      barrier: { width: 0.75, height: 0.95 },
    };
    const ratio = ratios[obstacle.type] || ratios.curb;
    obstacle.element.style.setProperty("--obstacle-w", `${Math.max(12, visibleCharacterWidth * ratio.width)}px`);
    obstacle.element.style.setProperty("--obstacle-h", `${Math.max(8, characterRect.height * ratio.height)}px`);
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
    nextSpawnIn = Math.max(1.42, base / difficulty);
  }

  function setCharacterX(value) {
    const sceneWidth = Math.max(scene.clientWidth, 1);
    const visibleWidthRatio = scene.dataset.character === "turtle" ? 0.72 : 0.68;
    const characterHalfWidth = Math.min(
      45,
      (character.getBoundingClientRect().width * visibleWidthRatio / sceneWidth) * 50
    );
    const edgePadding = 0.75;
    const minimumX = characterHalfWidth + edgePadding;
    const maximumX = 100 - characterHalfWidth - edgePadding;
    characterX = Math.max(minimumX, Math.min(maximumX, value));
    character.style.left = `${characterX}%`;
  }

  function hitboxesOverlap(obstacleElement, type) {
    const characterRect = character.getBoundingClientRect();
    const obstacleRect = obstacleElement.getBoundingClientRect();
    const turtle = scene.dataset.character === "turtle";
    const characterInsetX = turtle ? 0.28 : 0.34;
    const horizontalOverlap =
      characterRect.left + characterRect.width * characterInsetX < obstacleRect.right &&
      characterRect.right - characterRect.width * characterInsetX > obstacleRect.left;
    if (!horizontalOverlap) return false;

    // 캔버스의 투명 여백이 아니라 캐릭터의 실제 발 위치로 판정한다.
    // 낮은 장애물은 일반 점프 한 번으로, 높은 차단막만 더블 점프로 넘을 수 있다.
    const feetY = characterRect.bottom - characterRect.height * (turtle ? 0.20 : 0.14);
    return feetY > obstacleRect.top;
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
    const score = currentLaps();
    const names = { curb: "낮은 돌턱", planter: "작은 화분", bollard: "안전 볼라드", barrier: "높은 차단판" };
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
    setCharacterX(11);
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
      } else if (hitboxesOverlap(obstacle.element, obstacle.type)) {
        finishGame(obstacle);
        break;
      }
    }
  }

  function updateWalking(delta) {
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

  moveButtons.forEach((button) => {
    const direction = button.dataset.cheonhoMove;
    const stop = () => setMovement(direction, false, button);
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      setMovement(direction, true, button);
      try { button.setPointerCapture(event.pointerId); } catch (error) { /* Optional. */ }
    });
    button.addEventListener("pointerup", stop);
    button.addEventListener("pointercancel", stop);
    button.addEventListener("lostpointercapture", stop);
    button.addEventListener("touchstart", (event) => {
      event.preventDefault();
      setMovement(direction, true, button);
    }, { passive: false });
    button.addEventListener("touchend", (event) => {
      event.preventDefault();
      stop();
    }, { passive: false });
    button.addEventListener("touchcancel", stop, { passive: false });
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
    setCharacterX(11);
    renderScore();
    resetTrackAnimation();
  });
  scene.addEventListener("cheonho:restart", restartGame);
  retryButton?.addEventListener("click", restartGame);

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
  setCharacterX(11);
  requestAnimationFrame(frame);
}
