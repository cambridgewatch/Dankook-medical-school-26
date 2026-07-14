/* 사이트 잠금: 로그인한 사람만 내용을 볼 수 있게 함. (승인 절차 없음)
   - login.html 에는 적용하지 않음. 그 외 페이지의 <body class="locked"> 를 풀어줌. */

import { auth, isConfigured } from "./firebase-init.js?v=11";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const ov = document.createElement("div");
ov.id = "gateOverlay";
ov.innerHTML = `
  <div class="gate-box">
    <div class="gate-logo">🔒</div>
    <h2>비공개 페이지</h2>
    <p id="gateMsg">로그인 확인 중…</p>
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
  onAuthStateChanged(auth, (user) => {
    if (user) unlock();                 // 로그인만 되어 있으면 열람 허용
    else deny("이 사이트는 비공개입니다. 로그인해 주세요.");
  });
}
