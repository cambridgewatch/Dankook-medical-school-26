/* 공지사항 (notices.html 전용)
   - 모든(승인된) 회원: 공지 보기
   - 관리자(정지훈)만: 공지 등록/삭제
   - 데이터: Firebase Firestore (notices) */

import { db, auth, isConfigured, ADMIN_EMAIL } from "./firebase-init.js?v=11";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
const TAG_LABEL = { notice: "필독", event: "행사", acad: "학사", info: "안내" };
const TAG_CLASS = { notice: "", event: "event", acad: "acad", info: "info" };

window.addEventListener("DOMContentLoaded", () => {
  const list = $("#noticeList");
  const note = $("#noticeNote");
  const adminBar = $("#noticeAdmin");
  let isAdmin = false;
  let notices = [];
  let subscribed = false;

  if (!isConfigured) { note.textContent = "Firebase 설정 후 공지를 볼 수 있습니다."; return; }

  onAuthStateChanged(auth, (user) => {
    isAdmin = !!user && user.email === ADMIN_EMAIL;
    adminBar.style.display = isAdmin ? "block" : "none";
    if (user && !subscribed) {
      subscribed = true;
      onSnapshot(query(collection(db, "notices"), orderBy("createdAt", "desc")), (snap) => {
        notices = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        render();
      }, (err) => { note.textContent = "공지를 불러오지 못했습니다: " + err.message; });
    }
    render();
  });

  function render() {
    if (!notices.length) {
      list.innerHTML = "";
      note.textContent = isAdmin ? "아직 공지가 없어요. 위에서 등록해 보세요." : "등록된 공지가 없습니다.";
      return;
    }
    note.textContent = "";
    list.innerHTML = notices.map((n) => {
      const tag = TAG_CLASS[n.tag] || "";
      const date = fmt(n.createdAt);
      const hasDetail = !!(n.detail && n.detail.trim());
      const body = hasDetail ? esc(n.detail).replace(/\n/g, "<br>") : "";
      return `
        <div class="notice-card ${hasDetail ? "has-detail" : ""}">
          <div class="notice-head">
            <span class="tag ${tag}">${TAG_LABEL[n.tag] || "공지"}</span>
            <span class="nt-title">${esc(n.title)}</span>
            <span class="nt-date">${date}</span>
            ${hasDetail ? `<span class="nt-chev">▾</span>` : ""}
            ${isAdmin ? `<button class="notice-del" data-id="${n.id}" title="삭제">🗑</button>` : ""}
          </div>
          ${hasDetail ? `<div class="notice-body">${body}</div>` : ""}
        </div>`;
    }).join("");

    /* 제목 클릭 → 상세 펼치기/접기 */
    list.querySelectorAll(".notice-card.has-detail .notice-head").forEach((h) => {
      h.addEventListener("click", (e) => {
        if (e.target.closest(".notice-del")) return;
        h.parentElement.classList.toggle("open");
      });
    });
    /* 삭제 (관리자) */
    list.querySelectorAll(".notice-del").forEach((b) => {
      b.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("이 공지를 삭제할까요?")) return;
        try { await deleteDoc(doc(db, "notices", b.dataset.id)); }
        catch (err) { alert("삭제 실패: " + err.message); }
      });
    });
  }

  $("#naAdd").addEventListener("click", async () => {
    if (!isAdmin) return alert("관리자만 등록할 수 있습니다.");
    const title = $("#naTitle").value.trim();
    const detail = $("#naDetail").value.trim();
    const tag = $("#naTag").value;
    if (!title) return alert("공지 제목을 입력해 주세요.");
    try {
      await addDoc(collection(db, "notices"), { title, detail, tag, createdAt: serverTimestamp() });
      $("#naTitle").value = "";
      $("#naDetail").value = "";
    } catch (err) { alert("등록 실패: " + err.message); }
  });

  function fmt(ts) {
    try {
      const d = ts && ts.toDate ? ts.toDate() : new Date();
      return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
    } catch { return ""; }
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
});
