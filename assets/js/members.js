/* 동기 명단 (members.html 전용)
   - 이름은 공개 코드에 없고, 로그인한 사람만 볼 수 있는 Firestore "members"에만 저장됨.
   - 추가/삭제는 관리자(정지훈)만 가능. */

import { db, auth, isConfigured, ADMIN_EMAIL } from "./firebase-init.js?v=11";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, addDoc, deleteDoc, doc, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (s) => document.querySelector(s);

window.addEventListener("DOMContentLoaded", () => {
  const grid = $("#memberGrid");
  const note = $("#memberNote");
  const search = $("#memberSearch");
  const adminBar = $("#memberAdmin");
  let members = [];
  let isAdmin = false;
  let subscribed = false;

  if (!isConfigured) {
    note.textContent = "Firebase 설정 후 명단을 볼 수 있습니다.";
    return;
  }

  onAuthStateChanged(auth, (user) => {
    isAdmin = !!user && user.email === ADMIN_EMAIL;
    adminBar.style.display = isAdmin ? "block" : "none";
    if (user && !subscribed) {
      subscribed = true;
      onSnapshot(collection(db, "members"), (snap) => {
        members = snap.docs
          .map((d) => ({ id: d.id, name: typeof d.data().name === "string" ? d.data().name.trim() : "" }))
          .filter((member) => member.name)
          .sort((a, b) => a.name.localeCompare(b.name, "ko"));
        render();
      }, (err) => { note.textContent = "명단을 불러오지 못했습니다: " + err.message; });
    }
    render();
  });

  function render() {
    const q = (search.value || "").trim().toLowerCase();
    const list = members.filter((m) => m.name.toLowerCase().includes(q));
    if (!members.length) {
      grid.innerHTML = "";
      note.textContent = isAdmin
        ? "아직 등록된 이름이 없어요. 위에서 명단을 추가해 주세요."
        : "등록된 명단이 없습니다.";
      return;
    }
    if (!list.length) { grid.innerHTML = ""; note.textContent = "검색 결과가 없습니다."; return; }
    note.textContent = `총 ${members.length}명`;
    grid.innerHTML = list.map((m) => `
      <div class="member">
        <div class="avatar">${esc(m.name[0] || "?")}</div>
        <strong>${esc(m.name)}</strong>
        <span>26학번</span>
        ${isAdmin ? `<button class="mem-del" data-id="${m.id}" title="삭제">🗑</button>` : ""}
      </div>`).join("");
    grid.querySelectorAll(".mem-del").forEach((b) => {
      b.addEventListener("click", async () => {
        if (!(await window.dkuConfirm("이 이름을 명단에서 삭제할까요?", {
          title: "명단에서 삭제",
          confirmText: "삭제",
          danger: true,
        }))) return;
        try { await deleteDoc(doc(db, "members", b.dataset.id)); }
        catch (err) { alert("삭제 실패: " + err.message); }
      });
    });
  }

  search.addEventListener("input", render);

  /* 한 명 추가 */
  $("#maAdd").addEventListener("click", () => addNames([$("#maName").value]));
  $("#maName").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addNames([$("#maName").value]); }
  });
  /* 여러 명 추가 */
  $("#maBulkAdd").addEventListener("click", () => {
    addNames(($("#maBulk").value || "").split(/[\n,]/));
  });

  async function addNames(arr) {
    if (!isAdmin) return alert("관리자만 추가할 수 있습니다.");
    const exist = new Set(members.map((m) => m.name));
    const names = arr.map((s) => s.trim()).filter((s) => s && !exist.has(s));
    const uniq = [...new Set(names)];
    if (!uniq.length) return alert("추가할 새 이름이 없습니다.");
    try {
      for (const name of uniq) {
        await addDoc(collection(db, "members"), { name, createdAt: serverTimestamp() });
      }
      $("#maName").value = "";
      $("#maBulk").value = "";
    } catch (err) { alert("추가 실패: " + err.message); }
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
});
