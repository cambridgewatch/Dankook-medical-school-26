/* 공지사항 (notices.html 전용)
   - 모든(승인된) 회원: 공지 보기
   - 관리자(정지훈)만: 공지 등록/삭제
   - 데이터: Firebase Firestore (notices) */

import { db, auth, isConfigured, ADMIN_EMAIL } from "./firebase-init.js?v=11";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, addDoc, setDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, where, getDocs, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  normalizeAttachments, validateAttachmentFiles, uploadAttachmentFiles, deleteAttachmentFiles,
  attachmentMarkup, attachmentEditorMarkup, bindAttachmentOpen, formatAttachmentSize,
} from "./attachments.js?v=3";

/* 특정 공지에 연결된 알림 모두 삭제 */
async function deleteAlertsByNotice(id) {
  try {
    const snap = await getDocs(query(collection(db, "alerts"), where("noticeId", "==", id)));
    await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, "alerts", d.id))));
  } catch (e) {}
}

/* 공지 수정 시 이미 발송된 알림도 최신 내용으로 동기화 */
async function syncAlertsByNotice(id, title, detail) {
  const snap = await getDocs(query(collection(db, "alerts"), where("noticeId", "==", id)));
  await Promise.all(snap.docs.map((item) => updateDoc(item.ref, {
    title, detail: detail || "", updatedAt: serverTimestamp(),
  })));
}

const $ = (s) => document.querySelector(s);
const TAG_LABEL = { notice: "필독", event: "행사", acad: "학사", info: "안내" };
const TAG_CLASS = { notice: "", event: "event", acad: "acad", info: "info" };

window.addEventListener("DOMContentLoaded", () => {
  const list = $("#noticeList");
  const note = $("#noticeNote");
  const adminBar = $("#noticeAdmin");
  const pagerEl = $("#noticePager");
  const searchEl = $("#noticeSearch");
  const PER_PAGE = 10;
  let page = 1;
  let isAdmin = false;
  let currentUser = null;
  let notices = [];
  let subscribed = false;
  let editingId = null;
  let editingAttachments = [];
  let removedAttachments = [];
  const filesInput = $("#naFiles");
  const attachmentEditList = $("#naAttachmentEditList");
  const openId = new URLSearchParams(location.search).get("open");
  let openHandled = false;

  function renderPager(totalPages) {
    if (!pagerEl) return;
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

  if (!isConfigured) { note.textContent = "Firebase 설정 후 공지를 볼 수 있습니다."; return; }

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
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
      note.classList.add("empty-state");
      if (pagerEl) pagerEl.innerHTML = "";
      return;
    }
    const keyword = (searchEl?.value || "").trim().toLocaleLowerCase("ko");
    const filtered = keyword
      ? notices.filter((n) => `${n.title || ""} ${n.detail || ""} ${TAG_LABEL[n.tag] || ""}`.toLocaleLowerCase("ko").includes(keyword))
      : notices;
    if (!filtered.length) {
      list.innerHTML = "";
      note.textContent = `“${searchEl.value.trim()}” 검색 결과가 없습니다.`;
      note.classList.add("empty-state");
      if (pagerEl) pagerEl.innerHTML = "";
      return;
    }
    note.textContent = "";
    note.classList.remove("empty-state");
    const ordered = [...filtered].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
    if (openId && !openHandled) {
      const idx = ordered.findIndex((n) => n.id === openId);
      if (idx >= 0) page = Math.floor(idx / PER_PAGE) + 1;
    }
    const totalPages = Math.ceil(ordered.length / PER_PAGE);
    if (page > totalPages) page = totalPages;
    const pageItems = ordered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
    list.innerHTML = pageItems.map((n) => {
      const tag = TAG_CLASS[n.tag] || "";
      const date = fmt(n.createdAt);
      const attachments = normalizeAttachments(n.attachments);
      const hasDetail = !!(n.detail && n.detail.trim()) || attachments.length > 0;
      const detailBody = n.detail && n.detail.trim()
        ? `<div class="post-detail-text">${esc(n.detail).replace(/\n/g, "<br>")}</div>`
        : "";
      const body = `${detailBody}${attachmentMarkup(attachments)}`;
      return `
        <div class="notice-card ${hasDetail ? "has-detail" : ""}" data-id="${n.id}">
          <div class="notice-head">
            <span class="tag ${tag}">${TAG_LABEL[n.tag] || "공지"}</span>
            <span class="nt-title">${esc(n.title)}</span>
          ${n.pinned && !isAdmin ? `<span class="nt-pinned" title="고정된 공지">${window.dkuIcon("pin")}</span>` : ""}
            <span class="nt-date">${date}</span>
            ${hasDetail ? `<span class="nt-chev">▾</span>` : ""}
          ${isAdmin ? `<button class="notice-pin icon-action ${n.pinned ? "active" : ""}" data-id="${n.id}" title="${n.pinned ? "고정 해제" : "공지 고정"}" aria-label="${n.pinned ? "고정 해제" : "공지 고정"}">${window.dkuIcon("pin")}</button>` : ""}
          ${isAdmin ? `<button class="notice-alert icon-action" data-id="${n.id}" data-title="${esc(n.title)}" data-detail="${esc(n.detail || "")}" title="알림 보내기" aria-label="알림 보내기">${window.dkuIcon("bell")}</button>` : ""}
          ${isAdmin ? `<button class="notice-edit icon-action" data-id="${n.id}" title="수정" aria-label="수정">${window.dkuIcon("edit")}</button>` : ""}
          ${isAdmin ? `<button class="notice-del icon-action danger" data-id="${n.id}" title="삭제" aria-label="삭제">${window.dkuIcon("trash")}</button>` : ""}
          </div>
          ${hasDetail ? `<div class="notice-body">${body}</div>` : ""}
        </div>`;
    }).join("");

    /* 제목 클릭 → 상세 펼치기/접기 */
    list.querySelectorAll(".notice-card.has-detail .notice-head").forEach((h) => {
      h.addEventListener("click", (e) => {
        if (e.target.closest(".notice-del") || e.target.closest(".notice-alert") || e.target.closest(".notice-edit") || e.target.closest(".notice-pin")) return;
        h.parentElement.classList.toggle("open");
      });
    });
    bindAttachmentOpen(list);
    list.querySelectorAll(".notice-pin").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        const notice = notices.find((item) => item.id === button.dataset.id);
        if (!notice || !isAdmin) return;
        try {
          await updateDoc(doc(db, "notices", notice.id), {
            pinned: !notice.pinned,
            pinnedAt: !notice.pinned ? serverTimestamp() : null,
          });
        } catch (err) { alert("고정 상태를 변경하지 못했습니다: " + err.message); }
      });
    });
    list.querySelectorAll(".notice-edit").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const notice = notices.find((n) => n.id === b.dataset.id);
        if (!notice) return;
        editingId = notice.id;
        editingAttachments = normalizeAttachments(notice.attachments);
        removedAttachments = [];
        $("#naTitle").value = notice.title || "";
        $("#naDetail").value = notice.detail || "";
        $("#naTag").value = notice.tag || "notice";
        filesInput.value = "";
        renderAttachmentEditor();
    $("#noticeAdmin h3").innerHTML = `${window.dkuIcon("edit", "heading-icon")}공지 수정`;
        $("#naAdd").textContent = "수정 저장";
        adminBar.scrollIntoView({ behavior: "smooth", block: "center" });
        $("#naTitle").focus();
      });
    });
    /* 알림 보내기 (관리자) */
    list.querySelectorAll(".notice-alert").forEach((b) => {
      b.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!(await window.dkuConfirm("이 공지를 알림으로 보낼까요?", {
          title: "공지 알림 보내기",
          confirmText: "보내기",
        }))) return;
        try {
          await deleteAlertsByNotice(b.dataset.id); // 같은 공지의 기존 알림 정리(중복/누적 방지)
          await addDoc(collection(db, "alerts"), { type: "notice", title: b.dataset.title, detail: b.dataset.detail || "", noticeId: b.dataset.id, createdAt: serverTimestamp() });
          alert("알림을 보냈어요!");
        } catch (err) { alert("알림 실패: " + err.message); }
      });
    });
    /* 삭제 (관리자) */
    list.querySelectorAll(".notice-del").forEach((b) => {
      b.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!(await window.dkuConfirm("이 공지를 삭제할까요?", {
          title: "공지 삭제",
          confirmText: "삭제",
          danger: true,
        }))) return;
        try {
          const notice = notices.find((item) => item.id === b.dataset.id);
          await deleteDoc(doc(db, "notices", b.dataset.id));
          await deleteAttachmentFiles(notice?.attachments || []);
          await deleteAlertsByNotice(b.dataset.id); // 공지 삭제 시 관련 알림도 삭제
        } catch (err) { alert("삭제 실패: " + err.message); }
      });
    });

    /* 알림에서 넘어왔을 때: 해당 공지 펼치고 스크롤 */
    if (openId && !openHandled) {
      const card = list.querySelector(`.notice-card[data-id="${openId}"]`);
      if (card) {
        openHandled = true;
        card.classList.add("open");
        setTimeout(() => card.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
      }
    }

    renderPager(totalPages);
  }

  searchEl?.addEventListener("input", () => { page = 1; render(); });
  $("#noticeSearchClear")?.addEventListener("click", () => {
    searchEl.value = "";
    page = 1;
    render();
    searchEl.focus();
  });

  function renderAttachmentEditor() {
    if (!attachmentEditList) return;
    const selected = [...(filesInput?.files || [])];
    const selectedMarkup = selected.map((file) => `
      <span class="attachment-edit-item new">
        <span>＋ ${esc(file.name)}</span><small>${formatAttachmentSize(file.size)}</small>
      </span>`).join("");
    attachmentEditList.innerHTML = attachmentEditorMarkup(editingAttachments) + selectedMarkup;
    attachmentEditList.querySelectorAll("button[data-attachment-index]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.attachmentIndex);
        const [removed] = editingAttachments.splice(index, 1);
        if (removed) removedAttachments.push(removed);
        renderAttachmentEditor();
      });
    });
  }

  filesInput?.addEventListener("change", () => {
    try {
      validateAttachmentFiles(filesInput.files, editingAttachments.length);
      renderAttachmentEditor();
    } catch (error) {
      filesInput.value = "";
      renderAttachmentEditor();
      alert(error.message);
    }
  });

  function resetNoticeEditor() {
    $("#naTitle").value = "";
    $("#naDetail").value = "";
    filesInput.value = "";
    editingId = null;
    editingAttachments = [];
    removedAttachments = [];
    renderAttachmentEditor();
    $("#noticeAdmin h3").innerHTML = `${window.dkuIcon("edit", "heading-icon")}새 공지 작성`;
    $("#naAdd").textContent = "공지 등록";
  }

  $("#naAdd").addEventListener("click", async () => {
    if (!isAdmin) return alert("관리자만 등록할 수 있습니다.");
    const title = $("#naTitle").value.trim();
    const detail = $("#naDetail").value.trim();
    const tag = $("#naTag").value;
    if (!title) return alert("공지 제목을 입력해 주세요.");
    const saveButton = $("#naAdd");
    const previousButtonText = saveButton.textContent;
    let uploadedAttachments = [];
    try {
      saveButton.disabled = true;
      saveButton.textContent = filesInput.files.length ? "사진 업로드 중…" : "저장 중…";
      uploadedAttachments = await uploadAttachmentFiles(
        filesInput.files,
        currentUser,
        "notices",
        editingAttachments.length,
      );
      const attachments = [...editingAttachments, ...uploadedAttachments];
      if (editingId) {
        await updateDoc(doc(db, "notices", editingId), { title, detail, tag, attachments, updatedAt: serverTimestamp() });
        await syncAlertsByNotice(editingId, title, detail);
      } else {
        const noticeRef = doc(collection(db, "notices"));
        await setDoc(noticeRef, { title, detail, tag, attachments, createdAt: serverTimestamp() });
      }
      await deleteAttachmentFiles(removedAttachments);
      resetNoticeEditor();
    } catch (err) {
      await deleteAttachmentFiles(uploadedAttachments);
      alert("등록 실패: " + err.message);
    } finally {
      saveButton.disabled = false;
      if (saveButton.textContent.endsWith("중…")) saveButton.textContent = previousButtonText;
    }
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
