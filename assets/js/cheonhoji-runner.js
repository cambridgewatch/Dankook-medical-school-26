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
      ? ["puddle", "branch", "cone"]
      : ["puddle", "branch", "cone", "barrier"];
    let type = choices[Math.floor(Math.random() * choices.length)];
    if (type === "barrier" && lastObstacleType === "barrier") type = "branch";
    lastObstacleType = type;
    return type;
  }

  function spawnObstacle() {
    const type = obstacleTypeForProgress(currentLaps());
    const element = document.createElement("div");
    element.className = `cheonho-obstacle cheonho-obstacle-${type}`;
    element.dataset.obstacleType = type;
    obstacleLayer.appendChild(element);
    obstacles.push({ element, x: 108, type });
  }

  function scheduleNextSpawn(laps) {
    const difficulty = difficultyFor(laps);
    const base = 2.9 + Math.random() * 1.5;
    nextSpawnIn = Math.max(1.42, base / difficulty);
  }

  function setCharacterX(value) {
    characterX = Math.max(6, Math.min(55, value));
    character.style.left = `${characterX}%`;
  }

  function hitboxesOverlap(obstacleElement) {
    const characterRect = character.getBoundingClientRect();
    const obstacleRect = obstacleElement.getBoundingClientRect();
    const turtle = scene.dataset.character === "turtle";
    const characterBox = {
      left: characterRect.left + characterRect.width * (turtle ? 0.20 : 0.27),
      right: characterRect.right - characterRect.width * (turtle ? 0.20 : 0.27),
      top: characterRect.top + characterRect.height * 0.16,
      bottom: characterRect.bottom - characterRect.height * 0.08,
    };
    const obstacleBox = {
      left: obstacleRect.left + obstacleRect.width * 0.12,
      right: obstacleRect.right - obstacleRect.width * 0.12,
      top: obstacleRect.top + obstacleRect.height * 0.08,
      bottom: obstacleRect.bottom,
    };
    return characterBox.left < obstacleBox.right &&
      characterBox.right > obstacleBox.left &&
      characterBox.top < obstacleBox.bottom &&
      characterBox.bottom > obstacleBox.top;
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

  function finishGame() {
    if (gameOver) return;
    gameOver = true;
    scene.dataset.gameOver = "true";
    scene.dispatchEvent(new CustomEvent("cheonho:setrunning", { detail: { running: false } }));
    movement.left = false;
    movement.right = false;
    moveButtons.forEach((button) => button.classList.remove("is-pressed"));
    const score = currentLaps();
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
      obstacle.x -= obstaclePercentPerSecond * delta;
      obstacle.element.style.setProperty("--obstacle-x", `${obstacle.x}%`);
      if (obstacle.x < -10) {
        obstacle.element.remove();
        obstacles.splice(index, 1);
      } else if (hitboxesOverlap(obstacle.element)) {
        finishGame();
        break;
      }
    }
  }

  function frame(time) {
    const delta = lastFrame ? Math.min((time - lastFrame) / 1000, 0.05) : 0;
    lastFrame = time;
    if (running && !gameOver && delta > 0) updateGame(delta);
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
  });

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
      if (myRankElement) myRankElement.textContent = "-";
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
        () => { if (rankingStatus) rankingStatus.textContent = "랭킹을 불러오지 못했습니다."; }
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
        () => { if (rankingStatus) rankingStatus.textContent = "내 기록을 불러오지 못했습니다."; }
      ));
      unsubscribers.push(onSnapshot(
        query(collection(db, "gameLeaderboard"), orderBy("bestLaps", "desc"), limit(1)),
        (snapshot) => {
          const best = snapshot.empty ? 0 : Number(snapshot.docs[0].data().bestLaps || 0);
          if (topScoreElement) topScoreElement.textContent = best ? `${formattedLaps(best)}바퀴` : "기록 없음";
        },
        () => { if (rankingStatus) rankingStatus.textContent = "전체 최고 기록을 불러오지 못했습니다."; }
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
