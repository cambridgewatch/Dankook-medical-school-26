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
      renderReel(shuffle(names)); // 시작 전에도 전체 한 번 섞어서 표시
    } catch (e) {
      infoEl.textContent = "명단을 불러오지 못했어요: " + e.message;
    }
  });

  /* 피셔-예이츠 셔플 */
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  /* 전체 인원을 섞은 묶음을 반복해 길이를 채움 */
  function buildReel(len) {
    const r = [];
    while (r.length < len) r.push(...shuffle(names));
    return r.slice(0, len);
  }
  function renderReel(reel) {
    track.innerHTML = reel.map((n) => `<div class="roulette-card">${esc(n)}</div>`).join("");
  }

  spinBtn.addEventListener("click", () => {
    if (spinning || !names.length) return;
    spinning = true;
    spinBtn.disabled = true;
    resultEl.textContent = "";
    infoEl.textContent = "🎲 두구두구두구…";

    const winner = names[Math.floor(Math.random() * names.length)];
    const reel = buildReel(WIN_IDX + 8); // 전체 인원 셔플로 채움
    reel[WIN_IDX] = winner;
    renderReel(reel);

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

  /* ===== 게임 3: 사다리타기 ===== */
  const ladderCount = document.querySelector("#ladderCount");
  const ladderSetup = document.querySelector("#ladderSetup");
  const ladderInputs = document.querySelector("#ladderInputs");
  const ladderCreate = document.querySelector("#ladderCreate");
  const ladderSvg = document.querySelector("#ladderSvg");
  const ladderStage = document.querySelector("#ladderStage");
  const ladderPlayer = document.querySelector("#ladderPlayer");
  const ladderRun = document.querySelector("#ladderRun");
  const ladderResult = document.querySelector("#ladderResult");

  if (ladderInputs && ladderSvg) {
    let ladderNames = [];
    let ladderResults = [];
    let ladderBridges = [];
    let ladderBoard = null;

    const clampCount = () => Math.max(2, Math.min(20, Number(ladderCount.value) || 2));
    const ladderLabel = (value) => value.length > 7 ? value.slice(0, 7) + "…" : value;

    function makeLadderInputs() {
      const count = clampCount();
      ladderCount.value = count;
      const oldNames = [...ladderInputs.querySelectorAll(".ladder-name")].map((el) => el.value);
      const oldResults = [...ladderInputs.querySelectorAll(".ladder-dest")].map((el) => el.value);
      const minWidth = Math.max(520, count * 112);
      ladderInputs.style.minWidth = `${minWidth}px`;
      ladderInputs.innerHTML = `
        <div class="ladder-input-label">참가자</div>
        <div class="ladder-input-row" style="grid-template-columns:repeat(${count},minmax(96px,1fr))">
          ${Array.from({ length: count }, (_, i) => `<input class="ladder-name" maxlength="12" value="${esc(oldNames[i] || `참가자 ${i + 1}`)}" aria-label="${i + 1}번 참가자" />`).join("")}
        </div>
        <div class="ladder-input-label result-label">도착 결과</div>
        <div class="ladder-input-row" style="grid-template-columns:repeat(${count},minmax(96px,1fr))">
          ${Array.from({ length: count }, (_, i) => `<input class="ladder-dest" maxlength="16" value="${esc(oldResults[i] || `결과 ${i + 1}`)}" aria-label="${i + 1}번 결과" />`).join("")}
        </div>`;
      ladderResult.textContent = "";
      ladderSvg.innerHTML = `<text x="50%" y="50%" text-anchor="middle" fill="#8a94a6" font-size="15">입력 후 사다리 만들기를 눌러주세요</text>`;
      ladderSvg.setAttribute("viewBox", "0 0 600 240");
      ladderStage.style.width = `${minWidth}px`;
      ladderBoard = null;
    }

    function readLadderValues() {
      ladderNames = [...ladderInputs.querySelectorAll(".ladder-name")]
        .map((el, i) => el.value.trim() || `참가자 ${i + 1}`);
      ladderResults = [...ladderInputs.querySelectorAll(".ladder-dest")]
        .map((el, i) => el.value.trim() || `결과 ${i + 1}`);
    }

    function generateBridges(count, levels) {
      let rows;
      do {
        rows = [];
        for (let level = 0; level < levels; level++) {
          const row = new Set();
          for (let col = 0; col < count - 1; col++) {
            if (!row.has(col - 1) && Math.random() < 0.38) {
              row.add(col);
              col++;
            }
          }
          rows.push(row);
        }
      } while (rows.reduce((sum, row) => sum + row.size, 0) < count - 1);
      return rows;
    }

    function drawLadder() {
      readLadderValues();
      const count = ladderNames.length;
      const spacing = 104;
      const side = 58;
      const width = side * 2 + (count - 1) * spacing;
      const height = 490;
      const topY = 62;
      const bottomY = 408;
      const levels = Math.max(12, Math.min(20, count + 8));
      ladderBridges = generateBridges(count, levels);
      const x = (i) => side + i * spacing;
      const y = (i) => topY + ((i + 1) * (bottomY - topY)) / (levels + 1);
      let html = `<rect width="100%" height="100%" rx="18" fill="#fbfcff"/>`;

      for (let i = 0; i < count; i++) {
        html += `<line x1="${x(i)}" y1="${topY}" x2="${x(i)}" y2="${bottomY}" class="ladder-line"/>`;
        html += `<text x="${x(i)}" y="28" class="ladder-name-text">${esc(ladderLabel(ladderNames[i]))}</text>`;
        html += `<text x="${x(i)}" y="449" class="ladder-result-text">${esc(ladderLabel(ladderResults[i]))}</text>`;
        html += `<circle cx="${x(i)}" cy="${topY}" r="5" class="ladder-node"/>`;
        html += `<circle cx="${x(i)}" cy="${bottomY}" r="5" class="ladder-node bottom"/>`;
      }
      ladderBridges.forEach((row, level) => {
        row.forEach((col) => {
          html += `<line x1="${x(col)}" y1="${y(level)}" x2="${x(col + 1)}" y2="${y(level)}" class="ladder-line bridge"/>`;
        });
      });

      ladderSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      ladderSvg.setAttribute("width", width);
      ladderSvg.setAttribute("height", height);
      ladderStage.style.width = `${Math.max(600, width)}px`;
      ladderSvg.innerHTML = html;
      ladderBoard = { count, levels, width, height, topY, bottomY, x, y };
      ladderPlayer.innerHTML = ladderNames.map((name, i) => `<option value="${i}">${esc(name)}</option>`).join("");
      ladderResult.textContent = "참가자를 선택하고 결과 확인을 눌러주세요.";
    }

    function traceLadder(start) {
      if (!ladderBoard) return null;
      const { levels, topY, bottomY, x, y } = ladderBoard;
      let col = start;
      const points = [[x(col), topY]];
      for (let level = 0; level < levels; level++) {
        const rowY = y(level);
        points.push([x(col), rowY]);
        if (ladderBridges[level].has(col)) {
          col++;
          points.push([x(col), rowY]);
        } else if (ladderBridges[level].has(col - 1)) {
          col--;
          points.push([x(col), rowY]);
        }
      }
      points.push([x(col), bottomY]);
      return { end: col, points };
    }

    ladderSetup.addEventListener("click", makeLadderInputs);
    ladderCreate.addEventListener("click", drawLadder);
    ladderRun.addEventListener("click", () => {
      if (!ladderBoard) return ladderResult.textContent = "먼저 사다리를 만들어주세요.";
      const start = Number(ladderPlayer.value);
      const traced = traceLadder(start);
      ladderSvg.querySelectorAll(".ladder-path").forEach((el) => el.remove());
      const pointText = traced.points.map(([px, py]) => `${px},${py}`).join(" ");
      ladderSvg.insertAdjacentHTML("beforeend", `<polyline points="${pointText}" class="ladder-path"/>`);
      ladderResult.innerHTML = `<strong>${esc(ladderNames[start])}</strong> → <strong>${esc(ladderResults[traced.end])}</strong>`;

      const targetX = ladderBoard.x(start) - 80;
      document.querySelector("#ladderScroll").scrollTo({ left: Math.max(0, targetX), behavior: "smooth" });
    });

    makeLadderInputs();
  }
});
