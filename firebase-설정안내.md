# 🔥 Firebase 설정 안내 (회원가입·로그인·사진 공유)

회원가입/로그인과 "모두가 함께 보는 사진 업로드"가 실제로 작동하려면
무료 백엔드인 **Firebase**를 연결해야 합니다. 아래 순서대로 한 번만 하면 됩니다. (10~15분)

---

## 1단계. Firebase 프로젝트 만들기
1. https://console.firebase.google.com 접속 → 구글 로그인
2. **프로젝트 추가** 클릭 → 이름 입력 (예: `dku-med-26`) → 계속
3. Google 애널리틱스는 꺼도 됩니다 → **프로젝트 만들기**

## 2단계. 웹 앱 등록 & 설정값 복사 ⭐
1. 프로젝트 첫 화면에서 **웹 아이콘 `</>`** 클릭
2. 앱 닉네임 입력 (예: `homepage`) → **앱 등록** (호스팅은 체크 안 해도 됨)
3. 화면에 나오는 **`firebaseConfig`** 코드를 복사합니다. 이렇게 생겼어요:
   ```js
   const firebaseConfig = {
     apiKey: "AIza................",
     authDomain: "dku-med-26.firebaseapp.com",
     projectId: "dku-med-26",
     storageBucket: "dku-med-26.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123...:web:abc..."
   };
   ```
4. 이 값들을 **`assets/js/firebase-init.js`** 파일 위쪽의 `firebaseConfig` 부분에 그대로 붙여넣으세요.
   (`YOUR_API_KEY` 등 적힌 부분을 실제 값으로 교체)

## 3단계. 로그인 기능 켜기 (Authentication)
1. 왼쪽 메뉴 **빌드 → Authentication** → **시작하기**
2. **Sign-in method** 탭 → **이메일/비밀번호** 선택 → **사용 설정** 켜고 저장

## 4단계. 데이터베이스 만들기 (Firestore)
1. 왼쪽 메뉴 **빌드 → Firestore Database** → **데이터베이스 만들기**
2. 위치는 그대로(또는 `asia-northeast3 서울`) → **프로덕션 모드**로 시작 → 만들기
3. 만들어지면 위쪽 **규칙(Rules)** 탭 → 내용을 아래로 **전체 교체** 후 **게시**:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       function isAdmin() {
         return request.auth != null
           && request.auth.token.email == "ueca095eca780ed9b88@dkumed26.com";
       }
       function isApproved() {
         return request.auth != null
           && exists(/databases/$(database)/documents/users/$(request.auth.uid))
           && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.status == "approved";
       }

       match /users/{uid} {
         allow read: if isAdmin() || request.auth.uid == uid;
         allow create: if request.auth.uid == uid
                       && request.resource.data.status == "pending";
         allow update, delete: if isAdmin();
       }
       match /photos/{doc} {
         allow read: if isAdmin() || isApproved();
         allow create: if isAdmin() || isApproved();
         allow delete: if isAdmin() || (isApproved() && request.auth.uid == resource.data.uid);
         allow update: if false;
       }
       match /calendarEvents/{doc} {
         allow read: if isAdmin() || isApproved();
         allow write: if isAdmin();
       }
       match /members/{doc} {
         allow read: if isAdmin() || isApproved();
         allow write: if isAdmin();
       }
       match /notices/{doc} {
         allow read: if isAdmin() || isApproved();
         allow write: if isAdmin();
       }
     }
   }
   ```
   > "사진·일정·명단은 **관리자(정지훈) 또는 승인된 회원만** 보고, 추가/수정은 관리자만" 한다는 뜻입니다.
   > 새로 가입하면 `users`에 `pending`으로 저장되고, 관리자가 **동기 명단 페이지**에서 승인해야 이용할 수 있습니다.

## 5단계. 사진 저장소 = ImgBB (무료, 카드 불필요) ⭐
Firebase의 Storage는 신용카드 등록을 요구하므로, 사진 파일은 무료 이미지 호스팅
**ImgBB**에 저장합니다. (로그인·데이터는 그대로 Firebase 무료 사용)

1. https://imgbb.com 접속 → 우측 상단 **Sign up**으로 무료 가입 (구글 계정 가능)
2. https://api.imgbb.com 접속 → **Get API key** 클릭 → 발급된 키 복사
   (예: `a1b2c3d4e5f6...` 같은 긴 문자열)
3. 이 키를 **`assets/js/firebase-init.js`** 파일의 `IMGBB_API_KEY` 부분에 붙여넣으세요:
   ```js
   export const IMGBB_API_KEY = "여기에-발급받은-키-붙여넣기";
   ```

> 💡 ImgBB 무료 계정은 이미지 저장에 충분하며, 업로드한 사진은 자동으로 인터넷 주소(URL)가
> 만들어져 모든 동기에게 공유됩니다. (Firebase Storage / Blaze 업그레이드 불필요)

## 6단계. 도메인 허용 (중요)
1. **Authentication → Settings → 승인된 도메인(Authorized domains)**
2. 우리 사이트 주소를 추가하세요:
   - `dkumed26.com`
   - `cambridgewatch.github.io`
   - (로컬 테스트용) `localhost`

---

## ✅ 끝! 확인하기
- 사이트 메뉴 **로그인** → 회원가입 (명단에 있는 본인 이름 + 비밀번호)
- 로그인 후 **갤러리**에서 사진 업로드 → 올린 사람 이름과 함께 모두에게 표시됩니다.

## 💡 참고
- `apiKey`는 외부에 공개돼도 괜찮은 값입니다. (보안은 위의 '규칙'이 담당)
- 무료 한도(Spark 요금제)로 충분합니다. 사진은 5GB까지 저장 가능.
- 명단(44명)은 `assets/js/firebase-init.js`의 `ROSTER` 목록에서 관리합니다.
  이름 추가/수정 시 이 목록과 `members.html`을 함께 고쳐 주세요.
