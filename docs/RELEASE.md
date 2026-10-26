# 출시 체크리스트

> 코드로 끝나지 않고 **소유자가 콘솔 · 계약 · 문서로 해야 하는 일**을 모았다.
> ✅ 완료 · ⬜ 남음

## 1. 로그인

| | 항목 | 비고 |
|---|---|---|
| ✅ | 이메일 가입 · 로그인 · 인증 메일 · 비밀번호 재설정 | 인증 전에는 앱 진입 불가 + 서버 규칙도 막음 (`firestore.rules`) |
| ✅ | Google 로그인 | 팝업. 홈 화면 PWA 는 리디렉트 |
| ✅ | Apple 로그인 (코드) | 아래 설정을 해야 동작 |
| ✅ | 로그아웃 시 이 기기 복사본 삭제 · 안 올라간 기록 경고 | 공용 기기 대비 |
| ✅ | 앱 안에서 계정 삭제 (서버 데이터 포함) | App Store 심사 5.1.1(v) · 개인정보 파기 의무 |
| ⬜ | **Apple 로그인 설정** | Apple Developer Program 가입(연 $99) → Identifiers 에서 App ID 에 *Sign in with Apple* 켜기 → **Services ID** 생성(웹용) → Return URL 에 `https://<프로젝트>.firebaseapp.com/__/auth/handler` → **Key** 생성(.p8) → Firebase 콘솔 Authentication › Apple 에 Services ID · Team ID · Key ID · 키 내용 입력 |
| ⬜ | **Google · Apple 버튼을 공식 이미지로 교체** | 지금은 글자 버튼. Apple HIG «Sign in with Apple» · Google «Sign-in branding guidelines» 의 배포 에셋 사용 |
| ⬜ | 인증 · 재설정 메일 발신자 이름 · 문구 | Firebase 콘솔 Authentication › 템플릿. 언어는 코드에서 한국어로 지정됨 |
| ⬜ | 승인된 도메인에 배포 주소 추가 | Authentication › 설정 › 승인된 도메인 |
| ⬜ | `authDomain` 을 배포 도메인으로 | Safari 가 제3자 저장소를 막아 리디렉트 로그인이 실패하는 문제 회피. Firebase Hosting 에 배포하면 해결 |

> 네이티브 iOS 앱을 낼 때: Google 로그인을 넣은 iOS 앱은 **Apple 로그인도 반드시** 넣어야 한다 (App Store 심사 4.8). 이미 들어 있다.

## 2. 개인정보 · 약관 (국내 출시 필수)

| | 항목 | 비고 |
|---|---|---|
| ⬜ | **개인정보처리방침** | 수집 항목(이메일 · 이름 · 근태 · 할 일 · 메모) · 목적 · 보관 기간 · 파기 절차 · 국외 이전(Firebase = Google. 서울 리전이어도 처리 주체는 국외) · 문의처 |
| ⬜ | **이용약관** | 유료화 전이라도 서비스 범위 · 책임 제한 · 계정 해지 |
| ⬜ | 가입 화면에 **필수 동의** | 개인정보 수집 · 이용 동의 + 약관 동의 체크. 문서가 생기면 가입 폼에 붙인다 |
| ⬜ | 앱 사용 기록 수집 고지 (PC 앱 단계) | 앱 이름만 · 서버에는 칸별 결과만 · 끌 수 있음 (v3 PRD §2-2) |

## 3. 서버 · 배포

| | 항목 | 비고 |
|---|---|---|
| ✅ | 서버 규칙 — 본인 데이터만, 인증된 이메일만 | `firestore.rules` 를 콘솔에 게시 |
| ⬜ | Firestore 위치 **asia-northeast3 (서울)** | 만들 때만 정할 수 있다 |
| ⬜ | Firebase Hosting 배포 · https 주소 | 폰 PWA 는 https 에서만 |
| ⬜ | 출시 빌드에 Firebase 설정이 반드시 들어가는지 | 설정이 없으면 «개발 모드(로그인 없음)» 로 돈다 — 배포 스크립트에서 막는다 |
| ⬜ | 일일 백업 | Firestore 예약 백업 (유료 요금제 필요) |
| ⬜ | 오류 수집 | Sentry 무료 등급 등 |
