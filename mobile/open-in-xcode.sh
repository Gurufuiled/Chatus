#!/usr/bin/env bash
# Открывает iOS-проект в Xcode: npm, prebuild, pod install, open workspace.
# React Native 0.83 + Expo 55 нуждаются в CocoaPods ≥ 1.13 (visionOS / project_header_files).
# На Mac: brew install cocoapods  — и убедись, что в PATH есть /opt/homebrew/bin или /usr/local/bin.

set -euo pipefail
cd "$(dirname "$0")"

export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.gem/ruby/2.6.0/bin:${PATH}"

if ! command -v pod >/dev/null 2>&1; then
  echo "Ошибка: команда «pod» (CocoaPods) не найдена."
  echo "Установи:  brew install cocoapods"
  echo "Или:      sudo gem install cocoapods   (нужен Ruby ≥ 3 для последних версий)"
  exit 1
fi

POD_VER=$(pod --version | cut -d. -f1-2)
POD_MAJOR=$(echo "$POD_VER" | cut -d. -f1)
POD_MINOR=$(echo "$POD_VER" | cut -d. -f2)
if [[ "${POD_MAJOR}" -lt 1 ]] || { [[ "${POD_MAJOR}" -eq 1 ]] && [[ "${POD_MINOR}" -lt 13 ]]; }; then
  echo "Предупреждение: CocoaPods $(pod --version) часто слишком старый для RN 0.83."
  echo "Обнови:  brew upgrade cocoapods   или поставь свежий gem."
fi

echo "→ npm install"
npm install

if [[ ! -d ios ]]; then
  echo "→ npx expo prebuild --platform ios"
  npx expo prebuild --platform ios
fi

if [[ ! -f ios/Podfile ]]; then
  echo "Нет ios/Podfile. Выполни: npx expo prebuild --platform ios"
  exit 1
fi

if [[ ! -d ios/Pods ]]; then
  echo "→ pod install (в ios/)"
  (cd ios && pod install)
fi

WORKSPACE=$(ls -1 ios/*.xcworkspace 2>/dev/null | head -1 || true)
if [[ -z "${WORKSPACE}" ]]; then
  echo "Не найден ios/*.xcworkspace после pod install."
  exit 1
fi

echo "→ open ${WORKSPACE}"
open "${WORKSPACE}"

echo ""
echo "Дальше:"
echo "  1) Второй терминал: cd \"$(pwd)\" && npx expo start"
echo "  2) Xcode: схема mobile → симулятор → Run (▶)"
