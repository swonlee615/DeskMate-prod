#!/bin/bash
# Firebase 설정값을 붙여 넣어 .env.local 을 만든다 — 더블클릭
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 가 없습니다. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해 주세요."
  read -r -p "엔터를 누르면 닫힙니다."
  exit 1
fi

echo "Firebase 콘솔 → 프로젝트 설정(톱니) → 일반 → 내 앱 → SDK 설정 및 구성 → 「구성」"
echo "에 나오는  const firebaseConfig = { ... };  덩어리를 통째로 복사해서 아래에 붙여 넣으세요."
echo "(붙여 넣은 뒤 엔터를 한두 번 누르면 끝납니다)"
echo "------------------------------------------------------------"
node scripts/write-env.mjs
status=$?
echo "------------------------------------------------------------"
if [ $status -eq 0 ]; then
  echo "이제 「실행.command」 를 더블클릭하면 Google 로그인 화면이 뜹니다."
fi
read -r -p "엔터를 누르면 닫힙니다."
