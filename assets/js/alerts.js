/* 알림 벨 (모든 페이지 공통)
   - 헤더에 🔔 벨 + 안 읽은 개수 배지. 클릭하면 알림 페이지(notify.html)로 이동.
   - 목록/세부내용/읽음 처리는 notify.html(notify.js)에서. */

import { db, auth, isConfigured } from "./firebase-init.js?v=11";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, query, orderBy, limit, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const RKEY = "alertsRead";
const getRead = () => { try { return new Set(JSON.parse(localStorage.getItem(RKEY) || "[]")); } catch { return new Set(); } };

window.addEventListener("DOMContentLoaded", () => {
  const menu = document.querySelector(".nav-menu");
  if (!menu || !isConfigured) return;

  const li = document.createElement("li");
  li.className = "bell-li";
  li.style.display = "none";
  li.innerHTML = `
    <button class="bell-btn" id="bellBtn" aria-label="알림 보기">
      <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      <span class="bell-badge" id="bellBadge" style="display:none;">0</span>
    </button>`;
  menu.appendChild(li);

  const bellBtn = li.querySelector("#bellBtn");
  const badge = li.querySelector("#bellBadge");
  bellBtn.addEventListener("click", () => { location.href = "notify.html"; });

  let alerts = [];
  let subscribed = false;

  function dedupe(list) {
    const seen = new Set(); const out = [];
    for (const a of list) {
      const key = a.type === "calendar" ? `c:${a.date}:${a.text || a.title}` : `n:${a.noticeId || a.title}`;
      if (seen.has(key)) continue;
      seen.add(key); out.push(a);
    }
    return out;
  }
  function updateBadge() {
    const read = getRead();
    const unread = dedupe(alerts).filter((a) => !read.has(a.id)).length;
    if (unread > 0) { badge.textContent = unread > 99 ? "99+" : unread; badge.style.display = "grid"; }
    else badge.style.display = "none";
  }

  onAuthStateChanged(auth, (user) => {
    if (!user) { li.style.display = "none"; return; }
    li.style.display = "";
    if (!subscribed) {
      subscribed = true;
      onSnapshot(
        query(collection(db, "alerts"), orderBy("createdAt", "desc"), limit(100)),
        (snap) => { alerts = snap.docs.map((d) => ({ id: d.id, ...d.data() })); updateBadge(); },
        () => {}
      );
    }
  });
});
