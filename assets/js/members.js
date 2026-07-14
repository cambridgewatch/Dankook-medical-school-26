/* 동기 명단 (members.html 전용)
   - 이름은 공개 코드에 없고, 로그인한 사람만 볼 수 있는 Firestore "members"에만 저장됨.
   - 추가/삭제는 관리자(정지훈)만 가능. */

import { db, auth, isConfigured, ADMIN_EMAIL, ADMIN_NAME, firebaseConfig, nameToEmail } from "./firebase-init.js";
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

  const approvalPanel = $("#approvalPanel");
  const approvalList = $("#approvalList");
  const accountPanel = $("#accountPanel");
  const accountList = $("#accountList");
  const accountCount = $("#accountCount");
  let pendingSub = false;
  let accountsAll = [];
  const STATUS = { approved: ["승인", "#2bb673"], pending: ["대기", "#c8a24b"], rejected: ["거절", "#e2574c"] };

  onAuthStateChanged(auth, (user) => {
    isAdmin = !!user && user.email === ADMIN_EMAIL;
    adminBar.style.display = isAdmin ? "block" : "none";
    approvalPanel.style.display = isAdmin ? "block" : "none";
    accountPanel.style.display = isAdmin ? "block" : "none";
    if (user && !subscribed) {
      subscribed = true;
      onSnapshot(collection(db, "members"), (snap) => {
        members = snap.docs
          .map((d) => ({ id: d.id, name: d.data().name }))
          .sort((a, b) => a.name.localeCompare(b.name, "ko"));
        render();
      }, (err) => { note.textContent = "명단을 불러오지 못했습니다: " + err.message; });
    }
    /* 관리자만 계정(users) 구독 → 승인 대기 + 전체 계정 목록 */
    if (isAdmin && !pendingSub) {
      pendingSub = true;
      onSnapshot(collection(db, "users"), (snap) => {
        accountsAll = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderApprovals(accountsAll.filter((u) => (u.status || "pending") === "pending"));
        renderAccounts(accountsAll);
      });
    }
    render();
  });

  function renderApprovals(pending) {
    if (!pending.length) {
      approvalList.innerHTML = `<li class="none">대기 중인 가입 신청이 없습니다.</li>`;
      return;
    }
    approvalList.innerHTML = pending.map((u) => `
      <li>
        <span class="ap-name">${esc(u.name || "이름없음")}</span>
        <span class="ap-act">
          <button class="ap-ok" data-id="${u.id}">승인</button>
          <button class="ap-no" data-id="${u.id}">거절</button>
        </span>
      </li>`).join("");
    approvalList.querySelectorAll(".ap-ok").forEach((b) =>
      b.addEventListener("click", () => setStatus(b.dataset.id, "approved")));
    approvalList.querySelectorAll(".ap-no").forEach((b) =>
      b.addEventListener("click", () => {
        if (confirm("이 가입 신청을 거절할까요?")) setStatus(b.dataset.id, "rejected");
      }));
  }
  async function setStatus(uid, status) {
    try { await updateDoc(doc(db, "users", uid), { status }); }
    catch (err) { alert("처리 실패: " + err.message); }
  }

  function renderAccounts(all) {
    const sorted = all.slice().sort((a, b) => (a.name || "").localeCompare(b.name || "", "ko"));
    accountCount.textContent = `(${sorted.length}명)`;
    if (!sorted.length) { accountList.innerHTML = `<li class="none">등록된 계정이 없습니다.</li>`; return; }
    accountList.innerHTML = sorted.map((u) => {
      const [label, color] = STATUS[u.status] || STATUS.pending;
      return `<li>
        <span class="ap-name">${esc(u.name || "이름없음")}</span>
        <span class="ap-act">
          <span style="font-size:12px;font-weight:700;padding:3px 11px;border-radius:999px;color:#fff;background:${color};">${label}</span>
          <button class="acc-del" data-id="${u.id}" title="접근 권한 삭제" style="border:0;background:none;cursor:pointer;font-size:14px;opacity:.55;">🗑</button>
        </span>
      </li>`;
    }).join("");
    accountList.querySelectorAll(".acc-del").forEach((b) => {
      b.addEventListener("click", async () => {
        if (!confirm("이 계정의 접근 권한(승인 기록)을 삭제할까요?\n※ 로그인 자체 삭제는 Firebase 콘솔에서 해야 합니다.")) return;
        try { await deleteDoc(doc(db, "users", b.dataset.id)); }
        catch (err) { alert("삭제 실패: " + err.message); }
      });
    });
  }

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

  async function ensureAllAccounts() {
    if (!isAdmin) return alert("관리자만 사용할 수 있습니다.");
    const roster = members.map((m) => (m.name || "").trim()).filter((n) => n && n !== ADMIN_NAME);
    if (!roster.length) return alert("명단이 비어 있어요. 먼저 이름을 넣어 주세요.");
    if (!confirm(
      `명단 ${roster.length}명의 로그인 계정을 만들고 모두 승인합니다.\n` +
      `비밀번호는 각자 '이름2026' 입니다.\n(이미 있는 계정은 비밀번호 확인 후 승인만 처리)\n\n계속할까요?`
    )) return;

    accBtn.disabled = true;
    const orig = accBtn.textContent;
    const secApp = getApps().some((a) => a.name === "secondary")
      ? getApp("secondary")
      : initializeApp(firebaseConfig, "secondary");
    const secAuth = getAuth(secApp);

    let ok = 0, fail = 0, docFail = 0;
    const failNames = [];
    for (let i = 0; i < roster.length; i++) {
      const name = roster[i];
      accBtn.textContent = `처리 중… (${i + 1}/${roster.length})`;
      let uid = null;
      try {
        /* 계정 생성 시도 */
        const cred = await createUserWithEmailAndPassword(secAuth, nameToEmail(name), name + "2026");
        uid = cred.user.uid;
      } catch (err) {
        if (err.code === "auth/email-already-in-use") {
          /* 이미 있으면 비번(이름2026)으로 로그인해 uid 확보 */
          try {
            const cred = await signInWithEmailAndPassword(secAuth, nameToEmail(name), name + "2026");
            uid = cred.user.uid;
          } catch (e2) { fail++; failNames.push(name); continue; }
        } else { fail++; failNames.push(name); continue; }
      }
      /* 승인 기록 저장 */
      try {
        await setDoc(doc(db, "users", uid), { name, status: "approved", createdAt: serverTimestamp() });
        ok++;
      } catch (e) { docFail++; failNames.push(name + "(승인기록실패)"); }
    }
    try { await signOut(secAuth); } catch (e) {}

    accBtn.disabled = false;
    accBtn.textContent = orig;
    let msg = `완료!\n정상 처리(로그인 가능): ${ok}명\n비번 불일치/실패: ${fail}명\n승인기록 저장 실패: ${docFail}명`;
    if (docFail && !ok) msg += `\n\n⚠️ 승인기록이 전부 실패했어요. Firestore 규칙의 users create에 isAdmin() 허용이 빠졌을 수 있어요. 규칙을 다시 게시해 주세요.`;
    if (failNames.length) msg += `\n\n실패 이름: ${failNames.slice(0, 12).join(", ")}${failNames.length > 12 ? " 외" : ""}`;
    msg += `\n\n비밀번호는 각자 '이름2026' 입니다.`;
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
