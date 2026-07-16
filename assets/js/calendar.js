/* 학사일정 캘린더 (calendar.html 전용)
   - 모든 사람: 일정 보기
   - 관리자(정지훈)만: 날짜를 눌러 일정/할 일 추가·삭제
   - 데이터: Firebase Firestore (calendarEvents) */

import { db, auth, isConfigured, ADMIN_EMAIL, ADMIN_NAME } from "./firebase-init.js?v=11";
import {
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, addDoc, deleteDoc, doc, onSnapshot, query, where, getDocs, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* 특정 날짜+내용의 캘린더 알림 모두 삭제 */
async function deleteCalAlerts(date, text) {
  try {
    const snap = await getDocs(query(collection(db, "alerts"), where("date", "==", date)));
    const toDel = snap.docs.filter((d) => (d.data().text || "") === text);
    await Promise.all(toDel.map((d) => deleteDoc(doc(db, "alerts", d.id))));
  } catch (e) {}
}

/* 분류별 라벨 */
const LABEL = {
  acad: "학사", exam: "시험", event: "행사", vac: "방학", holi: "공휴일",
  todo: "할 일", meet: "모임", etc: "기타",
};
/* 관리자가 추가할 때 고를 수 있는 분류 */
const ADD_TYPES = ["event", "todo", "exam", "meet", "etc"];

/* 단국대/의과대학 학사일정 (기본 표시, 수정 불가) */
const DEFAULTS = {
  "2026-01-01": [{ text: "신정", type: "holi" }],
  "2026-02-16": [{ text: "설날 연휴", type: "holi" }],
  "2026-02-17": [{ text: "설날", type: "holi" }],
  "2026-02-18": [{ text: "설날 연휴", type: "holi" }],
  "2026-03-01": [{ text: "삼일절", type: "holi" }],
  "2026-03-02": [{ text: "삼일절 대체공휴일", type: "holi" }],
  "2026-03-03": [{ text: "1학기 개강", type: "acad" }],
  "2026-04-20": [{ text: "1학기 중간고사 (~4/24)", type: "exam" }],
  "2026-05-01": [{ text: "노동절", type: "holi" }],
  "2026-05-05": [{ text: "어린이날", type: "holi" }],
  "2026-05-24": [{ text: "부처님오신날", type: "holi" }],
  "2026-05-25": [{ text: "부처님오신날 대체공휴일", type: "holi" }],
  "2026-06-03": [{ text: "제9회 전국동시지방선거일", type: "holi" }],
  "2026-06-06": [{ text: "현충일", type: "holi" }],
  "2026-06-15": [{ text: "1학기 기말고사 (~6/19)", type: "exam" }],
  "2026-06-22": [{ text: "여름방학 시작", type: "vac" }],
  "2026-07-17": [{ text: "제헌절", type: "holi" }],
  "2026-08-15": [{ text: "광복절", type: "holi" }],
  "2026-08-17": [{ text: "광복절 대체공휴일", type: "holi" }],
  "2026-09-01": [{ text: "2학기 개강", type: "acad" }],
  "2026-09-24": [{ text: "추석 연휴", type: "holi" }],
  "2026-09-25": [{ text: "추석", type: "holi" }],
  "2026-09-26": [{ text: "추석 연휴", type: "holi" }],
  "2026-10-03": [{ text: "개천절", type: "holi" }],
  "2026-10-05": [{ text: "개천절 대체공휴일", type: "holi" }],
  "2026-10-09": [{ text: "한글날", type: "holi" }],
  "2026-10-19": [{ text: "2학기 중간고사 (~10/23)", type: "exam" }],
  "2026-11-06": [{ text: "의과대학 학술제", type: "event" }],
  "2026-12-14": [{ text: "2학기 기말고사 (~12/18)", type: "exam" }],
  "2026-12-21": [{ text: "겨울방학 시작", type: "vac" }],
  "2026-12-25": [{ text: "성탄절", type: "holi" }],
};

document.addEventListener("DOMContentLoaded", () => {
  const grid = document.querySelector("#calGrid");
  if (!grid) return;

  const titleEl = document.querySelector("#calTitle");
  const banner = document.querySelector("#calBanner");

  const today = new Date();
  const todayKey = key(today.getFullYear(), today.getMonth(), today.getDate());
  let view = new Date(today.getFullYear(), today.getMonth(), 1);
  let custom = {};        // Firestore 일정 { "YYYY-MM-DD": [{id,text,type}] }
  let isAdmin = false;

  function key(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  function eventsOf(k) {
    const def = (DEFAULTS[k] || []).map((e) => ({ ...e, fixed: true }));
    const cus = custom[k] || [];
    return [...def, ...cus];
  }

  /* 로그인 상태 → 관리자 여부 */
  if (isConfigured) {
    onAuthStateChanged(auth, (user) => {
      isAdmin = !!user && user.email === ADMIN_EMAIL;
      updateBanner();
      render();
    });
    /* 실시간 일정 */
    onSnapshot(collection(db, "calendarEvents"), (snap) => {
      custom = {};
      snap.forEach((d) => {
        const v = d.data();
        (custom[v.date] = custom[v.date] || []).push({ id: d.id, text: v.text, type: v.type, detail: v.detail || "" });
      });
      render();
      tryDeepLink();
    });
  } else {
    banner.textContent = "⚠️ 일정 편집은 Firebase 설정 후 사용할 수 있어요. (지금은 학사일정만 표시)";
  }

  function updateBanner() {
    if (isAdmin) banner.innerHTML = `✏️ <strong>${ADMIN_NAME}</strong> 님(관리자) — 날짜를 클릭해 일정을 추가/삭제하세요.`;
    else banner.innerHTML = `날짜를 클릭하면 그날의 일정을 볼 수 있어요. (일정 등록은 대표만 가능)`;
  }

  function render() {
    const y = view.getFullYear();
    const m = view.getMonth();
    titleEl.textContent = `${y}년 ${m + 1}월`;

    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();

    let html = "";
    for (let i = 0; i < first; i++) html += `<div class="cal-cell empty"></div>`;
    for (let d = 1; d <= days; d++) {
      const k = key(y, m, d);
      const dow = new Date(y, m, d).getDay();
      const evs = eventsOf(k);
      const cls = ["cal-cell"];
      if (k === todayKey) cls.push("today");
      if (dow === 0) cls.push("sun");
      if (dow === 6) cls.push("sat");
      if (evs.length) cls.push("has");

      const shown = evs.slice(0, 3)
        .map((e) => `<span class="chip ${e.type}">${esc(e.text)}</span>`).join("");
      const more = evs.length > 3 ? `<span class="chip more">+${evs.length - 3}</span>` : "";
      const dots = evs.map((e) => `<i class="d ${e.type}"></i>`).join("");

      html += `<div class="${cls.join(" ")}" data-key="${k}" data-day="${d}">
        <span class="num">${d}</span>
        <div class="chips">${shown}${more}</div>
        <div class="dotrow">${dots}</div>
      </div>`;
    }
    grid.innerHTML = html;

    grid.querySelectorAll(".cal-cell:not(.empty)").forEach((cell) => {
      cell.addEventListener("click", () => openDay(cell.dataset.key));
    });
  }

  /* ---- 날짜 클릭 시 모달 ---- */
  const modal = document.querySelector("#calModal");
  const cmDate = document.querySelector("#cmDate");
  const cmList = document.querySelector("#cmList");
  const cmForm = document.querySelector("#cmForm");
  const cmText = document.querySelector("#cmText");
  const cmType = document.querySelector("#cmType");
  const cmDetail = document.querySelector("#cmDetail");
  const cmHint = document.querySelector("#cmHint");
  let activeKey = null;

  cmType.innerHTML = ADD_TYPES.map((t) => `<option value="${t}">${LABEL[t]}</option>`).join("");

  function openDay(k) {
    activeKey = k;
    const [y, m, d] = k.split("-").map(Number);
    cmDate.textContent = `${m}월 ${d}일`;
    drawList();
    cmForm.style.display = isAdmin ? "flex" : "none";
    cmHint.textContent = isAdmin ? "" : (isConfigured ? "일정 등록은 대표(관리자)만 할 수 있어요." : "");
    modal.classList.add("open");
  }
  function drawList() {
    const evs = eventsOf(activeKey);
    if (!evs.length) {
      cmList.innerHTML = `<li class="none">등록된 일정이 없어요.</li>`;
      return;
    }
    cmList.innerHTML = evs.map((e) => {
      const hasDetail = !!(e.detail && e.detail.trim());
      const body = hasDetail ? esc(e.detail).replace(/\n/g, "<br>") : "";
      return `
      <li class="cm-ev ${hasDetail ? "has-detail" : ""}">
        <div class="cm-ev-head">
          <span class="ev-tag ${e.type}">${LABEL[e.type]}</span>
          <span class="ev-text">${esc(e.text)}</span>
          ${hasDetail ? `<span class="ev-chev">▾</span>` : ""}
          ${isAdmin ? `<button class="ev-alert" data-text="${esc(e.text)}" data-detail="${esc(e.detail || "")}" title="알림 보내기">🔔</button>` : ""}
          ${isAdmin && !e.fixed ? `<button class="ev-del" data-id="${e.id}" data-text="${esc(e.text)}" title="삭제">🗑</button>` : ""}
        </div>
        ${hasDetail ? `<div class="cm-ev-body">${body}</div>` : ""}
      </li>`;
    }).join("");
    cmList.querySelectorAll(".cm-ev.has-detail .cm-ev-head").forEach((h) => {
      h.addEventListener("click", (e) => {
        if (e.target.closest(".ev-del") || e.target.closest(".ev-alert")) return;
        h.parentElement.classList.toggle("open");
      });
    });
    cmList.querySelectorAll(".ev-del").forEach((b) => {
      b.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("이 일정을 삭제할까요?")) return;
        try {
          await deleteDoc(doc(db, "calendarEvents", b.dataset.id));
          await deleteCalAlerts(activeKey, b.dataset.text); // 일정 삭제 시 관련 알림도 삭제
        } catch (err) { alert("삭제 실패: " + err.message); }
      });
    });
    cmList.querySelectorAll(".ev-alert").forEach((b) => {
      b.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("이 일정을 알림으로 보낼까요?")) return;
        try {
          await deleteCalAlerts(activeKey, b.dataset.text); // 같은 일정의 기존 알림 정리
          await addDoc(collection(db, "alerts"), {
            type: "calendar", title: b.dataset.text, detail: b.dataset.detail || "", date: activeKey, text: b.dataset.text, createdAt: serverTimestamp(),
          });
          alert("🔔 알림을 보냈어요!");
        } catch (err) { alert("알림 실패: " + err.message); }
      });
    });
  }
  cmForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    const text = cmText.value.trim();
    if (!text) return;
    try {
      await addDoc(collection(db, "calendarEvents"), {
        date: activeKey, text, detail: cmDetail.value.trim(), type: cmType.value,
        by: ADMIN_NAME, createdAt: serverTimestamp(),
      });
      cmText.value = "";
      cmDetail.value = "";
    } catch (err) { alert("추가 실패: " + err.message); }
  });

  document.querySelector("#cmClose").addEventListener("click", () => modal.classList.remove("open"));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("open"); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") modal.classList.remove("open"); });

  /* 모달이 열려 있는 동안 실시간 갱신 반영 */
  const _render = render;
  render = function () { _render(); if (modal.classList.contains("open") && activeKey) drawList(); };

  /* 월 이동 */
  document.querySelector("#calPrev").addEventListener("click", () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(); });
  document.querySelector("#calNext").addEventListener("click", () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(); });
  document.querySelector("#calToday").addEventListener("click", () => { view = new Date(today.getFullYear(), today.getMonth(), 1); render(); });

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  /* 알림에서 넘어왔을 때: 해당 날짜 열고 해당 일정 펼치기 */
  const _p = new URLSearchParams(location.search);
  const linkDate = _p.get("date");
  const linkEv = _p.get("ev");
  let linkHandled = false;
  function tryDeepLink() {
    if (linkHandled || !linkDate || !/^\d{4}-\d{2}-\d{2}$/.test(linkDate)) return;
    linkHandled = true;
    const [y, m] = linkDate.split("-").map(Number);
    view = new Date(y, m - 1, 1);
    render();
    openDay(linkDate);
    if (linkEv) {
      cmList.querySelectorAll(".cm-ev").forEach((li) => {
        const t = li.querySelector(".ev-text");
        if (t && t.textContent === linkEv) li.classList.add("open");
      });
    }
  }

  updateBanner();
  render();
  tryDeepLink();
});
