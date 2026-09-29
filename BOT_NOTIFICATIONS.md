# Уведомления о новых сделках в Telegram

CRM отправляет уведомление после создания новой сделки. При массовом импорте создаётся одно сообщение со списком добавленных лидов. Уведомление содержит имя, телефон, воронку, источник и номер сделки.

## Подготовка Telegram

1. Создай бота через [@BotFather](https://t.me/BotFather) и сохрани выданный токен.
2. Открой своего бота в личном чате и отправь ему `/start`.
3. Узнай свой личный chat ID. Например, в PowerShell запусти команду ниже, введи токен только в локальном запросе, а затем найди `message.chat.id` в ответе:

```powershell
$telegramToken = Read-Host "Введи токен бота локально"
Invoke-RestMethod "https://api.telegram.org/bot$telegramToken/getUpdates" | ConvertTo-Json -Depth 8
Remove-Variable telegramToken
```

Не отправляй токен в чат, не добавляй его в GitHub и не вставляй в `config.js`.

## Секреты Supabase

В правильном проекте Supabase открой **Edge Functions → Secrets** и добавь:

- `TELEGRAM_BOT_TOKEN` — токен от BotFather.
- `TELEGRAM_CHAT_ID` — твой личный chat ID из шага выше.

Функция использует эти значения только на сервере. Вызов также проверяет действующую сессию CRM и RPC `is_admin`.

## Развёртывание

Разверни функцию `telegram-new-lead` из файла `supabase/functions/telegram-new-lead/index.ts` в том же Supabase-проекте, который указан в `config.js`. Оставь проверку JWT включённой. После добавления секретов создай тестовую сделку в CRM и проверь, что сообщение пришло в личный чат.
