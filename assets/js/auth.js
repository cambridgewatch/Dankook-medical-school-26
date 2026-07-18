/* 회원가입 / 로그인 로직 (login.html 전용) */

import { auth, db, isConfigured, nameToEmail, emailToName, ADMIN_EMAIL } from "./firebase-init.js?v=12";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  updateProfile,
  browserLocalPersistence,
  browserSessionPersistence,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
const safeGet = (storage, key) => { try { return storage.getItem(key); } catch { return null; } };
const safeSet = (storage, key, value) => { try { storage.setItem(key, value); } catch {} };
const safeRemove = (storage, key) => { try { storage.removeItem(key); } catch {} };
const THROTTLE_KEY = "dkuLoginThrottle";
const MAX_FAILURES = 5;
const LOCK_MS = 5 * 60 * 1000;

function throttleState() {
  try { return JSON.parse(safeGet(localStorage, THROTTLE_KEY) || "null") || {}; }
  catch { return {}; }
}

function remainingLockMs() {
  return Math.max(0, Number(throttleState().lockUntil || 0) - Date.now());
}

function recordLoginFailure() {
  const now = Date.now();
  const previous = throttleState();
  const recent = now - Number(previous.windowStart || 0) < LOCK_MS;
  const count = recent ? Number(previous.count || 0) + 1 : 1;
  safeSet(localStorage, THROTTLE_KEY, JSON.stringify({
    windowStart: recent ? previous.windowStart : now,
    count,
    lockUntil: count >= MAX_FAILURES ? now + LOCK_MS : 0,
  }));
}

async function verifyApproved(user) {
  if (user.email === ADMIN_EMAIL) return true;
  const member = await getDoc(doc(db, "users", user.uid));
  return member.exists() && member.data().status === "approved";
}

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
      safeSet(sessionStorage, "dkuSessionKnown", "1");
      if (safeGet(localStorage, "dkuAutoLogin") !== "false") safeSet(localStorage, "dkuSessionKnown", "1");
      status.style.display = "block";
      $("#loggedInName").textContent = user.displayName || emailToName(user.email) || "동기";
    } else {
      safeRemove(sessionStorage, "dkuSessionKnown");
      safeRemove(localStorage, "dkuSessionKnown");
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
    const lockMs = remainingLockMs();
    if (lockMs > 0) return toast(`로그인 시도가 잠시 제한되었습니다. ${Math.ceil(lockMs / 60000)}분 후 다시 시도해 주세요.`);

    const button = $("#loginForm button[type='submit']");
    button.disabled = true;
    button.textContent = "로그인 중…";

    try {
      /* 설정 페이지에서 선택한 이 기기의 로그인 유지 방식을 적용 */
      const remember = safeGet(localStorage, "dkuAutoLogin") !== "false";
      try {
        await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
      } catch (persistenceError) {
        /* 저장소 제한·시크릿 모드 등으로 유지 설정이 실패해도 로그인은 계속 진행 */
        console.warn("로그인 유지 설정을 적용하지 못했습니다.", persistenceError);
      }
      const credential = await signInWithEmailAndPassword(auth, nameToEmail(name.normalize("NFC")), pw.normalize("NFC"));
      let approved = false;
      try { approved = await verifyApproved(credential.user); }
      catch {
        await signOut(auth).catch(() => {});
        throw Object.assign(new Error("승인 상태 확인 실패"), { code: "auth/approval-check-failed" });
      }
      if (!approved) {
        await signOut(auth);
        throw Object.assign(new Error("승인되지 않은 계정"), { code: "auth/not-approved" });
      }
      safeRemove(localStorage, THROTTLE_KEY);
      safeSet(sessionStorage, "dkuSessionKnown", "1");
      if (remember) safeSet(localStorage, "dkuSessionKnown", "1");
      else safeRemove(localStorage, "dkuSessionKnown");
      if (!credential.user.displayName) {
        await updateProfile(credential.user, { displayName: name.normalize("NFC") });
      }
      const usesSharedPassword = pw.normalize("NFC") === "dku1842";
      toast(usesSharedPassword
        ? "보안을 위해 공용 초기 비밀번호를 개인 비밀번호로 변경해 주세요."
        : `${name} 님, 환영합니다! 이동합니다…`, true);
      setTimeout(() => location.replace(usesSharedPassword ? "settings.html?security=change-password" : "index.html"), 700);
    } catch (err) {
      if (err.code === "auth/not-approved") {
        toast("승인된 26학번 계정만 로그인할 수 있습니다.");
      } else if (err.code === "auth/approval-check-failed") {
        toast("접근 권한을 확인하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
      } else if (
        err.code === "auth/invalid-credential" ||
        err.code === "auth/wrong-password" ||
        err.code === "auth/user-not-found"
      ) {
        recordLoginFailure();
        toast("이름 또는 비밀번호가 올바르지 않습니다.");
      } else toast("로그인 오류: " + (err.message || err.code));
    } finally {
      button.disabled = false;
      button.textContent = "로그인";
    }
  });
});
