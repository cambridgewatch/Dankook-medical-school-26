/* 회원가입 / 로그인 로직 (login.html 전용) */

import { auth, isConfigured, nameToEmail } from "./firebase-init.js?v=11";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
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

  /* 회원가입은 비활성화됨 (계정은 대표가 미리 생성) */

  /* 로그인 */
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isConfigured) return toast("⚠️ Firebase 설정을 먼저 완료해 주세요.");
    const name = $("#liName").value.trim();
    const pw = $("#liPw").value;
    if (!name || !pw) return toast("이름과 비밀번호를 입력해 주세요.");

    const button = $("#loginForm button[type='submit']");
    button.disabled = true;
    button.textContent = "로그인 중…";

    try {
      /* 설정 페이지에서 선택한 이 기기의 로그인 유지 방식을 적용 */
      const remember = localStorage.getItem("dkuAutoLogin") !== "false";
      try {
        await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
      } catch (persistenceError) {
        /* 저장소 제한·시크릿 모드 등으로 유지 설정이 실패해도 로그인은 계속 진행 */
        console.warn("로그인 유지 설정을 적용하지 못했습니다.", persistenceError);
      }
      await signInWithEmailAndPassword(auth, nameToEmail(name.normalize("NFC")), pw.normalize("NFC"));
      toast(`${name} 님, 환영합니다! 이동합니다…`, true);
      setTimeout(() => location.replace("/"), 500);
    } catch (err) {
      if (
        err.code === "auth/invalid-credential" ||
        err.code === "auth/wrong-password" ||
        err.code === "auth/user-not-found"
      )
        toast("이름 또는 비밀번호가 올바르지 않습니다.");
      else toast("로그인 오류: " + (err.message || err.code));
    } finally {
      button.disabled = false;
      button.textContent = "로그인";
    }
  });
});
