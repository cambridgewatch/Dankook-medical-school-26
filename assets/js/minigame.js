/* 미니게임 - 랜덤 뽑기 룰렛 (minigame.html 전용)
   명단(members) + 정지훈(관리자) = 전체 인원 중 1명을 뽑음. */

import { db, auth, isConfigured, ADMIN_NAME } from "./firebase-init.js?v=11";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

window.addEventListener("DOMContentLoaded", () => {
  const track = document.querySelector("#rouletteTrack");
  const spinBtn = document.querySelector("#spinBtn");
  const resultEl = document.querySelector("#rouletteResult");
  const infoEl = document.querySelector("#rouletteInfo");
  const roulette = document.querySelector("#roulette");
  if (!track) return;

  const CARD_W = 150;       // .roulette-card 너비(px)와 반드시 일치
  const WIN_IDX = 55;       // 당첨 카드가 놓일 위치
  let names = [];
  let spinning = false;

  if (!isConfigured) { infoEl.textContent = "설정이 필요합니다."; return; }

  onAuthStateChanged(auth, async (user) => {
    if (!user || names.length) return;
    try {
      const snap = await getDocs(collection(db, "members"));
      const set = new Set(
        snap.docs.map((d) => (d.data().name || "").trim().normalize("NFC")).filter(Boolean)
      );
      set.add(ADMIN_NAME); // 정지훈(나) 포함
      names = [...set];
      infoEl.textContent = `총 ${names.length}명 참여 · 버튼을 눌러 1명을 뽑아요!`;
      renderReel(randomReel(24), -1);
    } catch (e) {
      infoEl.textContent = "명단을 불러오지 못했어요: " + e.message;
    }
  });

  function randomReel(len) {
    const r = [];
    for (let i = 0; i < len; i++) r.push(names[Math.floor(Math.random() * names.length)]);
    return r;
  }
  function renderReel(reel, winIdx) {
    track.innerHTML = reel
      .map((n, i) => `<div class="roulette-card${i === winIdx ? " win" : ""}">${esc(n)}</div>`)
      .join("");
  }

  spinBtn.addEventListener("click", () => {
    if (spinning || !names.length) return;
    spinning = true;
    spinBtn.disabled = true;
    resultEl.textContent = "";
    infoEl.textContent = "🎲 두구두구두구…";

    const winner = names[Math.floor(Math.random() * names.length)];
    const reel = randomReel(WIN_IDX + 8);
    reel[WIN_IDX] = winner;
    renderReel(reel, WIN_IDX);

    /* 시작 위치로 리셋 */
    track.style.transition = "none";
    track.style.transform = "translateX(0)";
    void track.offsetWidth; // 리플로우 강제

    requestAnimationFrame(() => {
      const center = roulette.offsetWidth / 2;
      const jitter = (Math.random() * 2 - 1) * (CARD_W * 0.28);
      const targetX = -(WIN_IDX * CARD_W + CARD_W / 2 - center) + jitter;
      track.style.transition = "transform 5s cubic-bezier(.08,.85,.18,1)";
      track.style.transform = `translateX(${targetX}px)`;
    });

    const done = () => {
      track.removeEventListener("transitionend", done);
      resultEl.innerHTML = `🎉 당첨: <strong>${esc(winner)}</strong> 🎉`;
      infoEl.textContent = `총 ${names.length}명 참여 · 다시 돌릴 수 있어요!`;
      spinning = false;
      spinBtn.disabled = false;
    };
    track.addEventListener("transitionend", done);
  });

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
});
