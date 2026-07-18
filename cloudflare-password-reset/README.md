# 관리자 회원 비밀번호 재설정 Worker

정적 웹사이트에 Firebase 서비스 계정 비밀키를 노출하지 않고, 관리자만 회원 비밀번호를 재설정하기 위한 Cloudflare Worker입니다.

## 필요한 설정

1. Firebase Console의 **프로젝트 설정 → 서비스 계정**에서 새 비공개 키 JSON을 발급합니다.
2. Cloudflare에서 Worker를 만들고 `worker.js` 전체 내용을 붙여 넣습니다.
3. Worker의 **Settings → Variables and Secrets**에 다음 값을 등록합니다.
   - `ADMIN_EMAIL` 일반 변수: `ueca095eca780ed9b88@dkumed26.com`
   - `ALLOWED_ORIGINS` 일반 변수: `https://dkumed26.com,https://www.dkumed26.com`
   - `FIREBASE_WEB_API_KEY` Secret: Firebase 웹 API 키
   - `FIREBASE_SERVICE_ACCOUNT` Secret: 발급받은 서비스 계정 JSON 전체
4. Worker Route를 `dkumed26.com/api/admin-reset-password*`와 `www.dkumed26.com/api/admin-reset-password*`에 연결합니다.
5. Firebase 서비스 계정 비공개 키 JSON은 GitHub에 올리지 말고, 설정 후 PC에서도 안전하게 삭제하거나 별도 보관합니다.

설정 화면에서는 관리자 현재 비밀번호로 다시 인증한 경우에만 Worker를 호출합니다. Worker도 Firebase ID 토큰, 관리자 이메일, 최근 인증 시각, 승인된 회원 여부를 다시 확인한 뒤 비밀번호를 변경합니다.
