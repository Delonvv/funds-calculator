# Локальное обновление DCM на Mac

Скрипт открывает страницу Т‑Инвестиций через Chromium на этом Mac, обновляет
`dcm.json`, делает commit и отправляет его в ветку `main`. После push Netlify
получает новую версию сайта обычным способом.

Файл `.github/workflows/update-funds.yml` в комплекте продолжает обновлять
фонды и RUSFAR в GitHub Actions, но больше не запускает проблемный DCM-парсер.

## Перед установкой

1. Клонируйте `Delonvv/funds-calculator` через GitHub Desktop.
2. В GitHub Desktop выполните **Repository → Open in Terminal**.
3. Проверьте доступ: `git pull origin main`.
4. Проверьте Node.js: `node -v`. Нужна версия 22 или новее.

## Установка

В Terminal из корня репозитория:

```bash
chmod +x install-mac-updater.sh Update-DCM.command scripts/run-local-dcm-update.sh
./install-mac-updater.sh
```

## Первая проверка

Запустите:

```bash
./Update-DCM.command
```

Успешный результат заканчивается строкой `dcm.json обновлён и отправлен в GitHub`
или `новых данных нет`. После изменения данных Netlify начнёт новый deploy.

## Расписание и логи

- Понедельник–пятница: 10:00 и 14:00 по локальному времени Mac.
- Лог: `~/Library/Logs/FundsCalculator/dcm-update.log`.
- Ошибки: `~/Library/Logs/FundsCalculator/dcm-update-error.log`.

Проверить регистрацию задания:

```bash
launchctl print gui/$(id -u)/com.delonvv.funds-calculator.dcm-update
```

Запустить задание вручную через `launchd`:

```bash
launchctl kickstart -k gui/$(id -u)/com.delonvv.funds-calculator.dcm-update
```

Mac должен быть включён и иметь доступ к интернету. Если он спит в момент
запуска, macOS выполнит пропущенное задание после пробуждения.
