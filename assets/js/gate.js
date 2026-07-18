/* 사이트 잠금: 로그인한 사람만 내용을 볼 수 있게 함.
   로그인 세션이 알려진 기기에서는 확인 창을 띄우지 않고 뒤에서 검증한다. */

import { auth, db, isConfigured, ADMIN_EMAIL } from "./firebase-init.js?v=12";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const SESSION_KEY = "dkuSessionKnown";
const safeGet = (storage, key) => { try { return storage.getItem(key); } catch { return null; } };
const safeSet = (storage, key, value) => { try { storage.setItem(key, value); } catch {} };
const safeRemove = (storage, key) => { try { storage.removeItem(key); } catch {} };
const hasSessionHint = safeGet(sessionStorage, SESSION_KEY) === "1"
  || (safeGet(localStorage, "dkuAutoLogin") !== "false" && safeGet(localStorage, SESSION_KEY) === "1");
let overlay = null;

function ensureOverlay() {
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "gateOverlay";
  overlay.innerHTML = `
    <div class="gate-box">
      <div class="gate-logo">🔒</div>
      <h2>비공개 페이지</h2>
      <p id="gateMsg">로그인이 필요합니다.</p>
      <a id="gateLogin" class="btn btn-primary" href="login.html" style="display:none;">로그인하러 가기</a>
    </div>`;
  document.documentElement.appendChild(overlay);
  return overlay;
}

function unlock() {
  overlay?.remove();
  overlay = null;
  document.body.classList.remove("locked");
  document.documentElement.classList.add("dku-session-known");
}

function deny(message) {
  document.documentElement.classList.remove("dku-session-known");
  document.body.classList.add("locked");
  const box = ensureOverlay();
  box.querySelector("#gateMsg").textContent = message;
  box.querySelector("#gateLogin").style.display = "inline-flex";
}

if (hasSessionHint) {
  document.body.classList.remove("locked");
}

if (!isConfigured) {
  deny("사이트 설정이 필요합니다.");
} else {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      let approved = user.email === ADMIN_EMAIL;
      if (!approved) {
        try {
          const member = await getDoc(doc(db, "users", user.uid));
          approved = member.exists() && member.data().status === "approved";
        } catch {
          deny("접근 권한을 확인하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
          return;
        }
      }
      if (!approved) {
        safeRemove(sessionStorage, SESSION_KEY);
        safeRemove(localStorage, SESSION_KEY);
        await signOut(auth).catch(() => {});
        deny("승인된 26학번 계정만 이용할 수 있습니다.");
        return;
      }
      safeSet(sessionStorage, SESSION_KEY, "1");
      if (safeGet(localStorage, "dkuAutoLogin") !== "false") safeSet(localStorage, SESSION_KEY, "1");
      unlock();
    } else {
      safeRemove(sessionStorage, SESSION_KEY);
      safeRemove(localStorage, SESSION_KEY);
      deny("이 사이트는 비공개입니다. 로그인해 주세요.");
    }
  });
}
