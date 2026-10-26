# 작업 이어받기 — Claude Code 용

> 마지막 갱신: 2026-10-27 · 이 문서는 «지금 어디까지 왔고, 다음에 무엇을, 어떻게 확인하나» 만 적는다.
> 규칙은 `CLAUDE.md`, 기기 · 동기화 결정은 `docs/SYNC.md`, 출시 할 일은 `docs/RELEASE.md`.

## 0. 처음 한 번 — GitHub 연결 (아직 안 됨)

원격 저장소: `https://github.com/swonlee615/DeskMate-prod.git` (비어 있음, 기본 브랜치 `main`)
이 폴더(WebBase)는 아직 git 저장소가 아니다. 맥에서 Claude Code 가 이렇게 시작한다:

```bash
git init -b main
git remote add origin https://github.com/swonlee615/DeskMate-prod.git
git add -A            # .gitignore 가 node_modules · dist · .env.local 을 뺀다
git status            # .env.local 이 목록에 없는지 꼭 확인
git commit -m "DeskMate 웹 첫 커밋 — 근태 · 타이머 · 할 일 · 주간 플래너"
git push -u origin main
```

- `.env.local`(Firebase 설정값)은 올리지 않는다. 새 기기에서는 `Firebase-연결.command` 로 다시 만든다
- 맥 Claude Code 에서는 git · `npm install` 을 해도 된다 (`CLAUDE.md` «클라우드 세션» 제한은 클라우드에서 이 폴더를 원격으로 만질 때만 해당)

## 1. 지금 된 것 (2026-10-27)

| 영역 | 내용 | 주요 파일 |
|---|---|---|
| 근태 코어 | 이벤트만 저장 → 하루는 재생 · 손으로 고치기는 `override` 이벤트 · 자정 넘김 배너 | `src/domain/attendance/` |
| 로그인 · 저장 | Google 로그인 · Firestore(서울) 노션 방식 동기화 · `.env.local` 없으면 이 기기 저장 | `src/data/` |
| PC 화면 | v3 「ONnOFF」 그대로 — 전체 탭 · 캘린더 · 일간 상세 · 우측 집중 타이머 | `src/pc/` (스타일은 `src/v3/styles.css` 원본) |
| 할 일 | 트리 저장 · 보여주기 이월(D+N) · 끝낸 날 = 체크한 화면 · 부분 체크 · ⠿ 끌기 · ⌘Z | `src/domain/todos/tree.ts` · `src/pc/NoteEditor.tsx` |
| 주간 플래너 | PC 「주간」 탭 — 7일 칸 · 묶음 · 미정 · 주 메모 · 콤보/끌기로 옮기기 | `src/domain/todos/week.ts` · `src/pc/WeekPlanner.tsx` |
| 모바일 | 근태 · 오늘 할 일 · 타이머 · 하루 고치기 시트 (따로 설계한 화면) | `src/mobile/` |
| 시험 | 75개 (`npm test`) | `*.test.ts` |
| v3 따라잡기 | v3.1.254 까지 분류 · 부분 체크 A안(3.1.245) 반영 · 스타일 원본 3.1.254 | `docs/V3-FOLLOW.md` |

## 2. 다음 할 일 (순서대로)

0. **v3 따라가기 먼저** — `docs/V3-FOLLOW.md` 의 «작업을 시작할 때마다». 지금 남은 «반영» · «확인»:
   타이머 다이얼(3.1.244) · 출퇴근에 걸친 휴게 규칙(3.1.239) · 차수 사이 휴게 격자(3.1.241)

1. **습관 · D-Day** — v3 `src/js/app.js` 의 `ddFullHtml` · `hbDayHtml` 계열. 주간 플래너 오른쪽 열 아래 `.wp-ddc` 상자 포함
2. **모바일 주간** — 시안: 하단 탭 · 「요일별 / 이번 주 할 일」 분절 · 지난 요일 접힘 · ⋯ 시트로 날짜 옮기기 (드래그 대신)
3. 시간 기록 (일간 상세 시간표에 끌어서 기록) → 동료 프레즌스 → 검색
4. **배포** — Firebase Hosting (`firebase.json` 있음) · 승인된 도메인 · `authDomain` 교체 (`docs/RELEASE.md` §1)
5. PC 앱 — 같은 리포에 `src-tauri/` 추가 (리포를 나누지 않는다)

남은 자잘한 것은 프로젝트 문서 「deskmate-web-작업현황」 의 «아직 안 옮긴 것» 과 같다:
편집기 여러 줄 고르기 · 이미지 · `@날짜` · 글자 서식 · ⌘⇧Z / 주간 책갈피 · 페이드 / 시각 고르기 목록 / 휴지통 등

## 3. 일하는 방식 (소유자와 정한 것)

- **v3 최신 버전이 정답지다.** v3 원본: `../v2.7.7` (읽기만 — 고치지 않는다. 폴더 이름과 달리 늘 최신 — 지금 v3.1.254). 화면은 `src/index.html` · `src/styles.css` · `src/js/app.js`(화면) · `src/js/worklog.js`(규칙), 문서는 `LOGIC.md` · `DESIGN.md` · `PRD.md` · `CHANGELOG.md`
- PC 화면은 v3 와 **똑같이** — v3 가 그리는 마크업 · 클래스를 찾아 같은 모양으로 React 에 옮긴다. CSS 는 새로 쓰지 않는다
- 사용자 경험이 v3 와 같으면 구조는 개발에 편한 쪽으로 정하고 묻지 않는다. **화면 · 동작이 v3 와 달라질 때만** 소유자에게 묻는다
- 판정 · 규칙은 `src/domain` 에 순수 함수로, 테스트를 먼저. 버튼이 하는 일은 `src/app/useWorkspace.ts` 한 곳 (PC · 모바일 공통)
- 결정을 새로 하면 `docs/SYNC.md` 에 이유와 함께 적는다

## 4. 확인하는 법

```bash
npm test          # 규칙 시험
npm run build     # 타입 검사 + 빌드
npm run dev       # http://localhost:5173  (?ui=mobile · ?ui=pc 로 화면 고정)
```

- 화면은 v3 와 나란히 띄워 비교한다. v3 는 `../v2.7.7/src` 를 정적 서버로 열면 된다
  (예: `cd ../v2.7.7/src && python3 -m http.server 4180` → `http://localhost:4180/index.html`, 데이터는 localStorage `deskmate.state.v2`)
- 새 버전 시험 데이터는 `.env.local` 을 잠시 빼고(이 기기 저장 모드) localStorage `dm.local.events.v1` · `dm.local.blocks.v1` 에 넣는다
- 아직 못 해 본 것: 실제 여러 기기 동시 사용 · 실제 한글 입력기(IME)로 편집기 · 폰 PWA 설치 (배포 후)
