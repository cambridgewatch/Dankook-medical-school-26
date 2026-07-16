/* 알림 벨 (모든 페이지 공통)
   - 헤더 로그인 옆에 🔔 벨 + 안 읽은 개수 배지 + 알림 목록 패널.
   - 알림 자체는 관리자가 공지/캘린더의 🔔 버튼을 눌러 생성(notices.js / calendar.js).
   - 여기서는 읽기 전용으로 표시만 함. */

import { db, auth, isConfigured } from "./firebase-init.js?v=11";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, query, orderBy, limit, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

window.addEventListener("DOMContentLoaded", () => {
  const menu = document.querySelector(".nav-menu");
  if (!menu || !isConfigured) return;

  const li = document.createElement("li");
  li.className = "bell-li";
  li.style.display = "none";
  li.innerHTML = `
    <button class="bell-btn" id="bellBtn" aria-label="알림">
      <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      <span class="bell-badge" id="bellBadge" style="display:none;">0</span>
    </button>
    <div class="bell-panel" id="bellPanel">
      <div class="bell-head">🔔 알림</div>
      <ul class="bell-list" id="bellList"><li class="bell-empty">알림이 없습니다.</li></ul>
    </div>`;
  menu.appendChild(li);

  const bellBtn = li.querySelector("#bellBtn");
  const badge = li.querySelector("#bellBadge");
  const panel = li.querySelector("#bellPanel");
  const list = li.querySelector("#bellList");
  let alerts = [];
  const LS = "alertsLastSeen";
  const lastSeen = () => Number(localStorage.getItem(LS) || 0);

  bellBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = panel.classList.toggle("open");
    if (open) { localStorage.setItem(LS, String(Date.now())); updateBadge(); }
  });
  document.addEventListener("click", (e) => { if (!li.contains(e.target)) panel.classList.remove("open"); });

  function updateBadge() {
    const unread = alerts.filter((a) => a.ms > lastSeen()).length;
    if (unread > 0) { badge.textContent = unread > 99 ? "99+" : unread; badge.style.display = "grid"; }
    else badge.style.display = "none";
  }
  function render() {
    if (!alerts.length) { list.innerHTML = `<li class="bell-empty">알림이 없습니다.</li>`; updateBadge(); return; }
    list.innerHTML = alerts.map((a) => `
      <li class="bell-item">
        <span class="bell-ic ${a.type === "calendar" ? "cal" : "notice"}">${a.type === "calendar" ? "📅" : "📢"}</span>
        <div class="bell-txt">
          <strong>${esc(a.title)}</strong>
          <small>${a.type === "calendar" ? "학사일정" : "공지사항"} · ${rel(a.ms)}</small>
        </div>
      </li>`).join("");
    updateBadge();
  }

  onAuthStateChanged(auth, (user) => {
    if (!user) { li.style.display = "none"; return; }
    li.style.display = "";
    onSnapshot(
      query(collection(db, "alerts"), orderBy("createdAt", "desc"), limit(50)),
      (snap) => {
        alerts = snap.docs.map((d) => {
          const v = d.data();
          return {
            title: v.title || "",
            type: v.type || "notice",
            ms: v.createdAt && v.createdAt.toMillis ? v.createdAt.toMillis() : Date.now(),
          };
        });
        render();
      },
      () => {}
    );
  });

  function rel(ms) {
    const s = (Date.now() - ms) / 1000;
    if (s < 60) return "방금";
    if (s < 3600) return Math.floor(s / 60) + "분 전";
    if (s < 86400) return Math.floor(s / 3600) + "시간 전";
    return Math.floor(s / 86400) + "일 전";
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
});
