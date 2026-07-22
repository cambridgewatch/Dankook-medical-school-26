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
const storageKey = (base, uid) => `${base}:${uid || "guest"}`;
const getStoredSet = (base, uid) => { try { return new Set(JSON.parse(localStorage.getItem(storageKey(base, uid)) || "[]")); } catch { return new Set(); } };
const saveStoredSet = (base, uid, values) => { try { localStorage.setItem(storageKey(base, uid), JSON.stringify([...values])); } catch {} };
/* 다른 사람(비관리자)이 삭제한 알림 = 그 사람 기기에서만 숨김 */
const HKEY = "alertsHidden";

const PER_PAGE = 10;

window.addEventListener("DOMContentLoaded", () => {
  const listEl = document.querySelector("#alertList");
  const noteEl = document.querySelector("#alertNote");
  const clearBtn = document.querySelector("#alertClear");
  const pagerEl = document.querySelector("#alertPager");
  if (!listEl) return;

  let globalAlerts = [];
  let submissionAlerts = [];
  let alerts = [];
  let stopGlobal = null;
  let stopSubmission = null;
  let isAdmin = false;
  let currentUid = "";
  let page = 1;
  let readSet = new Set();
  let hiddenSet = new Set();
  const saveRead = () => saveStoredSet(RKEY, currentUid, readSet);
  const saveHidden = () => saveStoredSet(HKEY, currentUid, hiddenSet);

  if (!isConfigured) { noteEl.textContent = "Firebase 설정 후 알림을 볼 수 있습니다."; return; }

  onAuthStateChanged(auth, (user) => {
    if (!user) return;
    currentUid = user.uid;
    readSet = getStoredSet(RKEY, currentUid);
    hiddenSet = getStoredSet(HKEY, currentUid);
    isAdmin = user.email === ADMIN_EMAIL;
    clearBtn.style.display = "inline-block"; // 삭제(모두)는 누구나 가능(비관리자는 본인만 숨김)
    stopGlobal?.();
    stopSubmission?.();
    stopGlobal = onSnapshot(
      query(collection(db, "alerts"), orderBy("createdAt", "desc"), limit(100)),
      (snap) => {
        globalAlerts = snap.docs.map((d) => ({ id: d.id, ...d.data(), storageId: d.id, sourceCollection: "alerts" }));
        mergeAlerts();
      },
      (err) => { noteEl.textContent = "알림을 불러오지 못했습니다: " + err.message; },
    );
    stopSubmission = onSnapshot(
      query(collection(db, "submissionAlerts"), where("recipientEmail", "==", user.email)),
      (snap) => {
        submissionAlerts = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            storageId: `submission:${d.id}:${data.deliveryId || "1"}`,
            sourceCollection: "submissionAlerts",
          };
        });
        mergeAlerts();
      },
      (err) => { noteEl.textContent = "제출 알림을 불러오지 못했습니다: " + err.message; },
    );
  });

  function mergeAlerts() {
    alerts = [...globalAlerts, ...submissionAlerts]
      .sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
    render();
  }

  function dedupe(list) {
    const seen = new Set(); const out = [];
    for (const a of list) {
      const key = a.type === "submission"
        ? `s:${a.checklistId || a.id}`
        : a.type === "calendar"
        ? `c:${a.calendarEventKey || `${a.date}:${a.text || a.title}`}`
        : `n:${a.noticeId || a.title}`;
      if (seen.has(key)) continue;
      seen.add(key); out.push(a);
    }
    return out;
  }

  function fmt(ts) {
    try {
      const d = ts && ts.toDate ? ts.toDate() : new Date();
      const p = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
    } catch { return ""; }
  }

  function renderPager(totalPages) {
    if (totalPages <= 1) { pagerEl.innerHTML = ""; return; }
    let h = `<button ${page === 1 ? "disabled" : ""} data-p="${page - 1}">‹</button>`;
    for (let i = 1; i <= totalPages; i++) h += `<button class="${i === page ? "active" : ""}" data-p="${i}">${i}</button>`;
    h += `<button ${page === totalPages ? "disabled" : ""} data-p="${page + 1}">›</button>`;
    pagerEl.innerHTML = h;
    pagerEl.querySelectorAll("button[data-p]").forEach((b) => {
      b.addEventListener("click", () => {
        const p = Number(b.dataset.p);
        if (p >= 1 && p <= totalPages && p !== page) { page = p; render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
      });
    });
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
    const all = dedupe(alerts).filter((a) => !hiddenSet.has(a.storageId || a.id));
    if (!all.length) { listEl.innerHTML = ""; noteEl.textContent = "받은 알림이 없습니다."; noteEl.classList.add("empty-state"); pagerEl.innerHTML = ""; return; }
    noteEl.textContent = "";
    noteEl.classList.remove("empty-state");
    const totalPages = Math.ceil(all.length / PER_PAGE);
    if (page > totalPages) page = totalPages;
    const shown = all.slice((page - 1) * PER_PAGE, page * PER_PAGE);
    listEl.innerHTML = shown.map((a) => {
      const storageId = a.storageId || a.id;
      const read = a.read === true || readSet.has(storageId);
      /* 저장된 세부내용이 있거나, 원본에서 가져올 수 있으면 펼치기 가능 */
      const expandable = !!(a.detail && a.detail.trim()) || (a.type === "notice" ? !!a.noticeId : !!a.date);
      const src = a.type === "submission" ? "제출 안내" : (a.type === "calendar" ? "캘린더" : "공지사항");
      const icon = a.type === "submission" ? window.dkuIcon("clipboard") : (a.type === "calendar" ? window.dkuIcon("calendar") : window.dkuIcon("megaphone"));
      return `
        <div class="alert-card ${read ? "read" : ""} ${expandable ? "has-detail" : ""}" data-id="${a.id}" data-storage-id="${storageId}" data-source="${a.sourceCollection || "alerts"}" data-loaded="0">
          <div class="alert-head">
            <span class="alert-ic ${a.type === "calendar" ? "cal" : (a.type === "submission" ? "submission" : "notice")}">${icon}</span>
            <div class="alert-txt">
              <strong>${esc(a.title)}</strong>
              <small>${src} · ${fmt(a.createdAt)}</small>
            </div>
            ${expandable ? `<span class="alert-chev">▾</span>` : `<span class="alert-dot"></span>`}
            <button class="alert-del ${isAdmin ? "alert-del-global" : ""}" data-id="${a.id}" data-storage-id="${storageId}" data-source="${a.sourceCollection || "alerts"}" title="${isAdmin ? "모두에게서 삭제" : "내 목록에서 삭제"}" style="border:0;background:none;cursor:pointer;font-size:12px;font-weight:700;opacity:.72;white-space:nowrap;">${isAdmin ? "모두에게서 삭제" : "삭제"}</button>
          </div>
          ${expandable ? `<div class="alert-body">불러오는 중…</div>` : ""}
        </div>`;
    }).join("");

    const byId = Object.fromEntries(shown.map((a) => [a.storageId || a.id, a]));

    listEl.querySelectorAll(".alert-card").forEach((card) => {
      card.querySelector(".alert-head").addEventListener("click", async (e) => {
        if (e.target.closest(".alert-del")) return;
        const storageId = card.dataset.storageId || card.dataset.id;
        if (!readSet.has(storageId)) { readSet.add(storageId); saveRead(); card.classList.add("read"); }
        if (!card.classList.contains("has-detail")) return;
        const willOpen = !card.classList.contains("open");
        if (willOpen) {
          /* 펼칠 때마다 원본에서 최신 내용을 다시 가져옴(내용 변경 반영) */
          const bodyEl = card.querySelector(".alert-body");
          bodyEl.textContent = "불러오는 중…";
          const d = await fetchDetail(byId[storageId]);
          bodyEl.innerHTML = d && d.trim() ? esc(d).replace(/\n/g, "<br>") : "세부 내용이 없습니다.";
        }
        card.classList.toggle("open");
      });
    });

    /* 개별 삭제: 관리자=전원에게서 삭제(원본), 그 외=본인만 숨김 */
    listEl.querySelectorAll(".alert-del").forEach((b) => {
      b.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = b.dataset.id;
        const storageId = b.dataset.storageId || id;
        const sourceCollection = b.dataset.source || "alerts";
        if (isAdmin) {
          if (!(await window.dkuConfirm("이 알림을 모든 사람의 알림 목록에서 삭제할까요?", {
            title: "모두에게서 삭제",
            confirmText: "삭제",
            danger: true,
          }))) return;
          try { await deleteDoc(doc(db, sourceCollection, id)); }
          catch (err) { alert("삭제에 실패했습니다: " + err.message); }
        } else {
          if (!(await window.dkuConfirm("내 알림 목록에서만 삭제할까요?", {
            title: "내 알림 삭제",
            confirmText: "삭제",
            danger: true,
          }))) return;
          hiddenSet.add(storageId); saveHidden(); render();
        }
      });
    });

    renderPager(totalPages);
  }

  clearBtn.addEventListener("click", async () => {
    if (isAdmin) {
      if (!(await window.dkuConfirm("모든 알림을 삭제할까요? 모든 사람의 알림 목록에서 사라집니다.", {
        title: "모든 알림 삭제",
        confirmText: "모두 삭제",
        danger: true,
      }))) return;
      try {
        const snap = await getDocs(collection(db, "alerts"));
        const submissionSnap = await getDocs(collection(db, "submissionAlerts"));
        await Promise.all([
          ...snap.docs.map((d) => deleteDoc(doc(db, "alerts", d.id))),
          ...submissionSnap.docs.map((d) => deleteDoc(doc(db, "submissionAlerts", d.id))),
        ]);
      } catch (e) { alert("삭제 실패: " + e.message); }
    } else {
      if (!(await window.dkuConfirm("내 화면에서 모든 알림을 지울까요? 다른 사람의 알림에는 영향을 주지 않습니다.", {
        title: "내 알림 모두 삭제",
        confirmText: "모두 삭제",
        danger: true,
      }))) return;
      dedupe(alerts).forEach((a) => hiddenSet.add(a.storageId || a.id));
      saveHidden();
      render();
    }
  });

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function timestampMillis(value) {
    if (value?.toMillis) return value.toMillis();
    if (value?.seconds) return Number(value.seconds) * 1000;
    return 0;
  }
});
