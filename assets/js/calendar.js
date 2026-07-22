/* 학사일정 캘린더 (calendar.html 전용)
   - 전체 일정과 로그인한 사용자의 개인 일정을 한 달력에 표시
   - 관리자는 전체 일정 관리 및 개인 일정 추가, 일반 사용자는 개인 일정 관리
   - 데이터: Firebase Firestore (calendarEvents, calendarPersonal) */

import { db, auth, isConfigured, ADMIN_EMAIL, ADMIN_NAME } from "./firebase-init.js?v=11";
import {
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, addDoc, setDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where, getDocs, writeBatch, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  normalizeAttachments, validateAttachmentFiles, uploadAttachmentFiles, deleteAttachmentFiles,
  attachmentMarkup, attachmentEditorMarkup, bindAttachmentOpen, formatAttachmentSize,
} from "./attachments.js?v=2";

/* 특정 날짜+내용의 캘린더 알림 모두 삭제 */
async function deleteCalAlerts(date, text, eventKey = "", relatedDates = [date]) {
  try {
    const snap = await getDocs(query(collection(db, "alerts"), where("type", "==", "calendar")));
    const dateSet = new Set(relatedDates);
    const toDelete = snap.docs.filter((item) => {
      const value = item.data();
      return (eventKey && value.calendarEventKey === eventKey)
        || ((value.text || "") === text && dateSet.has(value.date));
    });
    await Promise.all(toDelete.map((item) => deleteDoc(item.ref)));
  } catch (e) {}
}

/* 전체 일정 수정 시 기존 알림의 날짜·제목·세부 내용도 함께 갱신 */
async function syncCalAlerts(oldDates, oldText, eventKey, next) {
  const snap = await getDocs(query(collection(db, "alerts"), where("type", "==", "calendar")));
  const dateSet = new Set(oldDates);
  const targets = snap.docs.filter((item) => {
    const value = item.data();
    return value.calendarEventKey === eventKey
      || ((value.text || "") === oldText && dateSet.has(value.date));
  });
  await Promise.all(targets.map((item) => updateDoc(item.ref, {
    date: next.date,
    title: next.text,
    text: next.text,
    detail: next.detail || "",
    updatedAt: serverTimestamp(),
  })));
}

/* 분류별 라벨 */
const LABEL = {
  acad: "학사", exam: "시험", event: "행사", vac: "방학", holi: "공휴일",
  todo: "할 일", assignment: "과제", meet: "모임", etc: "기타",
};
/* 관리자가 추가할 때 고를 수 있는 분류 */
const ADD_TYPES = ["acad", "exam", "event", "vac", "holi", "assignment", "todo", "meet", "etc"];
const LIST_TYPES = ["acad", "exam", "event", "todo", "assignment", "meet", "vac", "holi"];

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
  const categoryRange = document.querySelector("#calCategoryRange");

  const today = new Date();
  const todayKey = key(today.getFullYear(), today.getMonth(), today.getDate());
  let view = new Date(today.getFullYear(), today.getMonth(), 1);
  let custom = {};        // Firestore 일정 { "YYYY-MM-DD": [{id,text,type}] }
  let personal = {};      // 로그인한 사용자의 개인 일정
  let overrides = {};     // 기본 일정의 수정·삭제 상태 { sourceId: {...} }
  let useDefaults = true;
  let isAdmin = false;
  let currentUser = null;
  let stopPersonalSnapshot = null;
  let latestCalendarSnap = null;
  let migrationStarted = false;
  let nextDateClickReadOnly = false;
  let nextDateClickEventText = "";
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
    const mine = (personal[k] || []).map((e) => ({ ...e, personal: true, eventKey: `personal:${e.id}` }));
    return [...def, ...cus, ...mine];
  }

  function overrideRef(sourceId) {
    return doc(db, "calendarEvents", `default_${sourceId.replace(/[^0-9A-Za-z_-]/g, "_")}`);
  }

  function allCalendarEvents() {
    const events = [...new Set([...Object.keys(DEFAULTS), ...Object.keys(custom), ...Object.keys(personal)])]
      .sort()
      .flatMap((date) => eventsOf(date).map((event) => ({ date, ...event })));
    const seen = new Set();
    return events.filter((event) => {
      const id = event.eventKey;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function goToEvent(date, readOnly = true, eventText = "") {
    const [y, m] = date.split("-").map(Number);
    view = new Date(y, m - 1, 1);
    render();
    const dateCell = grid.querySelector(`.cal-cell[data-key="${date}"]`);
    if (!dateCell) return;
    nextDateClickReadOnly = readOnly;
    nextDateClickEventText = eventText;
    document.querySelector(".cal-card")?.scrollIntoView({ block: "start", behavior: "auto" });
    dateCell.click();
  }

  function eventDateLabel(event, short = false) {
    const start = short ? event.date.slice(5).replace("-", ".") : event.date.replaceAll("-", ".");
    if (!event.endDate || event.endDate <= event.date) return start;
    const end = short ? event.endDate.slice(5).replace("-", ".") : event.endDate.replaceAll("-", ".");
    return `${start}–${end}`;
  }

  function renderCategoryLists() {
    const rangeStart = todayKey;
    const rangeEndDate = new Date(today.getFullYear(), today.getMonth(), 1);
    rangeEndDate.setMonth(rangeEndDate.getMonth() + 1);
    rangeEndDate.setDate(Math.min(
      today.getDate(),
      new Date(rangeEndDate.getFullYear(), rangeEndDate.getMonth() + 1, 0).getDate()
    ));
    const rangeEnd = key(rangeEndDate.getFullYear(), rangeEndDate.getMonth(), rangeEndDate.getDate());
    const allEvents = allCalendarEvents();
    if (categoryRange) {
      categoryRange.textContent = `${rangeStart.replaceAll("-", ".")} ~ ${rangeEnd.replaceAll("-", ".")} · 분류별 일정`;
    }

    LIST_TYPES.forEach((type) => {
      const category = document.querySelector(`.cal-category[data-type="${type}"]`);
      if (!category) return;
      const count = category.querySelector("summary b");
      const list = category.querySelector(".cal-category-list");
      const events = allEvents
        .filter((event) => event.type === type
          && event.date <= rangeEnd
          && (event.endDate || event.date) >= rangeStart)
        .sort((a, b) => a.date.localeCompare(b.date) || a.text.localeCompare(b.text, "ko"));

      count.textContent = String(events.length);
      list.innerHTML = events.length
        ? events.map((event) => {
          const targetDate = event.date < rangeStart ? rangeStart : event.date;
          return `<button type="button" class="cal-category-item" data-date="${targetDate}" data-event="${esc(event.text)}">
            <time>${eventDateLabel(event)}</time>
            <span>${esc(event.text)}${event.personal ? '<small>개인</small>' : ""}</span>
            <i aria-hidden="true">›</i>
          </button>`;
        }).join("")
        : `<p class="cal-category-empty">오늘부터 1개월 안에 등록된 ${LABEL[type]} 일정이 없습니다.</p>`;

      list.querySelectorAll(".cal-category-item").forEach((button) => {
        button.addEventListener("click", () => goToEvent(button.dataset.date, true, button.dataset.event));
      });
    });
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
      <button type="button" class="dday-item" data-date="${event.date}" data-event="${esc(event.text)}">
        <strong>${event.days === 0 ? "D-Day" : `D-${event.days}`}</strong>
        <span>${esc(event.text)}</span>
        <small>${eventDateLabel(event)} · ${LABEL[event.type] || "일정"}</small>
      </button>`).join("");
    ddayList.querySelectorAll(".dday-item").forEach((button) => {
      button.addEventListener("click", () => goToEvent(button.dataset.date, true, button.dataset.event));
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
      assignmentDdayList.innerHTML = `<p class="dday-empty">등록된 과제가 없습니다.</p>`;
      return;
    }
    assignmentDdayList.innerHTML = assignments.map((event) => `
      <button type="button" class="dday-item assignment-dday-item" data-date="${event.date}" data-event="${esc(event.text)}">
        <strong>${event.days === 0 ? "D-Day" : `D-${event.days}`}</strong>
        <span>${esc(event.text)}</span>
        <small>${eventDateLabel(event)} · 과제</small>
      </button>`).join("");
    assignmentDdayList.querySelectorAll(".dday-item").forEach((button) => {
      button.addEventListener("click", () => goToEvent(button.dataset.date, true, button.dataset.event));
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
      <button type="button" class="cal-search-item" data-date="${event.date}" data-event="${esc(event.text)}">
        <time>${eventDateLabel(event, true)}</time>
        <span>${esc(event.text)}</span>
      </button>`).join("") : `<p class="empty-note">검색 결과가 없습니다.</p>`;
    calendarSearchResults.querySelectorAll(".cal-search-item").forEach((button) => {
      button.addEventListener("click", () => {
        goToEvent(button.dataset.date, true, button.dataset.event);
        calendarSearchResults.classList.remove("open");
      });
    });
  }

  async function migrateAllToEditable() {
    if (!isAdmin || !latestCalendarSnap || migrationStarted) return;
    if (latestCalendarSnap.docs.some((d) => d.id === MIGRATION_ID)) return;
    migrationStarted = true;
    try {
      const visible = allCalendarEvents().filter((event) => !event.personal).map((event) => ({
        date: event.date, endDate: event.endDate || "", text: event.text,
        detail: event.detail || "", type: event.type || "etc",
        attachments: normalizeAttachments(event.attachments),
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
      currentUser = user;
      isAdmin = !!user && user.email === ADMIN_EMAIL;
      if (stopPersonalSnapshot) stopPersonalSnapshot();
      stopPersonalSnapshot = null;
      personal = {};
      if (user) {
        stopPersonalSnapshot = onSnapshot(
          collection(db, "calendarPersonal", user.uid, "events"),
          (snap) => {
            personal = {};
            snap.forEach((item) => {
              const value = item.data();
              const event = {
                id: item.id, date: value.date, endDate: value.endDate || "",
                text: value.text, type: value.type, detail: value.detail || "",
                attachments: normalizeAttachments(value.attachments),
              };
              datesInRange(value.date, value.endDate).forEach((date) => {
                (personal[date] = personal[date] || []).push(event);
              });
            });
            render();
            renderDdays();
            renderAssignmentDdays();
            renderCalendarSearch();
          },
          (err) => { banner.textContent = "개인 일정을 불러오지 못했습니다: " + err.message; }
        );
      }
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
          const event = {
            id: d.id, date: v.date, endDate: v.endDate || "", text: v.text,
            type: v.type, detail: v.detail || "", attachments: normalizeAttachments(v.attachments),
          };
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
    if (isAdmin) banner.innerHTML = `✏️ <strong>${ADMIN_NAME}</strong> 님(관리자) — 기본은 전체 일정이며, 필요할 때 개인 일정으로 저장할 수 있어요.`;
    else banner.innerHTML = `날짜를 클릭해 전체 일정과 내 개인 일정을 확인하고 개인 일정을 추가하세요.`;
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
        .map((e) => `<span class="chip ${e.type} ${e.personal ? "personal" : ""}">${esc(e.text)}</span>`).join("");
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
      cell.addEventListener("click", () => {
        const readOnly = nextDateClickReadOnly;
        const eventText = nextDateClickEventText;
        nextDateClickReadOnly = false;
        nextDateClickEventText = "";
        openDay(cell.dataset.key, readOnly, eventText);
      });
    });
    renderCategoryLists();
  }

  /* ---- 날짜 클릭 시 모달 ---- */
  const modal = document.querySelector("#calModal");
  const cmDate = document.querySelector("#cmDate");
  const cmList = document.querySelector("#cmList");
  const cmForm = document.querySelector("#cmForm");
  const cmText = document.querySelector("#cmText");
  const cmType = document.querySelector("#cmType");
  const cmDetail = document.querySelector("#cmDetail");
  const cmFiles = document.querySelector("#cmFiles");
  const cmAttachmentEditList = document.querySelector("#cmAttachmentEditList");
  const cmStartDate = document.querySelector("#cmStartDate");
  const cmEndDate = document.querySelector("#cmEndDate");
  const cmHint = document.querySelector("#cmHint");
  const cmPersonalToggle = document.querySelector("#cmPersonalToggle");
  const cmSubmit = cmForm.querySelector("button[type='submit']");
  let activeKey = null;
  let editingEvent = null;
  let editingAttachments = [];
  let removedAttachments = [];
  let modalReadOnly = false;
  let activeAutoOpenText = "";

  cmType.innerHTML = ADD_TYPES.map((t) => `<option value="${t}">${LABEL[t]}</option>`).join("");

  function setPersonalMode(enabled, locked = false) {
    const personalMode = isAdmin && enabled;
    cmPersonalToggle.hidden = !isAdmin;
    cmPersonalToggle.disabled = locked;
    cmPersonalToggle.setAttribute("aria-pressed", String(personalMode));
    cmPersonalToggle.textContent = personalMode ? "✓ 개인 일정" : "개인 일정";
  }

  cmPersonalToggle.addEventListener("click", () => {
    if (!isAdmin || cmPersonalToggle.disabled) return;
    setPersonalMode(cmPersonalToggle.getAttribute("aria-pressed") !== "true");
  });

  function openDay(k, readOnly = false, eventText = "") {
    activeKey = k;
    editingEvent = null;
    modalReadOnly = readOnly;
    activeAutoOpenText = eventText;
    cmSubmit.textContent = "추가";
    cmForm.reset();
    editingAttachments = [];
    removedAttachments = [];
    renderAttachmentEditor();
    setPersonalMode(false);
    cmStartDate.value = k;
    cmEndDate.value = k;
    cmEndDate.min = k;
    const [y, m, d] = k.split("-").map(Number);
    cmDate.textContent = `${m}월 ${d}일`;
    drawList();
    cmForm.style.display = currentUser && !modalReadOnly ? "flex" : "none";
    cmHint.hidden = modalReadOnly;
    cmHint.textContent = modalReadOnly
      ? ""
      : (isAdmin ? "개인 일정을 켜지 않으면 모든 학생에게 반영됩니다." : "추가한 일정은 내 캘린더에만 표시됩니다.");
    modal.classList.add("open");
  }
  function drawList() {
    const evs = eventsOf(activeKey);
    if (!evs.length) {
      cmList.innerHTML = `<li class="none">등록된 일정이 없어요.</li>`;
      return;
    }
    cmList.innerHTML = evs.map((e) => {
      const attachments = normalizeAttachments(e.attachments);
      const hasDetail = !!(e.detail && e.detail.trim()) || attachments.length > 0;
      const detailBody = e.detail && e.detail.trim()
        ? `<div class="post-detail-text">${esc(e.detail).replace(/\n/g, "<br>")}</div>`
        : "";
      const body = `${detailBody}${attachmentMarkup(attachments)}`;
      const period = e.endDate && e.endDate > e.date ? `${e.date.replaceAll("-", ".")} – ${e.endDate.replaceAll("-", ".")}` : "";
      const canManage = !modalReadOnly && (isAdmin || e.personal);
      return `
      <li class="cm-ev ${hasDetail ? "has-detail" : ""}">
        <div class="cm-ev-head">
          <span class="ev-tag ${e.type}">${LABEL[e.type]}</span>
          <span class="ev-text">${esc(e.text)}</span>
          ${e.personal ? `<span class="ev-private">개인</span>` : ""}
          ${period ? `<span class="ev-period">${period}</span>` : ""}
          ${hasDetail ? `<span class="ev-chev">▾</span>` : ""}
          ${!modalReadOnly && isAdmin && !e.personal ? `<button class="ev-alert" data-key="${esc(e.eventKey)}" data-text="${esc(e.text)}" data-detail="${esc(e.detail || "")}" title="알림 보내기">🔔</button>` : ""}
          ${canManage ? `<button class="ev-edit" data-key="${e.eventKey}" title="수정">✏️</button>` : ""}
          ${canManage ? `<button class="ev-del" data-key="${e.eventKey}" data-text="${esc(e.text)}" title="삭제">🗑</button>` : ""}
        </div>
        ${hasDetail ? `<div class="cm-ev-body">${body}</div>` : ""}
      </li>`;
    }).join("");
    if (activeAutoOpenText) {
      cmList.querySelectorAll(".cm-ev.has-detail").forEach((item) => {
        if (item.querySelector(".ev-text")?.textContent === activeAutoOpenText) item.classList.add("open");
      });
    }
    cmList.querySelectorAll(".cm-ev.has-detail .cm-ev-head").forEach((h) => {
      h.addEventListener("click", (e) => {
        if (e.target.closest(".ev-del") || e.target.closest(".ev-alert") || e.target.closest(".ev-edit")) return;
        h.parentElement.classList.toggle("open");
      });
    });
    bindAttachmentOpen(cmList);
    cmList.querySelectorAll(".ev-edit").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const event = eventsOf(activeKey).find((item) => item.eventKey === b.dataset.key);
        if (!event) return;
        editingEvent = event;
        editingAttachments = normalizeAttachments(event.attachments);
        removedAttachments = [];
        cmText.value = event.text || "";
        cmDetail.value = event.detail || "";
        cmFiles.value = "";
        renderAttachmentEditor();
        cmType.value = event.type || "event";
        cmStartDate.value = event.date || activeKey;
        cmEndDate.value = event.endDate || event.date || activeKey;
        cmEndDate.min = cmStartDate.value;
        setPersonalMode(!!event.personal, true);
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
          if (event.personal) {
            await deleteDoc(doc(db, "calendarPersonal", currentUser.uid, "events", event.id));
          } else if (event.fixed) {
            const values = {
              kind: "defaultOverride", sourceId: event.sourceId, date: activeKey,
              text: event.text, detail: event.detail || "", type: event.type, attachments: [], hidden: true,
              by: ADMIN_NAME, updatedAt: serverTimestamp(),
            };
            if (event.overrideId) await updateDoc(doc(db, "calendarEvents", event.overrideId), values);
            else await setDoc(overrideRef(event.sourceId), values);
          } else {
            await deleteDoc(doc(db, "calendarEvents", event.id));
          }
          if (!event.personal) {
            await deleteCalAlerts(
              activeKey,
              b.dataset.text,
              event.eventKey,
              datesInRange(event.date || activeKey, event.endDate)
            );
          }
          await deleteAttachmentFiles(event.attachments || []);
          alert("일정을 삭제했습니다.");
        } catch (err) { alert("삭제 실패: " + err.message); }
      });
    });
    cmList.querySelectorAll(".ev-alert").forEach((b) => {
      b.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("이 일정을 알림으로 보낼까요?")) return;
        try {
          await deleteCalAlerts(activeKey, b.dataset.text, b.dataset.key); // 같은 일정의 기존 알림 정리
          await addDoc(collection(db, "alerts"), {
            type: "calendar", title: b.dataset.text, detail: b.dataset.detail || "",
            date: activeKey, text: b.dataset.text, calendarEventKey: b.dataset.key,
            createdAt: serverTimestamp(),
          });
          alert("🔔 알림을 보냈어요!");
        } catch (err) { alert("알림 실패: " + err.message); }
      });
    });
  }

  function renderAttachmentEditor() {
    if (!cmAttachmentEditList) return;
    const selected = [...(cmFiles?.files || [])];
    const selectedMarkup = selected.map((file) => `
      <span class="attachment-edit-item new">
        <span>＋ ${esc(file.name)}</span><small>${formatAttachmentSize(file.size)}</small>
      </span>`).join("");
    cmAttachmentEditList.innerHTML = attachmentEditorMarkup(editingAttachments) + selectedMarkup;
    cmAttachmentEditList.querySelectorAll("button[data-attachment-index]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.attachmentIndex);
        const [removed] = editingAttachments.splice(index, 1);
        if (removed) removedAttachments.push(removed);
        renderAttachmentEditor();
      });
    });
  }

  cmFiles?.addEventListener("change", () => {
    try {
      validateAttachmentFiles(cmFiles.files, editingAttachments.length);
      renderAttachmentEditor();
    } catch (error) {
      cmFiles.value = "";
      renderAttachmentEditor();
      alert(error.message);
    }
  });

  cmForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    const text = cmText.value.trim();
    if (!text) return;
    const startDate = cmStartDate.value || activeKey;
    const endDate = cmEndDate.value || startDate;
    if (endDate < startDate) return alert("종료일은 시작일보다 빠를 수 없습니다.");
    let uploadedAttachments = [];
    const previousButtonText = cmSubmit.textContent;
    try {
      cmSubmit.disabled = true;
      cmSubmit.textContent = cmFiles.files.length ? "사진 업로드 중…" : "저장 중…";
      const savePersonal = editingEvent
        ? !!editingEvent.personal
        : (!isAdmin || cmPersonalToggle.getAttribute("aria-pressed") === "true");
      uploadedAttachments = await uploadAttachmentFiles(
        cmFiles.files,
        currentUser,
        "calendar",
        editingAttachments.length,
      );
      const values = {
        date: startDate, endDate: endDate > startDate ? endDate : "", text,
        detail: cmDetail.value.trim(), type: cmType.value,
        attachments: [...editingAttachments, ...uploadedAttachments],
        by: currentUser.displayName || (isAdmin ? ADMIN_NAME : "개인"),
      };
      if (editingEvent) {
        if (editingEvent.personal) {
          await updateDoc(doc(db, "calendarPersonal", currentUser.uid, "events", editingEvent.id), { ...values, updatedAt: serverTimestamp() });
        } else if (editingEvent.fixed) {
          const overrideValues = {
            ...values, kind: "defaultOverride", sourceId: editingEvent.sourceId,
            hidden: false, updatedAt: serverTimestamp(),
          };
          if (editingEvent.overrideId) await updateDoc(doc(db, "calendarEvents", editingEvent.overrideId), overrideValues);
          else await setDoc(overrideRef(editingEvent.sourceId), overrideValues);
        } else {
          await updateDoc(doc(db, "calendarEvents", editingEvent.id), { ...values, updatedAt: serverTimestamp() });
        }
        if (!editingEvent.personal) {
          await syncCalAlerts(
            datesInRange(editingEvent.date || activeKey, editingEvent.endDate),
            editingEvent.text,
            editingEvent.eventKey,
            values
          );
        }
      } else {
        const target = savePersonal
          ? collection(db, "calendarPersonal", currentUser.uid, "events")
          : collection(db, "calendarEvents");
        await addDoc(target, { ...values, createdAt: serverTimestamp() });
      }
      await deleteAttachmentFiles(removedAttachments);
      cmText.value = "";
      cmDetail.value = "";
      cmFiles.value = "";
      editingEvent = null;
      editingAttachments = [];
      removedAttachments = [];
      renderAttachmentEditor();
      cmSubmit.textContent = "추가";
      setPersonalMode(false);
      alert("일정을 저장했습니다.");
    } catch (err) {
      await deleteAttachmentFiles(uploadedAttachments);
      alert("저장 실패: " + err.message);
    } finally {
      cmSubmit.disabled = false;
      if (cmSubmit.textContent.endsWith("중…")) cmSubmit.textContent = previousButtonText;
    }
  });

  function closeModal() {
    modal.classList.remove("open");
    editingEvent = null;
    modalReadOnly = false;
    activeAutoOpenText = "";
    cmSubmit.textContent = "추가";
    cmForm.reset();
    editingAttachments = [];
    removedAttachments = [];
    renderAttachmentEditor();
    setPersonalMode(false);
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
    goToEvent(linkDate, _p.get("view") === "1", linkEv || "");
  }

  updateBanner();
  render();
  tryDeepLink();
});
