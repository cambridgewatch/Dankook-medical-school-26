/* 알림 페이지 (notify.html 전용)
   - 알림을 공지처럼 카드로 표시. 항목을 누르면 세부내용 펼침(이동 불필요).
   - 확인(펼침)한 알림은 옅어짐(읽음). 날짜+시:분 표시.
   - 관리자만 '전체 알림 삭제'. */

import { db, auth, isConfigured, ADMIN_EMAIL } from "./firebase-init.js?v=11";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, query, orderBy, limit, where, onSnapshot, getDocs, getDoc, deleteDoc, doc,
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
  let isAdmin = false;
  const readSet = getRead();

  if (!isConfigured) { noteEl.textContent = "Firebase 설정 후 알림을 볼 수 있습니다."; return; }

  onAuthStateChanged(auth, (user) => {
    if (!user) return;
    isAdmin = user.email === ADMIN_EMAIL;
    clearBtn.style.display = isAdmin ? "inline-block" : "none";
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

  /* 원본(공지/일정)에서 최신 세부내용을 가져옴. 없으면 알림에 저장된 값 사용. */
  async function fetchDetail(a) {
    try {
      if (a.type === "notice" && a.noticeId) {
        const s = await getDoc(doc(db, "notices", a.noticeId));
        if (s.exists() && s.data().detail) return s.data().detail;
      } else if (a.type === "calendar" && a.date) {
        const s = await getDocs(query(collection(db, "calendarEvents"), where("date", "==", a.date)));
        const m = s.docs.find((d) => (d.data().text || "") === (a.text || a.title));
        if (m && m.data().detail) return m.data().detail;
      }
    } catch (e) {}
    return a.detail || "";
  }

  function render() {
    const shown = dedupe(alerts);
    if (!shown.length) { listEl.innerHTML = ""; noteEl.textContent = "받은 알림이 없습니다."; return; }
    noteEl.textContent = "";
    listEl.innerHTML = shown.map((a) => {
      const read = readSet.has(a.id);
      /* 저장된 세부내용이 있거나, 원본에서 가져올 수 있으면 펼치기 가능 */
      const expandable = !!(a.detail && a.detail.trim()) || (a.type === "notice" ? !!a.noticeId : !!a.date);
      const src = a.type === "calendar" ? "학사일정" : "공지사항";
      return `
        <div class="alert-card ${read ? "read" : ""} ${expandable ? "has-detail" : ""}" data-id="${a.id}" data-loaded="0">
          <div class="alert-head">
            <span class="alert-ic ${a.type === "calendar" ? "cal" : "notice"}">${a.type === "calendar" ? "📅" : "📢"}</span>
            <div class="alert-txt">
              <strong>${esc(a.title)}</strong>
              <small>${src} · ${fmt(a.createdAt)}</small>
            </div>
            ${expandable ? `<span class="alert-chev">▾</span>` : `<span class="alert-dot"></span>`}
            ${isAdmin ? `<button class="alert-del" data-id="${a.id}" title="이 알림 삭제" style="border:0;background:none;cursor:pointer;font-size:15px;opacity:.55;">🗑</button>` : ""}
          </div>
          ${expandable ? `<div class="alert-body">불러오는 중…</div>` : ""}
        </div>`;
    }).join("");

    const byId = Object.fromEntries(shown.map((a) => [a.id, a]));

    listEl.querySelectorAll(".alert-card").forEach((card) => {
      card.querySelector(".alert-head").addEventListener("click", async (e) => {
        if (e.target.closest(".alert-del")) return;
        const id = card.dataset.id;
        if (!readSet.has(id)) { readSet.add(id); saveRead(readSet); card.classList.add("read"); }
        if (!card.classList.contains("has-detail")) return;
        /* 처음 펼칠 때 세부내용 로드 */
        if (card.dataset.loaded === "0") {
          card.dataset.loaded = "1";
          const bodyEl = card.querySelector(".alert-body");
          const d = await fetchDetail(byId[id]);
          bodyEl.innerHTML = d && d.trim() ? esc(d).replace(/\n/g, "<br>") : "세부 내용이 없습니다.";
        }
        card.classList.toggle("open");
      });
    });

    /* 개별 삭제 (관리자) */
    listEl.querySelectorAll(".alert-del").forEach((b) => {
      b.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("이 알림을 삭제할까요?")) return;
        try { await deleteDoc(doc(db, "alerts", b.dataset.id)); }
        catch (err) { alert("삭제 실패: " + err.message); }
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
