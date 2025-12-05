#!/bin/bash
cd "$(dirname "$0")"

# Инициализируем git если нужно
if [ ! -d .git ]; then
  git init
fi

# Добавляем все файлы
git add -A

# Коммит
git commit -m "Refactor: вернул preview iframe, запись через Screen Capture API с preferCurrentTab"

# Проверяем remote
if git remote | grep -q origin; then
  # Пробуем push
  git branch -M main 2>/dev/null || true
  git push -u origin main 2>/dev/null || git push 2>/dev/null || echo "⚠️  Нужно настроить remote: git remote add origin <url>"
else
  echo "⚠️  Remote не настроен. Выполните:"
  echo "   git remote add origin <your-repo-url>"
  echo "   git push -u origin main"
fi

echo "✅ Коммит создан!"

