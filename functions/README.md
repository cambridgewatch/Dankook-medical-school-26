# 푸시 알림 연결 안내

이 폴더는 공지·일정 알림을 Firebase Cloud Messaging(FCM)으로 발송하는 서버 코드입니다.

## 1. Firebase Console에서 할 일

1. **프로젝트 설정 → Cloud Messaging → Web configuration**에서 **Web Push certificates**의 키 쌍을 생성합니다.
2. 공개 키를 `assets/js/firebase-init.js`의 `WEB_PUSH_VAPID_KEY`에 붙여넣습니다.
3. Cloud Functions 사용을 위해 프로젝트를 Blaze 요금제로 전환합니다. 소규모 사용은 무료 할당량 안에 머무를 수 있지만 결제 계정 연결은 필요할 수 있습니다.

## 2. Firestore 규칙에 추가할 항목

기존 `service cloud.firestore` 안에 다음 블록을 추가합니다.

```
match /pushSubscriptions/{uid}/devices/{deviceId} {
  allow read, create, update, delete: if (isAdmin() || isApproved())
                                     && request.auth.uid == uid;
}
```

## 3. Functions 배포

Firebase CLI에서 아래 순서로 실행합니다.

```
cd functions
npm install
cd ..
firebase login
firebase deploy --only functions
```

배포가 끝나면 설정 화면에서 **푸시 알림 켜기**를 눌러 실제 기기를 등록할 수 있습니다.
