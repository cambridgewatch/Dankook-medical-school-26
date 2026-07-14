/* 사이트 잠금: 로그인한 관리자(정지훈)만 내용을 볼 수 있게 함.
   - login.html 에는 적용하지 않음(로그인하러 들어와야 하므로).
   - 그 외 모든 페이지의 <body class="locked"> 를 풀어줌. */

import { auth, db, isConfigured, ADMIN_EMAIL } from "./firebase-init.js?v=11";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* 잠금 오버레이를 <html>에 붙임 (body가 숨겨져도 보이도록) */
const ov = document.createElement("div");
ov.id = "gateOverlay";
ov.innerHTML = `
  <div class="gate-box">
    <div class="gate-logo">🔒</div>
    <h2>비공개 페이지</h2>
    <p id="gateMsg">접근 권한을 확인하는 중…</p>
    <a id="gateLogin" class="btn btn-primary" href="login.html" style="display:none;">로그인하러 가기</a>
  </div>`;
document.documentElement.appendChild(ov);

function unlock() {
  ov.remove();
  document.body.classList.remove("locked");
}
function deny(msg) {
  const m = document.getElementById("gateMsg");
  const b = document.getElementById("gateLogin");
  if (m) m.textContent = msg;
  if (b) b.style.display = "inline-flex";
}

if (!isConfigured) {
  deny("사이트 설정이 필요합니다.");
} else {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      deny("이 사이트는 비공개입니다. 로그인해 주세요.");
      return;
    }
    if (user.email === ADMIN_EMAIL) {
      unlock(); // 관리자 → 항상 열람 허용
      return;
    }
    /* 일반 회원: 승인된 사람만 열람 가능 */
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      const status = snap.exists() ? snap.data().status : "pending";
      if (status === "approved") unlock();
      else if (status === "rejected") deny("가입이 거절되었습니다.");
      else deny("가입 승인 대기 중입니다. 대표 승인 후 이용할 수 있어요.");
    } catch (e) {
      deny("권한 확인 중 오류가 발생했습니다. 다시 로그인해 주세요.");
    }
  });
}
