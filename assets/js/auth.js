/* 회원가입 / 로그인 로직 (login.html 전용) */

import {
  auth, isConfigured, ROSTER, nameToEmail,
} from "./firebase-init.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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
      const cred = await createUserWithEmailAndPassword(auth, nameToEmail(name), pw);
      await updateProfile(cred.user, { displayName: name });
      toast(`🎉 ${name} 님, 회원가입 완료! 갤러리로 이동합니다…`, true);
      setTimeout(() => (location.href = "gallery.html"), 1200);
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
      await signInWithEmailAndPassword(auth, nameToEmail(name), pw);
      toast(`${name} 님, 환영합니다! 갤러리로 이동합니다…`, true);
      setTimeout(() => (location.href = "gallery.html"), 1000);
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
