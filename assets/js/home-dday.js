import { auth, db } from "./firebase-init.js?v=12";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const majorBox = document.querySelector("#homeMajorDdays");
const assignmentBox = document.querySelector("#homeAssignmentDdays");
const majorTypes = new Set(["exam", "acad", "event"]);
let globalEvents = [];
let personalEvents = [];
let unsubscribeGlobal = null;
let unsubscribePersonal = null;

function validEvent(id, value, personal = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.date || "")) return null;
  if (value.kind === "migrationMarker" || value.kind === "defaultOverride" || value.hidden) return null;
  return {
    id, date: value.date, endDate: value.endDate || "", text: value.text || "",
    type: value.type || "etc", personal,
  };
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[char]));
}

function renderList(box, events, emptyText) {
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const upcoming = events.map((event) => ({
    ...event,
    days: Math.round((new Date(`${event.date}T00:00:00`) - base) / 86400000),
  })).filter((event) => event.days >= 0)
    .sort((a, b) => a.days - b.days || a.date.localeCompare(b.date))
    .slice(0, 3);

  if (!upcoming.length) {
    box.innerHTML = `<p class="home-schedule-empty empty-state">${emptyText}</p>`;
    return;
  }
  box.innerHTML = upcoming.map((event) => {
    const href = `calendar.html?date=${encodeURIComponent(event.date)}&ev=${encodeURIComponent(event.text)}&view=1`;
    const dateLabel = event.date.slice(5).replace("-", ".");
    const dday = event.days === 0 ? "D-Day" : `D-${event.days}`;
    return `<a class="home-dday-link" href="${href}"><strong>${dday}</strong><span>${escapeHtml(event.text)}</span><time>${dateLabel}</time></a>`;
  }).join("");
}

function render() {
  const events = [...globalEvents, ...personalEvents];
  renderList(majorBox, events.filter((event) => majorTypes.has(event.type)), "예정된 주요 일정이 없습니다.");
  renderList(assignmentBox, events.filter((event) => event.type === "assignment"), "등록된 과제가 없습니다.");
}

onAuthStateChanged(auth, (user) => {
  unsubscribeGlobal?.();
  unsubscribePersonal?.();
  unsubscribeGlobal = null;
  unsubscribePersonal = null;
  globalEvents = [];
  personalEvents = [];
  if (!user) return;

  unsubscribeGlobal = onSnapshot(collection(db, "calendarEvents"), (snap) => {
    globalEvents = snap.docs.map((item) => validEvent(item.id, item.data())).filter(Boolean);
    render();
  }, () => {
    majorBox.innerHTML = '<p class="home-schedule-empty empty-state">일정을 불러오지 못했습니다.</p>';
  });

  unsubscribePersonal = onSnapshot(collection(db, "calendarPersonal", user.uid, "events"), (snap) => {
    personalEvents = snap.docs.map((item) => validEvent(item.id, item.data(), true)).filter(Boolean);
    render();
  }, () => {
    assignmentBox.innerHTML = '<p class="home-schedule-empty empty-state">개인 일정을 불러오지 못했습니다.</p>';
  });
});
