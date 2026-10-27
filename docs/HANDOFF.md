# 작업 이어받기 — Claude Code 용

> 마지막 갱신: 2026-10-27 · 이 문서는 «지금 어디까지 왔고, 다음에 무엇을, 어떻게 확인하나» 만 적는다.
> 규칙은 `CLAUDE.md`, 기기 · 동기화 결정은 `docs/SYNC.md`, 출시 할 일은 `docs/RELEASE.md`.

## 0. 저장소

- GitHub `https://github.com/swonlee615/DeskMate-prod` · 브랜치 `main` (2026-10-27 첫 push)
- `.env.local`(Firebase 설정값) · `_to_delete/`(옛 백업)는 올리지 않는다. 새 기기에서는 `Firebase-연결.command` 로 `.env.local` 을 다시 만든다

## 1. 지금 된 것 (2026-10-27)

| 영역 | 내용 | 주요 파일 |
|---|---|---|
| 근태 코어 | 이벤트만 저장 → 하루는 재생 · 손으로 고치기는 `override` 이벤트 · 자정 넘김 배너 | `src/domain/attendance/` |
| 로그인 · 저장 | Google 로그인 · Firestore(서울) 노션 방식 동기화 · `.env.local` 없으면 이 기기 저장 | `src/data/` |
| PC 화면 | v3 「ONnOFF」 그대로 — 전체 탭 · 캘린더 · 일간 상세 · 우측 집중 타이머 | `src/pc/` (스타일은 `src/v3/styles.css` 원본) |
| 할 일 | 트리 저장 · 보여주기 이월(D+N) · 끝낸 날 = 체크한 화면 · 부분 체크 · ⠿ 끌기 · ⌘Z | `src/domain/todos/tree.ts` · `src/pc/NoteEditor.tsx` |
| 주간 플래너 | PC 「주간」 탭 — 7일 칸 · 묶음 · 미정 · 주 메모 · 콤보/끌기로 옮기기 | `src/domain/todos/week.ts` · `src/pc/WeekPlanner.tsx` |
| D-Day | 전체 뷰 캘린더 아래 · 주간 오른쪽 · 일간 상세 · 창(이모지 · 달력 · 고정 5개 · 아카이브 · 삭제 되돌리기) | `src/domain/dday.ts` · `src/pc/DDay.tsx` |
| 습관 | D-Day 상자 「습관」 탭 · 오늘 패널 고리 · 일간 상세 칩 · 창(주기 · 시작/끝 · 쉬는 날 제외 · 아카이브 · 삭제 되돌리기). 체크는 `done.{날짜}` 필드 | `src/domain/habits.ts` · `src/pc/Habits.tsx` · `src/pc/pickers.tsx` |
| 시간 기록 | 일간 상세 시간표를 끌어 「시간 기록 / 휴게」 · 근무시간 = (출근 구간 ∪ 시간 기록) − 휴게 · 근무 밖 휴게 · 종류 바꾸기 · 겹침 안내 · 되돌리기 | `src/domain/attendance/logs.ts` · `src/pc/DayPage.tsx` |
| 가상 동료 | v3 동료 12명 시뮬레이션(일정 · 1on1 짝) — PC 사이드바 상태 · 우측 「오늘 근무 랭킹」 · 폰 「팀」 탭. 날짜 씨앗이라 저장하지 않고 v3 와 같은 하루 | `src/domain/sim/` · `src/pc/Team.tsx` |
| 모바일 | 근태 · 오늘 할 일 · 타이머 · 하루 고치기 시트 · **주간**(요일별 / 이번 주 할 일 · 지난 요일 접힘 · ⋯ 시트로 날짜 · 묶음 옮기기) | `src/mobile/` |
| 시험 | 99개 (`npm test`) | `*.test.ts` |
| v3 따라잡기 | v3.1.256 까지 분류 · 스타일 원본 3.1.255 | `docs/V3-FOLLOW.md` |

## 2. 다음 할 일 (순서대로)

0. **v3 따라가기 먼저** — `docs/V3-FOLLOW.md` 의 «작업을 시작할 때마다». 남은 «반영» · «확인» 없음 (2026-10-27)

1. ~~모바일 주간~~ 됨 (주 메모 · 딸린 줄 펼치기는 아직 — PC 에서)
2. 시간 기록 나머지 — 할 일에서 이름 고르기 · 카테고리 이름(설정 화면) · 모바일 시간표
   → 동료 나머지(대화 · 허들 · 동료 설정 — v3 `dialogue.js` · `sim.js` 의 _planMessages · _planHuddles) → 검색
3. **배포** — Firebase Hosting (`firebase.json` 있음) · 승인된 도메인 · `authDomain` 교체 (`docs/RELEASE.md` §1)
4. PC 앱 — 같은 리포에 `src-tauri/` 추가 (리포를 나누지 않는다)

남은 자잘한 것은 프로젝트 문서 「deskmate-web-작업현황」 의 «아직 안 옮긴 것» 과 같다:
편집기 여러 줄 고르기 · 이미지 · `@날짜` · 글자 서식 · ⌘⇧Z / 주간 책갈피 · 페이드 / 시각 고르기 목록 / 휴지통 등

## 3. 일하는 방식 (소유자와 정한 것)

- **v3 최신 버전이 정답지다.** v3 원본: `../v2.7.7` (읽기만 — 고치지 않는다. 폴더 이름과 달리 늘 최신 — 지금 v3.1.256). 화면은 `src/index.html` · `src/styles.css` · `src/js/app.js`(화면) · `src/js/worklog.js`(규칙), 문서는 `LOGIC.md` · `DESIGN.md` · `PRD.md` · `CHANGELOG.md`
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
