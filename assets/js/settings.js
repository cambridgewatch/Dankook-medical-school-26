import { auth } from "./firebase-init.js?v=11";
import {
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const $ = (s) => document.querySelector(s);
const PREF_KEY = "dkuAutoLogin";
const BANNER_THEME_KEY = "dkuBannerTheme";
const BANNER_THEME_LABELS = { navy: "단국 네이비", purple: "보라", green: "초록", burgundy: "버건디", orange: "주황", charcoal: "차콜" };

window.addEventListener("DOMContentLoaded", () => {
  const toggle = $("#autoLoginToggle");
  const status = $("#autoLoginStatus");
  const msg = $("#settingsMsg");
  let user = null;

  const themeButtons = [...document.querySelectorAll(".banner-theme")];
  const themeStatus = $("#bannerThemeStatus");
  const selectTheme = (theme) => {
    const selected = BANNER_THEME_LABELS[theme] ? theme : "charcoal";
    localStorage.setItem(BANNER_THEME_KEY, selected);
    document.documentElement.dataset.bannerTheme = selected;
    themeButtons.forEach((button) => button.classList.toggle("active", button.dataset.theme === selected));
    themeStatus.textContent = `${BANNER_THEME_LABELS[selected]} 배너를 사용 중입니다.`;
  };
  selectTheme(localStorage.getItem(BANNER_THEME_KEY) || "charcoal");
  themeButtons.forEach((button) => button.addEventListener("click", () => selectTheme(button.dataset.theme)));

  const showMessage = (text, ok = false) => {
    msg.textContent = text;
    msg.className = `auth-msg ${ok ? "ok" : "err"}`;
    msg.style.display = "block";
  };

  const updateAutoStatus = (enabled) => {
    status.textContent = enabled
      ? "자동 로그인이 켜져 있습니다."
      : "브라우저를 닫으면 로그인이 종료됩니다.";
    status.className = `settings-status ${enabled ? "on" : ""}`;
  };

  const savedAutoLogin = localStorage.getItem(PREF_KEY) !== "false";
  toggle.checked = savedAutoLogin;
  updateAutoStatus(savedAutoLogin);

  onAuthStateChanged(auth, (currentUser) => {
    user = currentUser;
    if (!user) location.replace("login.html");
  });

  toggle.addEventListener("change", async () => {
    const enabled = toggle.checked;
    toggle.disabled = true;
    try {
      await setPersistence(auth, enabled ? browserLocalPersistence : browserSessionPersistence);
      localStorage.setItem(PREF_KEY, String(enabled));
      updateAutoStatus(enabled);
    } catch (err) {
      toggle.checked = !enabled;
      updateAutoStatus(!enabled);
      alert("자동 로그인 설정을 변경하지 못했습니다: " + (err.message || err.code));
    } finally {
      toggle.disabled = false;
    }
  });

  $("#changePasswordBtn").addEventListener("click", async () => {
    if (!user) return showMessage("로그인 후 이용해 주세요.");
    const current = $("#currentPassword").value.normalize("NFC");
    const next = $("#newPassword").value.normalize("NFC");
    const confirmNext = $("#newPasswordConfirm").value.normalize("NFC");
    if (!current) return showMessage("현재 비밀번호를 입력해 주세요.");
    if (next.length < 6) return showMessage("새 비밀번호는 6자 이상이어야 합니다.");
    if (next !== confirmNext) return showMessage("새 비밀번호가 일치하지 않습니다.");

    const button = $("#changePasswordBtn");
    button.disabled = true;
    try {
      const credential = EmailAuthProvider.credential(user.email, current);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, next);
      $("#currentPassword").value = "";
      $("#newPassword").value = "";
      $("#newPasswordConfirm").value = "";
      showMessage("비밀번호가 변경되었습니다.", true);
    } catch (err) {
      if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password")
        showMessage("현재 비밀번호가 올바르지 않습니다.");
      else showMessage("변경하지 못했습니다: " + (err.message || err.code));
    } finally {
      button.disabled = false;
    }
  });

  $("#settingsLogoutBtn").addEventListener("click", async () => {
    if (!confirm("이 기기에서 로그아웃할까요?")) return;
    sessionStorage.removeItem("dkuSessionKnown");
    localStorage.removeItem("dkuSessionKnown");
    await signOut(auth);
    location.replace("login.html");
  });
});
