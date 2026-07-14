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

  /* ===== 게임 2: 이름 원판 룰렛 (직접 입력) ===== */
  const wheelInput = document.querySelector("#wheelNames");
  const wheelGroup = document.querySelector("#wheelGroup");
  const wheelSpin = document.querySelector("#wheelSpin");
  const wheelResult = document.querySelector("#wheelResult");
  if (wheelGroup) {
    const PALETTE = ["#00205b", "#0057b8", "#2bb673", "#c8a24b", "#e2574c", "#14b8c4", "#6c5ce7", "#e17055", "#0984e3", "#00b894"];
    let wheelList = [];
    let wheelRot = 0;
    let wheelSpinning = false;

    const parseNames = (t) => t.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    const trunc = (s) => (s.length > 6 ? s.slice(0, 6) + "…" : s);

    function drawWheel(list) {
      const n = list.length, cx = 160, cy = 160, R = 150;
      if (n === 0) {
        wheelGroup.innerHTML = `<circle cx="160" cy="160" r="150" fill="#eef1f6"/>` +
          `<text x="160" y="166" text-anchor="middle" fill="#8a94a6" font-size="15">이름을 적어주세요</text>`;
        return;
      }
      if (n === 1) {
        wheelGroup.innerHTML = `<circle cx="160" cy="160" r="150" fill="${PALETTE[0]}"/>` +
          `<text x="160" y="168" text-anchor="middle" fill="#fff" font-size="18" font-weight="700">${esc(trunc(list[0]))}</text>`;
        return;
      }
      const a = 360 / n;
      let s = "";
      for (let i = 0; i < n; i++) {
        const st = (i * a - 90) * Math.PI / 180, en = ((i + 1) * a - 90) * Math.PI / 180;
        const x1 = cx + R * Math.cos(st), y1 = cy + R * Math.sin(st);
        const x2 = cx + R * Math.cos(en), y2 = cy + R * Math.sin(en);
        const large = a > 180 ? 1 : 0;
        s += `<path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${PALETTE[i % PALETTE.length]}" stroke="#fff" stroke-width="1"/>`;
        const mid = i * a + a / 2 - 90;
        const lr = R * 0.64;
        const lx = cx + lr * Math.cos(mid * Math.PI / 180), ly = cy + lr * Math.sin(mid * Math.PI / 180);
        const fs = n > 18 ? 9 : n > 12 ? 11 : 13;
        s += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="#fff" font-size="${fs}" font-weight="700" text-anchor="middle" dominant-baseline="middle" transform="rotate(${(mid + 90).toFixed(1)},${lx.toFixed(1)},${ly.toFixed(1)})">${esc(trunc(list[i]))}</text>`;
      }
      wheelGroup.innerHTML = s;
    }

    wheelInput.addEventListener("input", () => { wheelList = parseNames(wheelInput.value); drawWheel(wheelList); });

    wheelSpin.addEventListener("click", () => {
      if (wheelSpinning) return;
      wheelList = parseNames(wheelInput.value);
      if (wheelList.length < 2) { wheelResult.textContent = "이름을 2개 이상 적어주세요!"; return; }
      drawWheel(wheelList);
      wheelSpinning = true; wheelSpin.disabled = true; wheelResult.textContent = "";
      const n = wheelList.length, a = 360 / n;
      const w = Math.floor(Math.random() * n);
      const jitter = (Math.random() * 2 - 1) * (a * 0.32);
      const desiredMod = ((-(w + 0.5) * a) % 360 + 360) % 360;
      const currentMod = ((wheelRot % 360) + 360) % 360;
      const delta = ((desiredMod - currentMod) % 360 + 360) % 360 + 360 * 6 + jitter;
      wheelRot += delta;
      wheelGroup.style.transition = "transform 5s cubic-bezier(.08,.85,.18,1)";
      wheelGroup.style.transform = `rotate(${wheelRot}deg)`;
      const done = () => {
        wheelGroup.removeEventListener("transitionend", done);
        wheelResult.innerHTML = `🎉 당첨: <strong>${esc(wheelList[w])}</strong> 🎉`;
        wheelSpinning = false; wheelSpin.disabled = false;
      };
      wheelGroup.addEventListener("transitionend", done);
    });

    drawWheel(wheelList);
  }
});
