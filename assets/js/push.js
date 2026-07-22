import { app, auth, db, WEB_PUSH_VAPID_KEY, webPushReady } from "./firebase-init.js?v=13";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getMessaging, getToken, deleteToken, onMessage, isSupported,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";
import { doc, setDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (selector) => document.querySelector(selector);
const DEVICE_KEY = "dkuPushDeviceId";

function deviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function deviceRef(user) {
  return doc(db, "pushSubscriptions", user.uid, "devices", deviceId());
}

function setStatus(text, enabled = false) {
  const status = $("#pushStatus");
  if (!status) return;
  status.textContent = text;
  status.className = `settings-status ${enabled ? "on" : ""}`;
}

async function messagingForCurrentApp() {
  if (!webPushReady || !(await isSupported())) return null;
  const registration = await navigator.serviceWorker.ready;
  return { messaging: getMessaging(app), registration };
}

window.addEventListener("DOMContentLoaded", () => {
  const enableButton = $("#pushEnableBtn");
  const disableButton = $("#pushDisableBtn");
  if (!enableButton || !disableButton) return;

  let user = null;
  let messaging = null;

  const refresh = async () => {
    if (!webPushReady) {
      enableButton.disabled = true;
      disableButton.disabled = true;
      setStatus("푸시 발송 연결을 준비 중입니다.");
      return;
    }
    if (!user) return;
    if (!messaging || !("Notification" in window)) {
      enableButton.disabled = true;
      disableButton.disabled = true;
      setStatus("이 브라우저에서는 푸시 알림을 지원하지 않습니다.");
      return;
    }
    if (Notification.permission === "denied") {
      enableButton.disabled = true;
      disableButton.disabled = false;
      setStatus("브라우저 설정에서 알림 권한을 허용해 주세요.");
      return;
    }
    if (Notification.permission === "granted") {
      enableButton.disabled = false;
      disableButton.disabled = false;
      setStatus("이 기기에서 푸시 알림을 받을 수 있습니다.", true);
      return;
    }
    enableButton.disabled = false;
    disableButton.disabled = true;
    setStatus("알림을 켜면 공지와 일정 알림을 앱으로 받을 수 있습니다.");
  };

  onAuthStateChanged(auth, async (signedUser) => {
    user = signedUser;
    if (!user) return;
    const prepared = await messagingForCurrentApp();
    if (prepared) {
      messaging = prepared.messaging;
      onMessage(messaging, (payload) => {
        const title = payload.data?.title || "의과대학 26학번";
        const options = { body: payload.data?.body || "새 알림이 도착했습니다.", icon: "assets/img/icon-192.png" };
        if (Notification.permission === "granted") new Notification(title, options);
      });
    }
    refresh();
  });

  enableButton.addEventListener("click", async () => {
    if (!user || !messaging) return;
    enableButton.disabled = true;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setStatus("알림 권한을 허용해야 푸시를 받을 수 있습니다.");
      const registration = await navigator.serviceWorker.ready;
      const token = await getToken(messaging, { vapidKey: WEB_PUSH_VAPID_KEY, serviceWorkerRegistration: registration });
      if (!token) return setStatus("이 기기용 알림 등록을 만들지 못했습니다.");
      await setDoc(deviceRef(user), {
        token,
        userAgent: navigator.userAgent,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setStatus("이 기기에서 푸시 알림이 켜졌습니다.", true);
      disableButton.disabled = false;
    } catch (error) {
      setStatus(`알림 설정에 실패했습니다: ${error.message || error.code || "알 수 없는 오류"}`);
    } finally {
      enableButton.disabled = false;
    }
  });

  disableButton.addEventListener("click", async () => {
    if (!user) return;
    disableButton.disabled = true;
    try {
      if (messaging) await deleteToken(messaging);
      await deleteDoc(deviceRef(user));
      setStatus("이 기기의 푸시 알림을 껐습니다.");
    } catch (error) {
      setStatus(`알림 해제에 실패했습니다: ${error.message || error.code || "알 수 없는 오류"}`);
    } finally {
      disableButton.disabled = false;
    }
  });
});
