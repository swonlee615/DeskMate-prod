# DeskMate Web

PC 앱 · PC 브라우저 · iOS/Android(PWA)가 **같은 코드 하나**를 쓰는 DeskMate 새 버전.
v3(`../v2.7.7`)를 레퍼런스로 옮긴다. 근태 판정 규칙의 마스터는 v3 `LOGIC.md`, 기기·동기화 규칙은 [`docs/SYNC.md`](docs/SYNC.md).

## 처음 한 번 — Firebase 연결 (Google 로그인 · 기기 간 동기화)

1. https://console.firebase.google.com 에서 **프로젝트 추가** (Google 애널리틱스는 꺼도 된다)
2. 왼쪽 **빌드 → Authentication → 시작하기 → Sign-in method → Google** → 사용 설정 → 프로젝트 지원 이메일 선택 → 저장
3. **빌드 → Firestore Database → 데이터베이스 만들기** → 위치 **asia-northeast3 (서울)** → **프로덕션 모드**
4. Firestore 의 **규칙** 탭에 이 폴더의 `firestore.rules` 내용을 통째로 붙여 넣고 **게시**
5. **프로젝트 설정(톱니) → 일반 → 내 앱 → 웹(`</>`)** → 앱 닉네임 아무거나 → 「Firebase 호스팅」은 체크하지 않고 등록
   → 화면에 나오는 `const firebaseConfig = { … };` 덩어리를 복사
6. **`Firebase-연결.command`** 더블클릭 → 복사한 덩어리를 붙여 넣고 엔터 두 번 → `.env.local` 이 만들어진다

## 실행

`실행.command` 를 더블클릭. 처음 한 번은 설치 때문에 1~2분 걸린다. 브라우저에 `http://localhost:5173` 이 열리면 **Google로 계속하기**.

- 로그인 화면에는 지금 **Google 만** 보인다. 이메일 · Apple 은 코드에 있고 `.env.local` 의 `VITE_AUTH_PROVIDERS` 로 켠다
  (Apple 은 Apple 개발자 계정 필요 — `docs/RELEASE.md` §1)
- `.env.local` 이 없으면 «개발 모드 · 이 기기에만 저장» 으로 돈다 (로그인 없음)
- **폰에서 시험하려면 배포가 먼저다.** 홈 화면 추가와 오프라인은 `https://` 주소에서만 동작한다. 다음 단계에서 Firebase Hosting 배포를 붙인다

## 폴더

```
src/domain/attendance/   근태 — 이벤트 재생(replay.ts) · LOGIC.md 규칙(rules.ts) · 손으로 고치기(edit.ts)
src/domain/todos/        할 일 — 트리 · 이월 · 부분 체크(tree.ts) · 주간 플래너(week.ts)
src/data/                로그인 · 저장소(Firestore 노션 방식 / 이 기기 저장)
src/app/                 버튼 동작(useWorkspace) · 타이머 · 화면 고르기 — PC · 모바일 공통
src/pc/                  PC 화면 (v3 그대로) · src/v3/ v3 원본 스타일
src/mobile/              모바일 화면 (따로 설계)
src/ui/                  공통 화면 (로그인 · 계정 · 동기화 표시)
docs/HANDOFF.md          지금 상태 · 다음 할 일 · 확인하는 법
docs/SYNC.md             기기 · 동기화 규칙 (소유자 결정)
docs/RELEASE.md          출시 체크리스트 — 콘솔 · 약관 · 심사 요건
firestore.rules          서버 보안 규칙 — 본인 데이터만
```

## 검사

```
npm test         # 근태 «이상한 하루» + 다기기 회귀 묶음
npm run build    # 타입 검사 + 배포용 빌드
```

## 진행 상황

| 단계 | 내용 | 상태 |
|---|---|---|
| 1 | 골격 · 근태 코어(출퇴근·휴게·차수·2시간 규칙·1분 취소) · 다기기 재생 · 저장소 · 첫 화면 | ✅ |
| 1+ | 로그인 Google · Apple · 이메일 · 인증 · 재설정 · 로그아웃 · 계정 삭제 — **화면에는 Google 만** | ✅ |
| 1++ | 확정 사항 반영: 홈 없음 · 근태 첫 화면 · PC 레일 유지 · 좁은 창 사이드바 접힘 · 폰 하단 탭 · v3 라이트 색 | ✅ |
| 2 | 자정 넘김(`pending`, LOGIC §7) · 차수/휴게 시각 편집 · 근태(연차 등) 지정 | |
| 3 | 뽀모도로 타이머 (시작 시각 저장 → 모든 기기에서 같은 남은 시간) | |
| 4 | 동료 시뮬레이션 이식 (rng · roster · schedule · sim) · 프레즌스 · 팝업 알림 | 일정 · 프레즌스 · 랭킹 ✅ / 대화 · 허들 · 알림 남음 |
| 5 | 할 일 · 이월 · 메모 · 습관 | |
| 6 | Firebase Hosting 배포 · 폰 PWA 시험 · 타이머 푸시 알림 | |
| 7 | PC 앱(Tauri) · 자리비움 감지 · 업무앱 판정 · 메뉴바 | |
