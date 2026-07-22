import { auth, db, ADMIN_EMAIL, emailToName, nameToEmail } from "./firebase-init.js?v=12";
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
import {
  addDoc, collection, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
const PREF_KEY = "dkuAutoLogin";
const BANNER_COLOR_KEY = "dkuBannerColor";
const MASCOT_DISPLAY_KEY = "dkuMascotDisplay";
const DEFAULT_BANNER_COLOR = "#6fa8d6";
const INITIAL_SETUP_KEY = "dkuInitialSetupRequiredUid";
const safeGet = (storage, key) => { try { return storage.getItem(key); } catch { return null; } };
const safeSet = (storage, key, value) => { try { storage.setItem(key, value); } catch {} };
const safeRemove = (storage, key) => { try { storage.removeItem(key); } catch {} };

window.addEventListener("DOMContentLoaded", () => {
  const toggle = $("#autoLoginToggle");
  const status = $("#autoLoginStatus");
  const msg = $("#settingsMsg");
  const passwordHistoryPanel = $("#passwordHistoryPanel");
  const passwordHistoryList = $("#passwordHistoryList");
  const passwordHistoryNote = $("#passwordHistoryNote");
  const memberPasswordResetPanel = $("#memberPasswordResetPanel");
  const adminSettingsGroup = $("#adminSettingsGroup");
  const passwordChangeCard = $("#passwordChangeCard");
  const initialPasswordFormNotice = $("#initialPasswordFormNotice");
  const initialPasswordFormCheck = $("#initialPasswordFormCheck");
  const initialFormCompleted = $("#initialFormCompleted");
  const resourceFormTitle = $("#resourceFormTitle");
  const resourceFormDescription = $("#resourceFormDescription");
  const resourceFormLink = $("#resourceFormLink");
  const changePasswordButton = $("#changePasswordBtn");
  let initialPasswordFlow = false;
  let initialSetupRequiredOnServer = false;
  let user = null;
  let passwordHistorySubscribed = false;

  const formatHistoryTime = (timestamp) => {
    try {
      const date = timestamp?.toDate ? timestamp.toDate() : new Date();
      const pad = (value) => String(value).padStart(2, "0");
      return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    } catch { return ""; }
  };

  const renderPasswordHistory = (items) => {
    if (!passwordHistoryList) return;
    if (!items.length) {
      passwordHistoryList.innerHTML = "";
      passwordHistoryNote.textContent = "기록 기능 적용 이후의 변경 내역이 여기에 표시됩니다.";
      return;
    }
    passwordHistoryNote.textContent = "";
    passwordHistoryList.innerHTML = items.map((item) => `
      <div class="password-history-item">
        <span>🔑</span>
        <div><strong>${escapeHtml(emailToName(item.email) || "계정")}</strong><small>${item.type === "adminReset" ? "관리자 재설정 · " : "직접 변경 · "}${formatHistoryTime(item.changedAt)}</small></div>
      </div>`).join("");
  };

  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));

  const bannerColor = $("#bannerColor");
  const bannerColorReset = $("#bannerColorReset");
  const themeStatus = $("#bannerThemeStatus");
  const selectBannerColor = (color) => {
    const selected = /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT_BANNER_COLOR;
    safeSet(localStorage, BANNER_COLOR_KEY, selected);
    safeRemove(localStorage, "dkuBannerTheme");
    bannerColor.value = selected;
    if (typeof window.applyBannerColor === "function") window.applyBannerColor(selected);
    else location.reload();
    themeStatus.textContent = `${selected.toUpperCase()} 색상을 사용 중입니다.`;
  };
  bannerColor.value = safeGet(localStorage, BANNER_COLOR_KEY) || DEFAULT_BANNER_COLOR;
  themeStatus.textContent = `${bannerColor.value.toUpperCase()} 색상을 사용 중입니다.`;
  bannerColor.addEventListener("input", () => selectBannerColor(bannerColor.value));
  bannerColorReset.addEventListener("click", () => selectBannerColor(DEFAULT_BANNER_COLOR));

  const mascotToggle = $("#mascotDisplayToggle");
  const mascotStatus = $("#mascotDisplayStatus");
  const updateMascotStatus = (enabled) => {
    mascotStatus.textContent = enabled
      ? "단웅이와 단비가 위쪽에 표시됩니다."
      : "단웅이와 단비가 숨겨져 있습니다.";
    mascotStatus.className = `settings-status ${enabled ? "on" : ""}`;
  };
  const savedMascotDisplay = safeGet(localStorage, MASCOT_DISPLAY_KEY) !== "false";
  mascotToggle.checked = savedMascotDisplay;
  updateMascotStatus(savedMascotDisplay);
  mascotToggle.addEventListener("change", () => {
    const enabled = mascotToggle.checked;
    safeSet(localStorage, MASCOT_DISPLAY_KEY, String(enabled));
    document.documentElement.dataset.mascots = enabled ? "show" : "hide";
    document.querySelectorAll(".danwoong-walk-canvas").forEach((canvas) => {
      canvas.hidden = !enabled;
      if (enabled) canvas.style.removeProperty("display");
      else canvas.style.setProperty("display", "none", "important");
    });
    if (typeof window.setMascotDisplay === "function") window.setMascotDisplay(enabled);
    else window.dispatchEvent(new CustomEvent("dkuMascotVisibility", { detail: { visible: enabled } }));
    updateMascotStatus(enabled);
  });

  const showMessage = (text, ok = false) => {
    msg.textContent = text;
    msg.className = `auth-msg ${ok ? "ok" : "err"}`;
    msg.style.display = "block";
  };

  const activateInitialPasswordFlow = () => {
    if (initialPasswordFlow) return;
    initialPasswordFlow = true;
    passwordChangeCard?.classList.add("initial-password-required");
    initialPasswordFormNotice.classList.add("is-required");
    initialPasswordFormCheck.hidden = false;
    resourceFormTitle.textContent = "먼저 Google Form을 작성해 주세요";
    resourceFormDescription.textContent = "26학번 자료실에 사용할 Google 계정 이메일을 제출한 뒤 비밀번호를 변경할 수 있습니다.";
    resourceFormLink.textContent = "Google Form 작성하기 ↗";
    changePasswordButton.disabled = true;
    showMessage("공용 초기 비밀번호는 외부인이 추측하기 쉽습니다. 아래에서 본인만 아는 비밀번호로 변경해 주세요.");
    document.querySelector("#currentPassword")?.focus();
  };

  if (new URLSearchParams(location.search).get("security") === "change-password") {
    activateInitialPasswordFlow();
  }

  initialFormCompleted?.addEventListener("change", () => {
    if (!initialPasswordFlow) return;
    changePasswordButton.disabled = !initialFormCompleted.checked;
  });

  const updateAutoStatus = (enabled) => {
    status.textContent = enabled
      ? "자동 로그인이 켜져 있습니다."
      : "브라우저를 닫으면 로그인이 종료됩니다.";
    status.className = `settings-status ${enabled ? "on" : ""}`;
  };

  const savedAutoLogin = safeGet(localStorage, PREF_KEY) !== "false";
  toggle.checked = savedAutoLogin;
  updateAutoStatus(savedAutoLogin);

  onAuthStateChanged(auth, async (currentUser) => {
    user = currentUser;
    if (!user) location.replace("login.html");
    if (!user) return;
    let setupRequired = safeGet(sessionStorage, INITIAL_SETUP_KEY) === user.uid
      || safeGet(localStorage, INITIAL_SETUP_KEY) === user.uid;
    try {
      const setupSnapshot = await getDoc(doc(db, "initialPasswordSetup", user.uid));
      if (setupSnapshot.exists()) {
        setupRequired = setupSnapshot.data().required === true;
        initialSetupRequiredOnServer = setupRequired;
      }
    } catch (setupError) {
      console.warn("초기 비밀번호 변경 상태를 확인하지 못했습니다.", setupError);
    }
    if (setupRequired) activateInitialPasswordFlow();
    if (user?.email === ADMIN_EMAIL && !passwordHistorySubscribed) {
      adminSettingsGroup.hidden = false;
      memberPasswordResetPanel.hidden = false;
      passwordHistoryPanel.hidden = false;
      passwordHistorySubscribed = true;
      onSnapshot(
        query(collection(db, "passwordChangeEvents"), orderBy("changedAt", "desc"), limit(200)),
        (snapshot) => renderPasswordHistory(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
        (error) => { passwordHistoryNote.textContent = "변경 내역을 불러오지 못했습니다: " + error.message; }
      );
    }
  });

  const generateTemporaryPassword = () => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
    const bytes = crypto.getRandomValues(new Uint8Array(14));
    return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
  };

  $("#generateTemporaryPasswordBtn")?.addEventListener("click", () => {
    const temporary = generateTemporaryPassword();
    $("#memberTemporaryPassword").value = temporary;
    $("#memberTemporaryPasswordConfirm").value = temporary;
    $("#memberTemporaryPassword").focus();
  });

  $("#resetMemberPasswordBtn")?.addEventListener("click", async () => {
    if (!user || user.email !== ADMIN_EMAIL) return;
    const name = $("#memberResetName").value.trim().normalize("NFC");
    const temporary = $("#memberTemporaryPassword").value.normalize("NFC");
    const confirmTemporary = $("#memberTemporaryPasswordConfirm").value.normalize("NFC");
    const adminPassword = $("#adminCurrentPassword").value.normalize("NFC");
    const resetMessage = $("#memberPasswordResetMsg");
    const button = $("#resetMemberPasswordBtn");
    const showResetMessage = (text, ok = false) => {
      resetMessage.textContent = text;
      resetMessage.className = `auth-msg ${ok ? "ok" : "err"}`;
      resetMessage.style.display = "block";
    };

    if (!name) return showResetMessage("비밀번호를 재설정할 회원 이름을 입력해 주세요.");
    if (nameToEmail(name) === ADMIN_EMAIL) return showResetMessage("관리자 계정은 위의 본인 비밀번호 변경 기능을 이용해 주세요.");
    if (temporary.length < 8) return showResetMessage("임시 비밀번호는 8자 이상이어야 합니다.");
    if (temporary !== confirmTemporary) return showResetMessage("임시 비밀번호가 서로 일치하지 않습니다.");
    if (!adminPassword) return showResetMessage("관리자 본인 확인을 위해 현재 비밀번호를 입력해 주세요.");
    if (!(await window.dkuConfirm(`${name} 회원의 비밀번호를 재설정할까요? 기존 비밀번호로는 더 이상 로그인할 수 없습니다.`, {
      title: "회원 비밀번호 재설정",
      confirmText: "재설정",
      danger: true,
    }))) return;

    button.disabled = true;
    try {
      const credential = EmailAuthProvider.credential(user.email, adminPassword);
      await reauthenticateWithCredential(user, credential);
      const idToken = await user.getIdToken(true);
      const response = await fetch("/api/admin-reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          targetEmail: nameToEmail(name),
          newPassword: temporary,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "비밀번호 재설정 서버 요청에 실패했습니다.");
      try {
        await addDoc(collection(db, "passwordChangeEvents"), {
          uid: result.uid,
          email: result.email,
          changedAt: serverTimestamp(),
          type: "adminReset",
          changedBy: user.email,
        });
      } catch (historyError) {
        console.warn("관리자 재설정 내역을 저장하지 못했습니다.", historyError);
      }
      $("#memberResetName").value = "";
      $("#memberTemporaryPassword").value = "";
      $("#memberTemporaryPasswordConfirm").value = "";
      $("#adminCurrentPassword").value = "";
      $("#memberTemporaryPassword").type = "password";
      $("#toggleTemporaryPasswordBtn").textContent = "비밀번호 표시";
      $("#toggleTemporaryPasswordBtn").setAttribute("aria-pressed", "false");
      showResetMessage(`${name} 회원의 비밀번호를 재설정했습니다. 임시 비밀번호를 회원에게 안전하게 전달해 주세요.`, true);
    } catch (error) {
      const message = error.code === "auth/invalid-credential" || error.code === "auth/wrong-password"
        ? "관리자 현재 비밀번호가 올바르지 않습니다."
        : error.message;
      showResetMessage(message || "비밀번호를 재설정하지 못했습니다.");
    } finally {
      button.disabled = false;
    }
  });

  toggle.addEventListener("change", async () => {
    const enabled = toggle.checked;
    toggle.disabled = true;
    try {
      await setPersistence(auth, enabled ? browserLocalPersistence : browserSessionPersistence);
      safeSet(localStorage, PREF_KEY, String(enabled));
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
    if (initialPasswordFlow && !initialFormCompleted?.checked) {
      return showMessage("Google Form을 제출한 뒤 완료 확인에 체크해 주세요.");
    }
    const current = $("#currentPassword").value.normalize("NFC");
    const next = $("#newPassword").value.normalize("NFC");
    const confirmNext = $("#newPasswordConfirm").value.normalize("NFC");
    if (!current) return showMessage("현재 비밀번호를 입력해 주세요.");
    if (next.length < 8) return showMessage("새 비밀번호는 8자 이상이어야 합니다.");
    if (next === "dku1842") return showMessage("공용 초기 비밀번호는 새 비밀번호로 다시 사용할 수 없습니다.");
    if (next !== confirmNext) return showMessage("새 비밀번호가 일치하지 않습니다.");

    const button = $("#changePasswordBtn");
    button.disabled = true;
    const completingInitialSetup = initialPasswordFlow;
    try {
      const credential = EmailAuthProvider.credential(user.email, current);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, next);
      if (completingInitialSetup) {
        try {
          await setDoc(doc(db, "initialPasswordSetup", user.uid), {
            uid: user.uid,
            email: user.email,
            required: false,
            formConfirmed: true,
            completedAt: serverTimestamp(),
          }, { merge: true });
        } catch (setupError) {
          console.warn("초기 비밀번호 변경 완료 상태를 서버에 저장하지 못했습니다.", setupError);
          if (initialSetupRequiredOnServer) {
            throw new Error("비밀번호는 변경되었지만 완료 상태를 저장하지 못했습니다. 인터넷 연결을 확인한 뒤 새 비밀번호로 다시 완료해 주세요.");
          }
        }
        safeRemove(sessionStorage, INITIAL_SETUP_KEY);
        safeRemove(localStorage, INITIAL_SETUP_KEY);
      }
      try {
        await addDoc(collection(db, "passwordChangeEvents"), {
          uid: user.uid,
          email: user.email,
          changedAt: serverTimestamp(),
          type: "selfChange",
          changedBy: user.email,
        });
      } catch (historyError) {
        console.warn("비밀번호 변경 내역을 저장하지 못했습니다.", historyError);
      }
      $("#currentPassword").value = "";
      $("#newPassword").value = "";
      $("#newPasswordConfirm").value = "";
      $("#newPassword").type = "password";
      $("#toggleNewPasswordBtn").textContent = "비밀번호 표시";
      $("#toggleNewPasswordBtn").setAttribute("aria-pressed", "false");
      passwordChangeCard?.classList.remove("initial-password-required");
      initialPasswordFlow = false;
      initialPasswordFormNotice.classList.remove("is-required");
      initialPasswordFormCheck.hidden = true;
      initialFormCompleted.checked = false;
      resourceFormTitle.textContent = "자료실에 추가할 이메일이 있나요?";
      resourceFormDescription.textContent = "Google Form을 이미 작성했다면, 자료실에 추가할 이메일이 있는 경우에만 다시 제출해 주세요.";
      resourceFormLink.textContent = "추가 이메일 제출하기 ↗";
      if (new URLSearchParams(location.search).get("security") === "change-password") {
        history.replaceState(null, "", "settings.html");
      }
      showMessage(completingInitialSetup ? "비밀번호 변경이 완료되었습니다. 홈으로 이동합니다." : "비밀번호가 변경되었습니다.", true);
      if (completingInitialSetup) {
        setTimeout(() => location.replace("index.html"), 800);
      }
    } catch (err) {
      if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password")
        showMessage("현재 비밀번호가 올바르지 않습니다.");
      else showMessage("변경하지 못했습니다: " + (err.message || err.code));
    } finally {
      button.disabled = false;
    }
  });

  $("#settingsLogoutBtn").addEventListener("click", async () => {
    if (!(await window.dkuConfirm("이 기기에서 로그아웃할까요?", {
      title: "로그아웃",
      confirmText: "로그아웃",
    }))) return;
    safeRemove(sessionStorage, "dkuSessionKnown");
    safeRemove(localStorage, "dkuSessionKnown");
    safeRemove(sessionStorage, INITIAL_SETUP_KEY);
    safeRemove(localStorage, INITIAL_SETUP_KEY);
    await signOut(auth);
    location.replace("login.html");
  });
});
