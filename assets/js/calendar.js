/* 학사일정 캘린더 (calendar.html 전용)
   - 모든 사람: 일정 보기
   - 관리자(정지훈)만: 날짜를 눌러 일정/할 일 추가·삭제
   - 데이터: Firebase Firestore (calendarEvents) */

import { db, auth, isConfigured, ADMIN_EMAIL, ADMIN_NAME } from "./firebase-init.js?v=11";
import {
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, addDoc, setDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where, getDocs, writeBatch, serverTimestamp,
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
  todo: "할 일", assignment: "과제", meet: "모임", etc: "기타",
};
/* 관리자가 추가할 때 고를 수 있는 분류 */
const ADD_TYPES = ["acad", "exam", "event", "vac", "holi", "assignment", "todo", "meet", "etc"];

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
  const ddayList = document.querySelector("#ddayList");
  const assignmentDdayList = document.querySelector("#assignmentDdayList");
  const calendarSearch = document.querySelector("#calendarSearch");
  const calendarSearchResults = document.querySelector("#calendarSearchResults");

  const today = new Date();
  const todayKey = key(today.getFullYear(), today.getMonth(), today.getDate());
  let view = new Date(today.getFullYear(), today.getMonth(), 1);
  let custom = {};        // Firestore 일정 { "YYYY-MM-DD": [{id,text,type}] }
  let overrides = {};     // 기본 일정의 수정·삭제 상태 { sourceId: {...} }
  let useDefaults = true;
  let isAdmin = false;
  let latestCalendarSnap = null;
  let migrationStarted = false;
  const MIGRATION_ID = "editable-reset-v1";

  function key(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  function datesInRange(start, end = start) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start || "")) return [];
    const last = /^\d{4}-\d{2}-\d{2}$/.test(end || "") && end >= start ? end : start;
    const dates = [];
    const cursor = new Date(`${start}T00:00:00`);
    for (let i = 0; i < 367; i++) {
      const value = key(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
      dates.push(value);
      if (value >= last) break;
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }
  function eventsOf(k) {
    const def = (useDefaults ? (DEFAULTS[k] || []) : []).map((e, index) => {
      const sourceId = `${k}:${index}`;
      const override = overrides[sourceId];
      if (override?.hidden) return null;
      return {
        ...e, ...(override || {}), fixed: true, sourceId,
        overrideId: override?.id || "", eventKey: `fixed:${sourceId}`,
      };
    }).filter(Boolean);
    const cus = (custom[k] || []).map((e) => ({ ...e, eventKey: `custom:${e.id}` }));
    return [...def, ...cus];
  }

  function overrideRef(sourceId) {
    return doc(db, "calendarEvents", `default_${sourceId.replace(/[^0-9A-Za-z_-]/g, "_")}`);
  }

  function allCalendarEvents() {
    const events = [...new Set([...Object.keys(DEFAULTS), ...Object.keys(custom)])]
      .sort()
      .flatMap((date) => eventsOf(date).map((event) => ({ date, ...event })));
    const seen = new Set();
    return events.filter((event) => {
      const id = event.fixed ? event.eventKey : `custom:${event.id}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function goToEvent(date) {
    const [y, m] = date.split("-").map(Number);
    view = new Date(y, m - 1, 1);
    render();
    openDay(date);
  }

  function eventDateLabel(event, short = false) {
    const start = short ? event.date.slice(5).replace("-", ".") : event.date.replaceAll("-", ".");
    if (!event.endDate || event.endDate <= event.date) return start;
    const end = short ? event.endDate.slice(5).replace("-", ".") : event.endDate.replaceAll("-", ".");
    return `${start}–${end}`;
  }

  function renderDdays() {
    if (!ddayList) return;
    const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const majorTypes = new Set(["exam", "acad", "event"]);
    const upcoming = allCalendarEvents()
      .filter((event) => majorTypes.has(event.type))
      .map((event) => ({
        ...event,
        days: Math.round((new Date(`${event.date}T00:00:00`) - base) / 86400000),
      }))
      .filter((event) => event.days >= 0)
      .sort((a, b) => a.days - b.days || a.date.localeCompare(b.date))
      .slice(0, 4);
    if (!upcoming.length) {
      ddayList.innerHTML = `<p class="dday-empty">등록된 예정 시험이나 주요 일정이 없습니다.</p>`;
      return;
    }
    ddayList.innerHTML = upcoming.map((event) => `
      <button type="button" class="dday-item" data-date="${event.date}">
        <strong>${event.days === 0 ? "D-Day" : `D-${event.days}`}</strong>
        <span>${esc(event.text)}</span>
        <small>${eventDateLabel(event)} · ${LABEL[event.type] || "일정"}</small>
      </button>`).join("");
    ddayList.querySelectorAll(".dday-item").forEach((button) => {
      button.addEventListener("click", () => goToEvent(button.dataset.date));
    });
  }

  function renderAssignmentDdays() {
    if (!assignmentDdayList) return;
    const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const assignments = allCalendarEvents()
      .filter((event) => event.type === "assignment")
      .map((event) => ({
        ...event,
        days: Math.round((new Date(`${event.date}T00:00:00`) - base) / 86400000),
      }))
      .filter((event) => event.days >= 0)
      .sort((a, b) => a.days - b.days || a.date.localeCompare(b.date))
      .slice(0, 6);
    if (!assignments.length) {
      assignmentDdayList.innerHTML = `<p class="dday-empty">등록된 과제가 없습니다. 일정을 추가할 때 분류를 ‘과제’로 선택하세요.</p>`;
      return;
    }
    assignmentDdayList.innerHTML = assignments.map((event) => `
      <button type="button" class="dday-item assignment-dday-item" data-date="${event.date}">
        <strong>${event.days === 0 ? "D-Day" : `D-${event.days}`}</strong>
        <span>${esc(event.text)}</span>
        <small>${eventDateLabel(event)} · 과제</small>
      </button>`).join("");
    assignmentDdayList.querySelectorAll(".dday-item").forEach((button) => {
      button.addEventListener("click", () => goToEvent(button.dataset.date));
    });
  }

  function renderCalendarSearch() {
    if (!calendarSearch || !calendarSearchResults) return;
    const keyword = calendarSearch.value.trim().toLocaleLowerCase("ko");
    if (!keyword) {
      calendarSearchResults.classList.remove("open");
      calendarSearchResults.innerHTML = "";
      return;
    }
    const results = allCalendarEvents().filter((event) =>
      `${event.text || ""} ${event.detail || ""} ${LABEL[event.type] || ""}`.toLocaleLowerCase("ko").includes(keyword)
    ).slice(0, 20);
    calendarSearchResults.classList.add("open");
    calendarSearchResults.innerHTML = results.length ? results.map((event) => `
      <button type="button" class="cal-search-item" data-date="${event.date}">
        <time>${eventDateLabel(event, true)}</time>
        <span>${esc(event.text)}</span>
      </button>`).join("") : `<p class="empty-note">검색 결과가 없습니다.</p>`;
    calendarSearchResults.querySelectorAll(".cal-search-item").forEach((button) => {
      button.addEventListener("click", () => {
        goToEvent(button.dataset.date);
        calendarSearchResults.classList.remove("open");
      });
    });
  }

  async function migrateAllToEditable() {
    if (!isAdmin || !latestCalendarSnap || migrationStarted) return;
    if (latestCalendarSnap.docs.some((d) => d.id === MIGRATION_ID)) return;
    migrationStarted = true;
    try {
      const visible = allCalendarEvents().map((event) => ({
        date: event.date, endDate: event.endDate || "", text: event.text,
        detail: event.detail || "", type: event.type || "etc",
      }));
      const batch = writeBatch(db);
      latestCalendarSnap.docs.forEach((item) => batch.delete(item.ref));
      visible.forEach((event) => {
        batch.set(doc(collection(db, "calendarEvents")), {
          ...event, by: ADMIN_NAME, createdAt: serverTimestamp(),
        });
      });
      batch.set(doc(db, "calendarEvents", MIGRATION_ID), {
        kind: "migrationMarker", version: 1, migratedAt: serverTimestamp(), by: ADMIN_NAME,
      });
      await batch.commit();
      alert("캘린더 항목을 모두 다시 등록했습니다. 이제 공휴일까지 수정·삭제할 수 있습니다.");
    } catch (err) {
      migrationStarted = false;
      alert("캘린더 재등록 실패: " + err.message);
    }
  }

  /* 로그인 상태 → 관리자 여부 */
  if (isConfigured) {
    onAuthStateChanged(auth, (user) => {
      isAdmin = !!user && user.email === ADMIN_EMAIL;
      updateBanner();
      render();
      migrateAllToEditable();
    });
    /* 실시간 일정 */
    onSnapshot(collection(db, "calendarEvents"), (snap) => {
      latestCalendarSnap = snap;
      useDefaults = !snap.docs.some((d) => d.id === MIGRATION_ID);
      custom = {};
      overrides = {};
      snap.forEach((d) => {
        const v = d.data();
        if (v.kind === "migrationMarker") {
          return;
        } else if (v.kind === "defaultOverride" && v.sourceId) {
          overrides[v.sourceId] = { id: d.id, ...v };
        } else {
          const event = { id: d.id, date: v.date, endDate: v.endDate || "", text: v.text, type: v.type, detail: v.detail || "" };
          datesInRange(v.date, v.endDate).forEach((date) => {
            (custom[date] = custom[date] || []).push(event);
          });
        }
      });
      render();
      tryDeepLink();
      renderDdays();
      renderAssignmentDdays();
      renderCalendarSearch();
      migrateAllToEditable();
    });
  } else {
    banner.textContent = "⚠️ 일정 편집은 Firebase 설정 후 사용할 수 있어요. (지금은 학사일정만 표시)";
  }

  function updateBanner() {
    if (isAdmin) banner.innerHTML = `✏️ <strong>${ADMIN_NAME}</strong> 님(관리자) — 날짜를 클릭해 모든 일정을 추가·수정·삭제하세요.`;
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
  const cmStartDate = document.querySelector("#cmStartDate");
  const cmEndDate = document.querySelector("#cmEndDate");
  const cmHint = document.querySelector("#cmHint");
  const cmSubmit = cmForm.querySelector("button[type='submit']");
  let activeKey = null;
  let editingEvent = null;

  cmType.innerHTML = ADD_TYPES.map((t) => `<option value="${t}">${LABEL[t]}</option>`).join("");

  function openDay(k) {
    activeKey = k;
    editingEvent = null;
    cmSubmit.textContent = "추가";
    cmForm.reset();
    cmStartDate.value = k;
    cmEndDate.value = k;
    cmEndDate.min = k;
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
      const period = e.endDate && e.endDate > e.date ? `${e.date.replaceAll("-", ".")} – ${e.endDate.replaceAll("-", ".")}` : "";
      return `
      <li class="cm-ev ${hasDetail ? "has-detail" : ""}">
        <div class="cm-ev-head">
          <span class="ev-tag ${e.type}">${LABEL[e.type]}</span>
          <span class="ev-text">${esc(e.text)}</span>
          ${period ? `<span class="ev-period">${period}</span>` : ""}
          ${hasDetail ? `<span class="ev-chev">▾</span>` : ""}
          ${isAdmin ? `<button class="ev-alert" data-text="${esc(e.text)}" data-detail="${esc(e.detail || "")}" title="알림 보내기">🔔</button>` : ""}
          ${isAdmin ? `<button class="ev-edit" data-key="${e.eventKey}" title="수정">✏️</button>` : ""}
          ${isAdmin ? `<button class="ev-del" data-key="${e.eventKey}" data-text="${esc(e.text)}" title="삭제">🗑</button>` : ""}
        </div>
        ${hasDetail ? `<div class="cm-ev-body">${body}</div>` : ""}
      </li>`;
    }).join("");
    cmList.querySelectorAll(".cm-ev.has-detail .cm-ev-head").forEach((h) => {
      h.addEventListener("click", (e) => {
        if (e.target.closest(".ev-del") || e.target.closest(".ev-alert") || e.target.closest(".ev-edit")) return;
        h.parentElement.classList.toggle("open");
      });
    });
    cmList.querySelectorAll(".ev-edit").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const event = eventsOf(activeKey).find((item) => item.eventKey === b.dataset.key);
        if (!event) return;
        editingEvent = event;
        cmText.value = event.text || "";
        cmDetail.value = event.detail || "";
        cmType.value = event.type || "event";
        cmStartDate.value = event.date || activeKey;
        cmEndDate.value = event.endDate || event.date || activeKey;
        cmEndDate.min = cmStartDate.value;
        cmSubmit.textContent = "수정 저장";
        cmText.focus();
      });
    });
    cmList.querySelectorAll(".ev-del").forEach((b) => {
      b.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("이 일정을 삭제할까요?")) return;
        try {
          const event = eventsOf(activeKey).find((item) => item.eventKey === b.dataset.key);
          if (!event) return;
          if (event.fixed) {
            const values = {
              kind: "defaultOverride", sourceId: event.sourceId, date: activeKey,
              text: event.text, detail: event.detail || "", type: event.type, hidden: true,
              by: ADMIN_NAME, updatedAt: serverTimestamp(),
            };
            if (event.overrideId) await updateDoc(doc(db, "calendarEvents", event.overrideId), values);
            else await setDoc(overrideRef(event.sourceId), values);
          } else {
            await deleteDoc(doc(db, "calendarEvents", event.id));
          }
          await deleteCalAlerts(activeKey, b.dataset.text); // 일정 삭제 시 관련 알림도 삭제
          alert("일정을 삭제했습니다.");
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
    const startDate = cmStartDate.value || activeKey;
    const endDate = cmEndDate.value || startDate;
    if (endDate < startDate) return alert("종료일은 시작일보다 빠를 수 없습니다.");
    try {
      const values = { date: startDate, endDate: endDate > startDate ? endDate : "", text, detail: cmDetail.value.trim(), type: cmType.value, by: ADMIN_NAME };
      if (editingEvent) {
        if (editingEvent.fixed) {
          const overrideValues = {
            ...values, kind: "defaultOverride", sourceId: editingEvent.sourceId,
            hidden: false, updatedAt: serverTimestamp(),
          };
          if (editingEvent.overrideId) await updateDoc(doc(db, "calendarEvents", editingEvent.overrideId), overrideValues);
          else await setDoc(overrideRef(editingEvent.sourceId), overrideValues);
        } else {
          await updateDoc(doc(db, "calendarEvents", editingEvent.id), { ...values, updatedAt: serverTimestamp() });
        }
        await deleteCalAlerts(activeKey, editingEvent.text);
      } else {
        await addDoc(collection(db, "calendarEvents"), { ...values, createdAt: serverTimestamp() });
      }
      cmText.value = "";
      cmDetail.value = "";
      editingEvent = null;
      cmSubmit.textContent = "추가";
      alert("일정을 저장했습니다.");
    } catch (err) { alert("저장 실패: " + err.message); }
  });

  function closeModal() {
    modal.classList.remove("open");
    editingEvent = null;
    cmSubmit.textContent = "추가";
    cmForm.reset();
  }
  document.querySelector("#cmClose").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  /* 모달이 열려 있는 동안 실시간 갱신 반영 */
  const _render = render;
  render = function () { _render(); if (modal.classList.contains("open") && activeKey) drawList(); };

  /* 월 이동 */
  document.querySelector("#calPrev").addEventListener("click", () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(); });
  document.querySelector("#calNext").addEventListener("click", () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(); });
  document.querySelector("#calToday").addEventListener("click", () => { view = new Date(today.getFullYear(), today.getMonth(), 1); render(); });
  cmStartDate.addEventListener("change", () => {
    cmEndDate.min = cmStartDate.value;
    if (!cmEndDate.value || cmEndDate.value < cmStartDate.value) cmEndDate.value = cmStartDate.value;
  });
  calendarSearch?.addEventListener("input", renderCalendarSearch);
  document.querySelector("#calendarSearchClear")?.addEventListener("click", () => {
    calendarSearch.value = "";
    renderCalendarSearch();
    calendarSearch.focus();
  });

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
