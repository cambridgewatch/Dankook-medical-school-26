# Cloudflare Admin Briefing Worker

맞춤형 GPT Action이 홈페이지의 일정·공지·알림·투표를 읽어 관리자 브리핑을 만들 수 있도록 하는 **별도 읽기 전용 Worker**입니다.

기존 `cloudflare-password-reset` Worker는 수정하지 않습니다.

## 파일

- `worker.js`: 전체 Worker 코드
- `wrangler.toml.example`: Wrangler 설정 예시
- `openapi.yaml`: 맞춤형 GPT Action 스키마
- `GPT-INSTRUCTIONS.md`: 맞춤형 GPT 지침 전문

## Secret과 변수

### 일반 변수

```text
FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID
```

### Cloudflare Secret

```bash
npx wrangler secret put ACTION_AUTH_TOKEN
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT
npx wrangler secret put ADMIN_UID
# 선택: 명단 외에 가려야 할 이름·문구가 있으면 쉼표 또는 줄바꿈으로 입력
npx wrangler secret put REDACT_TERMS
```

입력값:

- `ACTION_AUTH_TOKEN`: 충분히 긴 무작위 서버 간 인증키
- `FIREBASE_SERVICE_ACCOUNT`: Firebase 서비스 계정 JSON 전체
- `ADMIN_UID`: 관리자 Firebase UID
- `REDACT_TERMS`: 선택 항목. 명단 외에 응답에서 가릴 이름이나 문구

어떤 실제 값도 `worker.js`, `wrangler.toml`, GitHub, 맞춤형 GPT 지침에 적지 마세요.

## Rate Limit KV

```bash
npx wrangler kv namespace create RATE_LIMIT
npx wrangler kv namespace create RATE_LIMIT --preview
```

출력된 ID를 `wrangler.toml`의 주석 처리된 KV 영역에 입력하고 주석을 풉니다. KV를 연결하지 않아도 Worker는 isolate 메모리 제한을 사용하지만, 전역적으로 일관된 제한은 KV 연결이 더 안전합니다.

## Route

Cloudflare Dashboard에서 새 Worker에 다음 Route만 연결합니다.

```text
dkumed26.com/api/admin-briefing*
www.dkumed26.com/api/admin-briefing*
```

기존 비밀번호 Worker Route와 겹치지 않도록 합니다.

## 배포

```bash
cd cloudflare-admin-briefing
cp wrangler.toml.example wrangler.toml
# 자리표시자 수정 및 Secret 등록
npx wrangler deploy
```

## 맞춤형 GPT Action

1. GPT 편집 화면의 Actions에서 `openapi.yaml`을 붙여 넣습니다.
2. 인증은 API Key를 선택합니다.
3. Auth Type은 Bearer로 설정합니다.
4. API Key에 `ACTION_AUTH_TOKEN`과 동일한 값을 입력합니다.
5. 지침에는 `GPT-INSTRUCTIONS.md` 전문을 붙여 넣습니다.

## 호출 예시

```bash
curl -H "Authorization: Bearer YOUR_SECRET_HERE"   "https://dkumed26.com/api/admin-briefing?days=7"
```

## 읽기 전용 보장

- GET만 허용
- Firestore 쓰기 API 호출 없음
- 허용된 컬렉션만 명시적으로 조회
- Firestore 원문을 그대로 반환하지 않고 새 객체로 복사
- `members`는 자유 입력 문장 속 실명을 가리는 용도로만 내부 조회하며 명단 자체는 반환하지 않음
- 명단에 등록된 이름과 이메일 형식을 `[이름]`, `[이메일]`로 치환
- UID·작성자·계정 필드 미반환
- 투표는 `votes` 문서 수만 집계
- 첨부파일은 개수만 반환

## 배포 전 확인

- 캘린더의 기본 일정이 Firestore로 이관되어 `calendarEvents/editable-reset-v1` 문서가 있는지 확인합니다. 이 Worker는 브라우저 코드에만 들어 있는 기본 일정 상수를 직접 읽지 않습니다.
- 브리핑 전용 Firebase 서비스 계정을 별도로 만들고 Firestore 읽기 권한만 부여하는 것을 권장합니다.
- 실데이터 테스트에서 `[이름]` 치환과 이메일 제거가 제대로 되는지 확인한 뒤 GPT Action을 연결합니다.
