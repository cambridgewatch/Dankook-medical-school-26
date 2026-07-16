/* 알림 페이지 (notify.html 전용)
   - 알림을 공지처럼 카드로 표시. 항목을 누르면 세부내용 펼침(이동 불필요).
   - 확인(펼침)한 알림은 옅어짐(읽음). 날짜+시:분 표시.
   - 관리자만 '전체 알림 삭제'. */

import { db, auth, isConfigured, ADMIN_EMAIL } from "./firebase-init.js?v=11";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, query, orderBy, limit, onSnapshot, getDocs, deleteDoc, doc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const RKEY = "alertsRead";
const getRead = () => { try { return new Set(JSON.parse(localStorage.getItem(RKEY) || "[]")); } catch { return new Set(); } };
const saveRead = (s) => localStorage.setItem(RKEY, JSON.stringify([...s]));

window.addEventListener("DOMContentLoaded", () => {
  const listEl = document.querySelector("#alertList");
  const noteEl = document.querySelector("#alertNote");
  const clearBtn = document.querySelector("#alertClear");
  if (!listEl) return;

  let alerts = [];
  let subscribed = false;
  const readSet = getRead();

  if (!isConfigured) { noteEl.textContent = "Firebase 설정 후 알림을 볼 수 있습니다."; return; }

  onAuthStateChanged(auth, (user) => {
    if (!user) return;
    clearBtn.style.display = user.email === ADMIN_EMAIL ? "inline-block" : "none";
    if (!subscribed) {
      subscribed = true;
      onSnapshot(
        query(collection(db, "alerts"), orderBy("createdAt", "desc"), limit(100)),
        (snap) => { alerts = snap.docs.map((d) => ({ id: d.id, ...d.data() })); render(); },
        (err) => { noteEl.textContent = "알림을 불러오지 못했습니다: " + err.message; }
      );
    }
  });

  function dedupe(list) {
    const seen = new Set(); const out = [];
    for (const a of list) {
      const key = a.type === "calendar" ? `c:${a.date}:${a.text || a.title}` : `n:${a.noticeId || a.title}`;
      if (seen.has(key)) continue;
      seen.add(key); out.push(a);
    }
    return out;
  }

  function fmt(ts) {
    try {
      const d = ts && ts.toDate ? ts.toDate() : new Date();
      const p = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    } catch { return ""; }
  }

  function render() {
    const shown = dedupe(alerts);
    if (!shown.length) { listEl.innerHTML = ""; noteEl.textContent = "받은 알림이 없습니다."; return; }
    noteEl.textContent = "";
    listEl.innerHTML = shown.map((a) => {
      const read = readSet.has(a.id);
      const hasDetail = !!(a.detail && a.detail.trim());
      const body = hasDetail ? esc(a.detail).replace(/\n/g, "<br>") : "";
      const src = a.type === "calendar" ? "학사일정" : "공지사항";
      return `
        <div class="alert-card ${read ? "read" : ""} ${hasDetail ? "has-detail" : ""}" data-id="${a.id}">
          <div class="alert-head">
            <span class="alert-ic ${a.type === "calendar" ? "cal" : "notice"}">${a.type === "calendar" ? "📅" : "📢"}</span>
            <div class="alert-txt">
              <strong>${esc(a.title)}</strong>
              <small>${src} · ${fmt(a.createdAt)}</small>
            </div>
            ${hasDetail ? `<span class="alert-chev">▾</span>` : `<span class="alert-dot"></span>`}
          </div>
          ${hasDetail ? `<div class="alert-body">${body}</div>` : ""}
        </div>`;
    }).join("");

    listEl.querySelectorAll(".alert-card").forEach((card) => {
      card.querySelector(".alert-head").addEventListener("click", () => {
        if (card.classList.contains("has-detail")) card.classList.toggle("open");
        const id = card.dataset.id;
        if (!readSet.has(id)) { readSet.add(id); saveRead(readSet); card.classList.add("read"); }
      });
    });
  }

  clearBtn.addEventListener("click", async () => {
    if (!confirm("모든 알림을 삭제할까요? (모든 사람의 알림이 사라집니다)")) return;
    try {
      const snap = await getDocs(collection(db, "alerts"));
      await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, "alerts", d.id))));
    } catch (e) { alert("삭제 실패: " + e.message); }
  });

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
});
