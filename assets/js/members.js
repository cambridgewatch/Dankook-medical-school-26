/* 동기 명단 (members.html 전용)
   - 이름은 공개 코드에 없고, 로그인한 사람만 볼 수 있는 Firestore "members"에만 저장됨.
   - 추가/삭제는 관리자(정지훈)만 가능. */

import { db, auth, isConfigured, ADMIN_EMAIL, ADMIN_NAME, firebaseConfig, nameToEmail } from "./firebase-init.js?v=11";
import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  onAuthStateChanged, getAuth, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, deleteUser, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, addDoc, deleteDoc, updateDoc, doc, setDoc, onSnapshot, serverTimestamp,
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
          .map((d) => ({ id: d.id, name: d.data().name }))
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
        if (!confirm("이 이름을 명단에서 삭제할까요?")) return;
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

  /* 명단 전원 계정 생성 & 승인 (비번=이름2026). 이미 있으면 승인만 채움. */
  const accBtn = $("#maAccounts");
  if (accBtn) accBtn.addEventListener("click", ensureAllAccounts);

  /* 전원 공통 비밀번호 (6자 이상 필수). 바꾸려면 이 값만 수정. */
  const LOGIN_PW = "dku1842";

  async function ensureAllAccounts() {
    if (!isAdmin) return alert("관리자만 사용할 수 있습니다.");
    /* 명단 이름 정리(중복 제거, 관리자 제외) */
    const roster = [...new Set(
      members.map((m) => (m.name || "").trim().normalize("NFC")).filter((n) => n && n !== ADMIN_NAME)
    )];
    if (!roster.length) return alert("명단이 비어 있어요. 먼저 이름을 넣어 주세요.");
    if (!confirm(
      `명단 ${roster.length}명의 로그인 계정을 확인/생성합니다.\n비밀번호는 전원 '${LOGIN_PW}'.\n(이미 있는 계정은 그대로 둡니다)\n\n계속할까요?`
    )) return;

    accBtn.disabled = true;
    const orig = accBtn.textContent;
    const secApp = getApps().some((a) => a.name === "secondary")
      ? getApp("secondary")
      : initializeApp(firebaseConfig, "secondary");
    const secAuth = getAuth(secApp);

    let created = 0, existed = 0, fail = 0;
    const failNames = [];
    for (let i = 0; i < roster.length; i++) {
      const nm = roster[i];
      accBtn.textContent = `확인/생성 중… (${i + 1}/${roster.length})`;
      try {
        await createUserWithEmailAndPassword(secAuth, nameToEmail(nm), LOGIN_PW);
        created++; // 새로 만들어짐
      } catch (err) {
        if (err.code === "auth/email-already-in-use") existed++; // 이미 있음 → 그대로 로그인 가능
        else { fail++; failNames.push(nm); }
      }
    }
    try { await signOut(secAuth); } catch (e) {}

    accBtn.disabled = false;
    accBtn.textContent = orig;
    let msg = `완료!\n새로 만든 계정: ${created}명\n이미 있던 계정: ${existed}명\n실패: ${fail}명`;
    if (failNames.length) msg += `\n\n실패: ${failNames.slice(0, 12).join(", ")}${failNames.length > 12 ? " 외" : ""}`;
    if (fail) msg += `\n\n※ '요청 과다(too many requests)'로 실패했다면 5~10분 뒤 한 번 더 눌러 주세요.`;
    msg += `\n\n로그인: 이름 + 비밀번호 '${LOGIN_PW}'`;
    alert(msg);
  }

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
