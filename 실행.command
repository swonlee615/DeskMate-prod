#!/bin/bash
# DeskMate Web 개발 서버 실행 — 더블클릭
cd "$(dirname "$0")" || exit 1

if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js 가 없습니다. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해 주세요."
  read -r -p "엔터를 누르면 닫힙니다."
  exit 1
fi

if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then
  echo "▶ 처음 실행 · 패키지 설치 중 (1~2분)…"
  npm install || { read -r -p "설치에 실패했습니다. 엔터를 누르면 닫힙니다."; exit 1; }
  touch node_modules
fi

if [ -f .env.local ]; then echo "▶ Firebase 연결 모드"; else echo "▶ 이 기기에만 저장 모드 (.env.local 없음)"; fi
echo "▶ 브라우저에서 http://localhost:5173 이 열립니다. 끝내려면 이 창을 닫으세요."
( sleep 2; open "http://localhost:5173" ) &
npm run dev
