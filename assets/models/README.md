# 단웅이 3D 모델

두 모델은 `assets/js/danwoong-models.js`에서 Three.js `Group`으로 생성됩니다.

- `createBlueDanwoong()` — 파란색 입체 단웅이
- `createNavyDanwoong()` — 남색 일러스트를 입체화한 단웅이
- `getDanwoongParts(model)` — 애니메이션용 팔, 다리, 눈, 꼬리 회전축 반환
- `disposeDanwoong(model)` — 화면에서 제거할 때 GPU 리소스 정리

각 모델의 정면은 `+Z`, 바닥 높이는 `Y=0`입니다. `Arm_L_Pivot`, `Arm_R_Pivot`, `Leg_L_Pivot`, `Leg_R_Pivot`, `Eye_L`, `Eye_R`, `Tail_Pivot` 이름으로 부품을 찾을 수 있습니다.

`danwoong-preview.html`을 열면 두 모델을 회전해 확인할 수 있습니다. 로컬 파일로 직접 열면 브라우저의 모듈 보안 정책 때문에 작동하지 않을 수 있으므로 웹 서버 또는 배포된 사이트에서 확인하세요.
