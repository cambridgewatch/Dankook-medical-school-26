import { auth, db, ADMIN_EMAIL } from "./firebase-init.js?v=12";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, addDoc, deleteDoc, doc, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DAYS = ["월", "화", "수", "목", "금"];
const SLOT_COUNT = 24; // 08:00~20:00, 30분 단위
const $ = (s) => document.querySelector(s);

window.addEventListener("DOMContentLoaded", () => {
  const head = $("#ttHead");
  const grid = $("#ttGrid");
  const status = $("#ttStatus");
  if (!head || !grid) return;

  let user = null;
  let isAdmin = false;
  let globalEntries = [];
  let personalEntries = [];
  let dragging = false;
  let startCell = null;
  let currentCell = null;

  const timeText = (slot) => {
    const minutes = 8 * 60 + slot * 30;
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  };

  head.innerHTML = `<span>시간</span>${DAYS.map((day) => `<span>${day}</span>`).join("")}`;
  let cells = "";
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    cells += `<span class="tt-time" style="grid-row:${slot + 1}">${slot % 2 === 0 ? timeText(slot) : ""}</span>`;
    for (let day = 0; day < DAYS.length; day++) {
      cells += `<div class="tt-cell ${slot % 2 === 0 ? "hour" : ""}" data-day="${day}" data-slot="${slot}" style="grid-column:${day + 2};grid-row:${slot + 1}"></div>`;
    }
  }
  grid.innerHTML = cells;

  function clearSelection() {
    grid.querySelectorAll(".tt-cell.selecting").forEach((cell) => cell.classList.remove("selecting"));
  }

  function drawSelection() {
    clearSelection();
    if (!startCell || !currentCell || startCell.dataset.day !== currentCell.dataset.day) return;
    const day = Number(startCell.dataset.day);
    const from = Math.min(Number(startCell.dataset.slot), Number(currentCell.dataset.slot));
    const to = Math.max(Number(startCell.dataset.slot), Number(currentCell.dataset.slot));
    grid.querySelectorAll(`.tt-cell[data-day="${day}"]`).forEach((cell) => {
      const slot = Number(cell.dataset.slot);
      if (slot >= from && slot <= to) cell.classList.add("selecting");
    });
  }

  grid.querySelectorAll(".tt-cell").forEach((cell) => {
    cell.addEventListener("pointerdown", (event) => {
      if (!user) return;
      if (!$("#ttSubject").value.trim()) {
        status.textContent = "먼저 과목명을 입력해 주세요.";
        $("#ttSubject").focus();
        return;
      }
      event.preventDefault();
      dragging = true;
      startCell = cell;
      currentCell = cell;
      drawSelection();
    });
  });

  window.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    event.preventDefault();
    const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest(".tt-cell");
    if (cell && cell.dataset.day === startCell.dataset.day) {
      currentCell = cell;
      drawSelection();
    }
  }, { passive: false });

  window.addEventListener("pointerup", async () => {
    if (!dragging || !startCell || !currentCell) return;
    dragging = false;
    const day = Number(startCell.dataset.day);
    const startSlot = Math.min(Number(startCell.dataset.slot), Number(currentCell.dataset.slot));
    const endSlot = Math.max(Number(startCell.dataset.slot), Number(currentCell.dataset.slot)) + 1;
    clearSelection();
    const subject = $("#ttSubject").value.trim();
    const color = $("#ttColor").value;
    const scope = isAdmin ? $("#ttScope").value : "personal";
    try {
      const target = scope === "global"
        ? collection(db, "timetableGlobal")
        : collection(db, "timetablePersonal", user.uid, "entries");
      await addDoc(target, { subject, color, day, startSlot, endSlot, createdAt: serverTimestamp() });
      status.textContent = `${DAYS[day]}요일 ${timeText(startSlot)}–${timeText(endSlot)}에 ${subject}을(를) 추가했습니다.`;
    } catch (err) {
      status.textContent = "수업을 추가하지 못했습니다: " + err.message;
    }
    startCell = null;
    currentCell = null;
  });

  function renderEntries() {
    grid.querySelectorAll(".tt-block").forEach((block) => block.remove());
    const entries = [
      ...globalEntries.map((entry) => ({ ...entry, scope: "global" })),
      ...personalEntries.map((entry) => ({ ...entry, scope: "personal" })),
    ];
    entries.forEach((entry) => {
      if (entry.day < 0 || entry.day >= DAYS.length || entry.startSlot < 0 || entry.endSlot > SLOT_COUNT) return;
      const block = document.createElement("div");
      block.className = `tt-block ${entry.scope}`;
      block.style.gridColumn = String(entry.day + 2);
      block.style.gridRow = `${entry.startSlot + 1} / ${entry.endSlot + 1}`;
      block.style.background = entry.color || "#4267a9";
      const canDelete = entry.scope === "personal" || isAdmin;
      block.innerHTML = `<strong>${escapeHtml(entry.subject)}</strong><small>${timeText(entry.startSlot)}–${timeText(entry.endSlot)}</small>${canDelete ? '<button type="button" aria-label="수업 삭제">×</button>' : ""}`;
      block.querySelector("button")?.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (!confirm(`${entry.subject} 수업을 삭제할까요?`)) return;
        try {
          const ref = entry.scope === "global"
            ? doc(db, "timetableGlobal", entry.id)
            : doc(db, "timetablePersonal", user.uid, "entries", entry.id);
          await deleteDoc(ref);
        } catch (err) { alert("삭제 실패: " + err.message); }
      });
      grid.appendChild(block);
    });
  }

  onAuthStateChanged(auth, (signedUser) => {
    user = signedUser;
    if (!user) return;
    isAdmin = user.email === ADMIN_EMAIL;
    if (!isAdmin) {
      $("#ttScope").value = "personal";
      $("#ttScopeLabel").style.display = "none";
    }
    onSnapshot(collection(db, "timetableGlobal"), (snap) => {
      globalEntries = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderEntries();
      status.textContent = "과목명과 색상을 정한 뒤 시간대를 드래그하세요.";
    }, (err) => { status.textContent = "전체 시간표를 불러오지 못했습니다: " + err.message; });
    onSnapshot(collection(db, "timetablePersonal", user.uid, "entries"), (snap) => {
      personalEntries = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderEntries();
    }, (err) => { status.textContent = "내 시간표를 불러오지 못했습니다: " + err.message; });
  });

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }
});
