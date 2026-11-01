#!/bin/bash
# DeskMate Web 배포 — 더블클릭 (Firebase Hosting · 서버 규칙)
# 하는 일: 시험 → 빌드 → Firebase 설정이 들어갔는지 확인 → 올리기. 하나라도 실패하면 올리지 않는다
cd "$(dirname "$0")" || exit 1
fail() { echo; echo "✗ $1"; read -r -p "엔터를 누르면 닫힙니다."; exit 1; }

command -v npm >/dev/null 2>&1 || fail "Node.js 가 없습니다. https://nodejs.org 에서 LTS 버전을 설치해 주세요."
[ -f .env.local ] || fail ".env.local 이 없습니다 — 이대로 빌드하면 «개발 모드(로그인 없음)» 로 올라갑니다. Firebase-연결.command 를 먼저 실행해 주세요."
PROJECT=$(grep -o 'VITE_FB_PROJECT_ID=.*' .env.local | cut -d= -f2)
[ -n "$PROJECT" ] || fail ".env.local 에 VITE_FB_PROJECT_ID 가 없습니다."

if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then
  echo "▶ 패키지 설치 중…"; npm install || fail "패키지 설치에 실패했습니다."; touch node_modules
fi

echo "▶ 1/4 시험"
npm test --silent || fail "시험이 실패해서 올리지 않았습니다."
echo "▶ 2/4 빌드"
npm run build --silent || fail "빌드가 실패해서 올리지 않았습니다."
grep -rq "$PROJECT" dist/assets || fail "빌드에 Firebase 설정이 안 들어갔습니다 — 올리지 않았습니다."

echo "▶ 3/4 Firebase 로그인 확인"
if ! npx -y firebase-tools@14 projects:list >/dev/null 2>&1; then
  echo "  처음 한 번 Firebase 로그인이 필요합니다. 브라우저가 열리면 DeskMate 프로젝트가 있는 Google 계정으로 로그인해 주세요."
  npx -y firebase-tools@14 login || fail "로그인하지 못했습니다."
fi

echo "▶ 4/4 올리기 ($PROJECT)"
npx -y firebase-tools@14 deploy --only hosting,firestore:rules --project "$PROJECT" || fail "올리기에 실패했습니다."
echo
echo "✓ 배포했습니다 → https://$PROJECT.web.app"
read -r -p "엔터를 누르면 닫힙니다."
