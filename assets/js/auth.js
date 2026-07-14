/* 회원가입 / 로그인 로직 (login.html 전용) */

import {
  auth, db, isConfigured, ROSTER, nameToEmail, ADMIN_EMAIL,
} from "./firebase-init.js?v=11";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  signOut,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, setDoc, getDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (s) => document.querySelector(s);

function toast(msg, ok = false) {
  const box = $("#authMsg");
  box.textContent = msg;
  box.className = "auth-msg " + (ok ? "ok" : "err");
  box.style.display = "block";
}

/* 설정 안 된 경우 안내 */
if (!isConfigured) {
  window.addEventListener("DOMContentLoaded", () => {
    toast("⚠️ 아직 Firebase 설정이 안 됐습니다. firebase-설정안내.md 파일을 참고해 설정을 완료해 주세요.");
  });
}

window.addEventListener("DOMContentLoaded", () => {
  /* 탭 전환 (로그인 / 회원가입) */
  const tabs = document.querySelectorAll(".auth-tab");
  tabs.forEach((t) =>
    t.addEventListener("click", () => {
      tabs.forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      const mode = t.dataset.mode;
      $("#loginForm").style.display = mode === "login" ? "block" : "none";
      $("#signupForm").style.display = mode === "signup" ? "block" : "none";
      $("#authMsg").style.display = "none";
    })
  );

  /* 이미 로그인돼 있으면 안내 */
  onAuthStateChanged(auth, (user) => {
    const status = $("#loggedInBox");
    if (user) {
      status.style.display = "block";
      $("#loggedInName").textContent = user.displayName || "동기";
    } else {
      status.style.display = "none";
    }
  });

  /* 로그아웃 */
  $("#logoutBtn").addEventListener("click", async () => {
    await signOut(auth);
    toast("로그아웃 되었습니다.", true);
  });

  /* 비밀번호 변경 */
  const pwMsg = (msg, ok = false) => {
    const box = $("#pwMsg");
    box.textContent = msg;
    box.className = "auth-msg " + (ok ? "ok" : "err");
    box.style.display = "block";
  };
  $("#changePwBtn").addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return pwMsg("로그인 후 이용해 주세요.");
    const nw = $("#newPw").value.normalize("NFC");
    const nw2 = $("#newPw2").value.normalize("NFC");
    const cur = $("#curPw").value.normalize("NFC");
    if (nw.length < 6) return pwMsg("새 비밀번호는 6자 이상이어야 합니다.");
    if (nw !== nw2) return pwMsg("새 비밀번호가 일치하지 않습니다.");
    const pwSuccess = () => {
      pwMsg("✅ 비밀번호가 성공적으로 변경되었습니다!", true);
      $("#newPw").value = ""; $("#newPw2").value = ""; $("#curPw").value = "";
      alert("✅ 비밀번호 변경 완료!\n새 비밀번호로 로그인해 주세요.");
    };
    try {
      await updatePassword(user, nw);
      pwSuccess();
    } catch (err) {
      if (err.code === "auth/requires-recent-login") {
        /* 로그인한 지 오래됨 → 현재 비밀번호로 재인증 필요 */
        if (!cur) return pwMsg("보안을 위해 '현재 비밀번호'를 입력해 주세요.");
        try {
          const cred = EmailAuthProvider.credential(user.email, cur);
          await reauthenticateWithCredential(user, cred);
          await updatePassword(user, nw);
          pwSuccess();
        } catch (e2) {
          if (e2.code === "auth/wrong-password" || e2.code === "auth/invalid-credential")
            pwMsg("현재 비밀번호가 올바르지 않습니다.");
          else pwMsg("변경 실패: " + (e2.message || e2.code));
        }
      } else if (err.code === "auth/weak-password") {
        pwMsg("비밀번호가 너무 약합니다. (6자 이상)");
      } else {
        pwMsg("변경 실패: " + (err.message || err.code));
      }
    }
  });

  /* 회원가입 */
  $("#signupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isConfigured) return toast("⚠️ Firebase 설정을 먼저 완료해 주세요.");
    const name = $("#suName").value.trim();
    const pw = $("#suPw").value;
    const pw2 = $("#suPw2").value;

    if (!name) return toast("이름을 입력해 주세요.");
    if (ROSTER.length && !ROSTER.includes(name))
      return toast(`'${name}' 님은 26학번 동기 명단에 없습니다. 이름을 정확히 입력해 주세요.`);
    if (pw.length < 6) return toast("비밀번호는 6자 이상이어야 합니다.");
    if (pw !== pw2) return toast("비밀번호가 일치하지 않습니다.");

    try {
      const cred = await createUserWithEmailAndPassword(auth, nameToEmail(name.normalize("NFC")), pw.normalize("NFC"));
      await updateProfile(cred.user, { displayName: name });
      await setDoc(doc(db, "users", cred.user.uid), {
        name, status: "approved", createdAt: serverTimestamp(),
      });
      toast(`🎉 ${name} 님, 회원가입 완료! 이동합니다…`, true);
      setTimeout(() => (location.href = "index.html"), 1000);
    } catch (err) {
      if (err.code === "auth/email-already-in-use")
        toast(`'${name}' 님은 이미 가입돼 있습니다. 로그인을 이용해 주세요.`);
      else if (err.code === "auth/weak-password")
        toast("비밀번호가 너무 약합니다. (6자 이상)");
      else toast("회원가입 오류: " + (err.message || err.code));
    }
  });

  /* 로그인 */
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isConfigured) return toast("⚠️ Firebase 설정을 먼저 완료해 주세요.");
    const name = $("#liName").value.trim();
    const pw = $("#liPw").value;
    if (!name || !pw) return toast("이름과 비밀번호를 입력해 주세요.");

    try {
      await signInWithEmailAndPassword(auth, nameToEmail(name.normalize("NFC")), pw.normalize("NFC"));
      toast(`${name} 님, 환영합니다! 이동합니다…`, true);
      setTimeout(() => (location.href = "index.html"), 800);
    } catch (err) {
      if (
        err.code === "auth/invalid-credential" ||
        err.code === "auth/wrong-password" ||
        err.code === "auth/user-not-found"
      )
        toast("이름 또는 비밀번호가 올바르지 않습니다. (가입을 안 했다면 회원가입을 먼저 해주세요)");
      else toast("로그인 오류: " + (err.message || err.code));
    }
  });
});
