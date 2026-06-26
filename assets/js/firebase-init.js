/* ===========================================================
   Firebase 초기화 + 공통 설정
   ※ 아래 firebaseConfig 값을 본인 Firebase 프로젝트 값으로 교체하세요.
      (firebase-설정안내.md 파일 참고)
   =========================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ▼▼▼ 여기에 Firebase 콘솔에서 복사한 값을 붙여넣으세요 ▼▼▼ */
export const firebaseConfig = {
  apiKey: "AIzaSyAvsWdMN6GiZOll8AqpAFK1PSFB-R1TGng",
  authDomain: "dankook26-4260a.firebaseapp.com",
  projectId: "dankook26-4260a",
  storageBucket: "dankook26-4260a.firebasestorage.app",
  messagingSenderId: "505380299011",
  appId: "1:505380299011:web:d6ef4fdfd13521405b8936",
  measurementId: "G-JHFSWN10Q2",
};
/* ▲▲▲ 여기까지 교체 ▲▲▲ */

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/* 설정이 안 됐는지 확인용 */
export const isConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY";

/* ImgBB(무료 이미지 호스팅) API 키 — 사진 파일은 여기에 저장됩니다.
   https://api.imgbb.com 에서 무료 가입 후 발급받은 키를 붙여넣으세요. */
export const IMGBB_API_KEY = "6c54866829e7fcc0813ff8de9407f892";
export const imgbbReady = IMGBB_API_KEY !== "YOUR_IMGBB_KEY";

/* 동기 명단(실명)은 개인정보 보호를 위해 코드/HTML에 두지 않습니다.
   이름은 로그인한 관리자만 볼 수 있는 Firestore "members" 컬렉션에만 저장됩니다.
   (이 배열이 비어 있으면 회원가입 시 명단 검증을 건너뜁니다.) */
export const ROSTER = [];

/* 이름(한글)을 Firebase Auth용 이메일로 변환.
   - 한글 이름의 UTF-8 바이트를 16진수로 인코딩 → 항상 같은 이름은 같은 이메일.
   - 덕분에 "같은 이름 중복가입"은 Firebase가 자동으로 막아줌. */
export function nameToEmail(name) {
  const bytes = new TextEncoder().encode(name.trim());
  let hex = "";
  bytes.forEach((b) => (hex += b.toString(16).padStart(2, "0")));
  return `u${hex}@dkumed26.com`;
}

/* 캘린더 관리자(이 사람만 일정을 추가/수정/삭제할 수 있음).
   다른 사람으로 바꾸려면 이름만 바꾸고, Firestore 규칙의 이메일도 함께 바꿔주세요. */
export const ADMIN_NAME = "정지훈";
export const ADMIN_EMAIL = nameToEmail(ADMIN_NAME); // ueca095eca780ed9b88@dkumed26.com
