# 1924 — вакансия администратора

## Файлы

| Файл | Что это |
|---|---|
| `ishga.html` | Страница для кандидатов: рилс о работе + 12 ситуаций. Результат сам падает в базу |
| `admin.html` | Админка: кандидаты, баллы, красные флаги, статусы, заметки, выгрузка CSV |
| `savollar.js` | Вопросы и подсчёт баллов — менять вопросы только здесь |
| `config.js` | Адрес Supabase и publishable-ключ — заполнить один раз |
| `1924_setup.sql` | Таблицы и защита базы — запускается один раз в Supabase |
| `1924_tg_bot.sql` | Telegram-бот: таблица чатов и триггер «новый лид» — уже применён в Supabase |
| `supabase/functions/tg-bot/index.ts` | Код бота (Edge Function `tg-bot`): меню ссылок и уведомления о лидах |

## Запуск

1. **Supabase → New project** «zamonaviy-kasblar». Отдельный проект, не школьный.
2. **SQL Editor** → вставить `1924_setup.sql` → в последней строке заменить `SIZNING_EMAIL@gmail.com` на свой email → **Run**.
3. **Authentication → Users → Add user** → тот же email и пароль → отметить **Auto confirm**.
4. **Authentication → настройки входа** → выключить **Allow new users to sign up**.
5. **Project Settings → API** → скопировать **Project URL** и **Publishable key** → вставить в `config.js`.
   Ключ `service_role` / secret — никогда, ни в файлы, ни в чат.
6. **GitHub** → новый репозиторий → **Add file → Upload files**: `ishga.html`, `admin.html`, `savollar.js`, `config.js` → Commit.
7. **Settings → Pages** → Branch: `main`, папка `/ (root)` → Save.

Через 1–2 минуты:
- кандидатам: `https://<аккаунт>.github.io/<репозиторий>/ishga.html`
- тебе: `https://<аккаунт>.github.io/<репозиторий>/admin.html`

## Проверка

Пройди тест сам с тестовым именем → открой `admin.html` → запись должна появиться. Потом поставь ей статус «Rad etildi» или удали в Table Editor.

## Добавить ещё одного админа

В SQL Editor:

```sql
insert into public.adminlar (email) values ('email@example.com');
```

И создай этому email пользователя в **Authentication → Users**.

## Telegram-бот

Бот `@myflow97_bot`. Уведомление приходит, когда лид пришёл снаружи: форма Meta (`crm-lead`), `ustoz.html`. Сделки, добавленные вручную в CRM или импортом, уведомлений не дают. Больше 5 лидов за раз — одно общее сообщение.

| Роль | Что видит |
|---|---|
| **Владелец** | меню со всеми ссылками, уведомления о лидах и о кандидатах (прошёл тест на `ishga.html`), команда `/adminlar` |
| **Админ** | одна кнопка «📋 CRM» и уведомления о лидах (в них одна кнопка — открыть CRM) |

- **Как добавить админа:** он открывает бота и жмёт Start → владельцу приходит заявка с кнопками «Подтвердить» / «Отклонить». До подтверждения бот админу ничего не показывает. Отклонённому бот не отвечает.
- **Убрать доступ или вернуть:** владелец пишет боту `/adminlar` — список людей с кнопками.
- Токен бота — только в **Supabase → Edge Functions → Secrets**, имя `TELEGRAM_BOT_TOKEN`. Ни в файлы, ни в чат.
- **Новый владелец** (например, если сменился аккаунт): нажать Start у бота, затем в SQL Editor: `update public.tg_chatlar set rol = 'owner', tasdiqlangan = true where chat_id = <ID>;` (ID: `select chat_id, ism from public.tg_chatlar;`).
