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
| `1924_savat.sql` | «Savat» в CRM: корзинки, итоги звонков, шаг скрипта — уже применён в Supabase |
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

## Savat — корзинка на сегодня (CRM)

- У каждого своя корзинка на 10 клиентов. «Keyingilarni olish» — CRM берёт сама: сначала тех, кому пора перезвонить, потом новых входящих лидов (форма Meta, ustoz.html), потом «yuqori», потом самых старых. Вручную — «Qoʻlda tanlash» или «🧺 Savatga» в Vazifalar.
- Каждый новый входящий лид (форма Meta, ustoz.html) сразу получает задачу «Qoʻngʻiroq qilish — yangi lid» и поэтому виден в Vazifalar и Savat. Сделки, добавленные вручную в CRM, задачу автоматически не получают.
- Итоги звонка: Gaplashdik, Koʻtarmadi, Qayta qoʻngʻiroq, Uchrashuv, Rad etdi, Notoʻgʻri raqam, Band. Комментарий обязателен. «Koʻtarmadi» и «Band» — снова через 1 час, после 5-й попытки задача закрывается.
- Итог пишется одной транзакцией (функция `crm_qongiroq_yoz`): звонок, задача, удаление из всех корзинок, запись в историю сделки. Если клиента уже закрыл другой человек — будет сообщение, двойной записи не будет.
- Доска внизу — клиенты по последнему итогу. Цель на день — «+ Kunlik maqsad qoʻyish».

## Telegram-бот

Бот `@myflow97_bot`. Уведомление приходит при создании сделки из формы Meta (`crm-lead`), `ustoz.html`, вручную в CRM или через импорт. Больше 5 лидов за один запрос к базе — одно общее сообщение. Для уже настроенного бота выполните обновление из `1924_tg_all_deals.sql` в SQL Editor того же Supabase-проекта.

| Роль | Что видит |
|---|---|
| **Владелец** | меню со всеми ссылками, уведомления о лидах и о кандидатах (прошёл тест на `ishga.html`), команда `/adminlar` |
| **Админ** | одна кнопка «📋 CRM» и уведомления о лидах (в них одна кнопка — открыть CRM) |

- **Как добавить админа:** он открывает бота и жмёт Start → владельцу приходит заявка с кнопками «Подтвердить» / «Отклонить». До подтверждения бот админу ничего не показывает. Отклонённому бот не отвечает.
- **Убрать доступ или вернуть:** владелец пишет боту `/adminlar` — список людей с кнопками.
- **Вход в CRM без пароля:** после подтверждения кнопка «CRM» открывает сайт внутри Telegram и автоматически входит от имени админа. Для включения выполните [инструкцию обновления](TELEGRAM_CRM_LOGIN.md); одного обновления HTML недостаточно.
- Токен бота — только в **Supabase → Edge Functions → Secrets**, имя `TELEGRAM_BOT_TOKEN`. Ни в файлы, ни в чат.
- **Новый владелец** (например, если сменился аккаунт): нажать Start у бота, затем в SQL Editor: `update public.tg_chatlar set rol = 'owner', tasdiqlangan = true where chat_id = <ID>;` (ID: `select chat_id, ism from public.tg_chatlar;`).

## Проверки CRM

Node.js 24+, `pnpm install --frozen-lockfile`, затем `pnpm test`. Проверяются отчёты, повтор частичного импорта, Telegram-вход и права доступа в локальном PostgreSQL (PGlite), без обращения к рабочим данным.
