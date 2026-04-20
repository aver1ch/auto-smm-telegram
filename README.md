# Auto SMM Telegram

Telegram-бот для ведения нескольких Telegram-каналов через пользовательский Telegram-аккаунт (`StringSession`) и OpenRouter.

Проект решает практическую задачу редакционного автопилота для Telegram:

- читать посты из набора референсных каналов;
- отбирать из них только допустимые источники;
- генерировать на их основе новый пост под конкретный target-канал;
- при необходимости генерировать изображение;
- публиковать пост вручную, по интервалу или по календарю;
- отправлять автопосты и автокомментарии на ручной approve;
- писать комментарии от имени канала в референсных каналах;
- собирать аналитику по опубликованным постам;
- менять дальнейшую стратегию генерации на основе метрик;
- чистить спам в комментариях discussion-группы целевого канала.
- управлять основными сценариями через кнопки прямо внутри Telegram-бота.

README ниже описывает не “идею проекта”, а фактическое поведение текущего кода.

## Что именно делает проект

Проект автоматизирует редакционную цепочку для Telegram-каналов:

1. Пользователь подключает свой Telegram-аккаунт через `API ID`, `API Hash` и `StringSession`.
2. Через управляющего бота создаёт один или несколько target-каналов.
3. Для каждого target-канала задаёт список референсных каналов.
4. Система периодически читает свежие посты из этих референсов.
5. Посты проходят анти-рекламную проверку.
6. На основе допущенных источников генерируется новый пост под tone of voice target-канала.
7. При включённой генерации изображения создаётся картинка через OpenRouter.
8. Пост либо публикуется сразу, либо попадает в очередь approve.
9. После публикации бот начинает собирать просмотры, реакции, комментарии, репосты и follower delta.
10. На основе этих метрик строится краткая стратегия для следующих постов.

Дополнительно проект умеет:

- автоматически комментировать посты в референсных каналах от имени бренда;
- отправлять такие комментарии в ручной approve;
- удалять спам из discussion-комментариев опубликованных target-постов.

## Для каких задач проект подходит

Сейчас код покрывает такие сценарии:

- ведение нескольких Telegram-каналов из одного управляющего бота;
- semi-auto или full-auto контент-менеджмент;
- создание “редакционного слоя” поверх существующих отраслевых референсов;
- бренд-комментинг в смежных каналах;
- базовая модерация discussion-комментариев;
- контент-циклы, где важны:
  - перефразирование,
  - саммаризация,
  - синтез нескольких источников,
  - контроль рекламы и промо-мусора,
  - обратная связь через аналитику.

## Чего проект не делает

По текущему коду проект не делает следующее:

- не хранит состояние в полноценной БД, используется JSON-файл;
- не реализует удаление target/reference через команды;
- не логинит Telegram-аккаунт прямо внутри управляющего бота, используется отдельный CLI `session:create`;
- не собирает персональные subscriber events, только агрегированные channel stats и метрики постов;
- не использует media-only source posts как источники текста, берутся только текстовые сообщения;
- не имеет полноценной веб-панели, всё управление идёт через Telegram-бота и локальный state;
- не применяет approve-flow к ручной команде `/publish`, она публикует сразу.

## Ключевые сущности

### 1. Telegram account

Подключённый пользовательский Telegram-аккаунт.

Хранит:

- внутренний `id`;
- label;
- `apiId`;
- `apiHash`;
- `sessionString`.

Нужен для:

- чтения референсных каналов;
- публикации в target-каналы;
- комментариев от имени канала;
- чтения статистики каналов;
- удаления спама в discussion-группах.

### 2. Target channel

Канал, который бот ведёт.

Для каждого target хранятся:

- язык;
- tone of voice;
- режим контента;
- настройки картинок;
- настройки авто-постинга;
- календарь публикаций;
- настройки anti-ads и anti-spam;
- настройки бренд-комментариев;
- настройки модерации;
- список референсных каналов;
- последний draft;
- история публикаций;
- история аналитики;
- текущая strategy insight;
- история бренд-комментариев;
- pending approvals.

### 3. Reference channel

Канал-источник, из которого бот берёт идеи и новости.

Для каждого reference задаются:

- `channelRef`;
- заголовок;
- `fetchLimit`;
- `commentingEnabled`;
- `lastCommentedPostId`;
- `lastCommentedAt`.

### 4. Draft

Сгенерированный черновик поста.

Содержит:

- `title`;
- `summary`;
- `text`;
- `imagePrompt`;
- `imageDataUrl`, если картинка была сгенерирована;
- список source messages;
- `sourceCursor` по референсам;
- модель текста и модель картинки;
- summary стратегии, которая была использована при генерации;
- отметки safety checks.

### 5. Published post record

Фиксирует уже опубликованный пост:

- `messageId` в Telegram;
- время публикации;
- discussion thread, если он найден;
- source cursor;
- source message ids;
- краткий summary черновика;
- историю метрик.

### 6. Pending approval

Элемент ручного approve.

Может быть двух типов:

- `post`;
- `comment`.

Для каждого pending approval хранятся:

- `id`;
- `createdAt`;
- `expiresAt`;
- `timeoutAction` (`publish` или `skip`);
- контекст target-канала;
- либо draft поста, либо текст комментария и reference post.

## Общая логика проекта

Система состоит из пяти основных контуров:

1. Управляющий Telegram-бот на `grammy`.
2. Telegram user-layer на GramJS (`telegram`).
3. Генерация и классификация через OpenRouter.
4. JSON state store.
5. Фоновые циклы:
   - автопостинг,
   - аналитика,
   - бренд-комментинг,
   - модерация,
   - обработка таймаутов approve.

## Архитектура по модулям

Ключевые файлы:

- [src/index.ts](/Users/averichie/Desktop/auto-smm-telegram/src/index.ts:1) — сборка приложения и фоновые циклы.
- [src/bot/app.ts](/Users/averichie/Desktop/auto-smm-telegram/src/bot/app.ts:1) — команды управляющего бота.
- [src/services/content-service.ts](/Users/averichie/Desktop/auto-smm-telegram/src/services/content-service.ts:1) — сбор источников, draft generation, публикация, autopost.
- [src/services/community-service.ts](/Users/averichie/Desktop/auto-smm-telegram/src/services/community-service.ts:1) — бренд-комментарии и модерация discussion-комментариев.
- [src/services/analytics-service.ts](/Users/averichie/Desktop/auto-smm-telegram/src/services/analytics-service.ts:1) — сбор метрик и адаптация стратегии.
- [src/services/approval-service.ts](/Users/averichie/Desktop/auto-smm-telegram/src/services/approval-service.ts:1) — очередь approve, ручные решения и timeout policy.
- [src/services/safety-service.ts](/Users/averichie/Desktop/auto-smm-telegram/src/services/safety-service.ts:1) — анти-реклама и антиспам.
- [src/telegram/account-service.ts](/Users/averichie/Desktop/auto-smm-telegram/src/telegram/account-service.ts:1) — доступ к Telegram user account.
- [src/openrouter/client.ts](/Users/averichie/Desktop/auto-smm-telegram/src/openrouter/client.ts:1) — вызовы OpenRouter.
- [src/openrouter/prompts.ts](/Users/averichie/Desktop/auto-smm-telegram/src/openrouter/prompts.ts:1) — промпт генерации поста.
- [src/openrouter/intelligence-prompts.ts](/Users/averichie/Desktop/auto-smm-telegram/src/openrouter/intelligence-prompts.ts:1) — промпты для anti-ads, spam, strategy, comments.
- [src/scheduling/calendar.ts](/Users/averichie/Desktop/auto-smm-telegram/src/scheduling/calendar.ts:1) — календарный DSL.
- [src/store/state-store.ts](/Users/averichie/Desktop/auto-smm-telegram/src/store/state-store.ts:1) — JSON state store.

## Как проект получает доступ к Telegram-аккаунту

### Способ доступа

Проект работает не только через Bot API, а через пользовательскую Telegram-сессию.

Используется:

- `API ID`;
- `API Hash`;
- `StringSession`.

Это даёт возможность:

- читать каналы как обычный Telegram-пользователь;
- публиковать в каналы, где у аккаунта есть право постинга;
- получать channel stats;
- работать с discussion-группами;
- писать комментарии через `send as`, если Telegram разрешает это в конкретной discussion-группе.

### Как создаётся `StringSession`

CLI-команда:

```bash
npm run session:create
```

Что делает CLI:

1. Просит `API ID`.
2. Просит `API Hash`.
3. Запрашивает номер телефона.
4. Запрашивает код из Telegram.
5. Если включён 2FA, просит пароль.
6. Логинит временный GramJS-клиент.
7. Печатает `StringSession`.

Реализация: [src/cli/create-session.ts](/Users/averichie/Desktop/auto-smm-telegram/src/cli/create-session.ts:1)

### Как аккаунт добавляется в проект

Через бот:

1. `/account_add`
2. label
3. `API ID`
4. `API Hash`
5. `StringSession`

После этого бот вызывает `verifyAccount` и проверяет, что сессия действительно открывается.

## Как создаётся target-канал

Через бот:

1. `/target_add`
2. выбор `accountId`
3. title
4. `channelRef`
5. language
6. tone
7. content mode
8. include image
9. aspect ratio
10. style notes
11. interval minutes

При создании target получает дефолты:

- `publishMode = interval`, если интервал больше 0;
- иначе `publishMode = manual`;
- календарь создаётся, но выключен;
- anti-ads включён;
- anti-spam включён;
- moderation включена;
- approval для постов и комментариев выключен;
- timeout policy по умолчанию:
  - `timeoutMinutes = 30`
  - `onTimeout = skip`

Логика target creation: [src/bot/app.ts](/Users/averichie/Desktop/auto-smm-telegram/src/bot/app.ts:894)

## Как добавляются референсные каналы

Через бот:

1. `/ref_add`
2. `targetId`
3. `channelRef`
4. `fetchLimit`

Бот проверяет, что:

- target существует;
- связанный account существует;
- target-account действительно может резолвить этот канал.

После этого reference сохраняется в target.

## Логика генерации контента

### Режимы контента

Поддерживаются режимы:

- `rewrite`
- `summary`
- `hybrid`

Их смысл задаётся прямо в промпте:

- `rewrite` — переписывает факты и подачу без близкого копирования;
- `summary` — делает сжатую выжимку;
- `hybrid` — синтезирует несколько источников в новый авторский пост.

Промпт генерации: [src/openrouter/prompts.ts](/Users/averichie/Desktop/auto-smm-telegram/src/openrouter/prompts.ts:1)

### Как собираются источники

При генерации draft:

1. Берутся все reference-каналы target-а.
2. Для каждого reference загружаются последние `fetchLimit` сообщений.
3. Берутся только текстовые сообщения с непустым `message`.
4. Если генерация идёт в режиме “только новые источники”, берутся только посты с `messageId > lastSourceMessageByReference[reference.id]`.
5. Каждый source post проходит anti-ad filter.
6. Все допущенные посты объединяются.
7. Они сортируются по дате по убыванию.
8. В генерацию попадает максимум 8 source messages.

Важно:

- manual `/generate` использует не только новые источники, а весь доступный свежий пул;
- autopost использует только новые источники.

Реализация: [src/services/content-service.ts](/Users/averichie/Desktop/auto-smm-telegram/src/services/content-service.ts:195)

### Как строится промпт

В промпт подаются:

- target title и ref;
- язык;
- tone;
- style notes;
- content mode;
- strategy insight, если она уже была получена аналитикой;
- список source messages;
- требование вернуть строго JSON.

Модель должна вернуть:

```json
{
  "title": "string",
  "summary": "string",
  "post": "string",
  "imagePrompt": "string"
}
```

OpenRouter-ответ проходит через:

- извлечение JSON;
- валидацию `zod`.

## Логика генерации изображений

Изображение генерируется только если одновременно выполняются два условия:

1. у target включён `includeImage`;
2. текстовая модель вернула непустой `imagePrompt`.

Что происходит:

1. OpenRouter вызывается отдельно для image generation.
2. В запрос передаётся `aspect_ratio`.
3. Ожидается `data URL` картинки.
4. Картинка сохраняется в draft как `imageDataUrl`.

Если draft содержит `imageDataUrl`, при публикации используется отправка файла с подписью. Если нет — отправляется обычное текстовое сообщение.

Реализация: [src/openrouter/client.ts](/Users/averichie/Desktop/auto-smm-telegram/src/openrouter/client.ts:67), [src/telegram/account-service.ts](/Users/averichie/Desktop/auto-smm-telegram/src/telegram/account-service.ts:141)

## Анти-реклама: как это работает

Anti-ad filter применяется в трёх местах:

1. к source posts из референсов;
2. к уже сгенерированному draft-посту;
3. к draft-тексту бренд-комментария.

### Шаг 1. Быстрые эвристики

Сначала проверяются явные паттерны:

- промокоды;
- скидки;
- рефералки;
- `sponsored`;
- `buy now`;
- `register now`;
- `#ad`;
- несколько ссылок + CTA.

Если эвристика срабатывает, текст сразу считается рекламным с высоким confidence.

### Шаг 2. LLM-классификация

Если эвристика не сработала, текст отправляется в OpenRouter как классификационная задача.

Модель должна вернуть:

```json
{
  "isAdvertisement": true,
  "confidence": 0.97,
  "reason": "..."
}
```

### Шаг 3. Порог confidence

Если:

- `isAdvertisement = true`
- и `confidence >= adConfidenceThreshold`

то текст блокируется.

Дефолтный порог в target: `0.75`.

Реализация: [src/services/safety-service.ts](/Users/averichie/Desktop/auto-smm-telegram/src/services/safety-service.ts:8)

## Антиспам: как это работает

Anti-spam сейчас используется для модерации входящих discussion-комментариев.

Логика двухслойная:

### Шаг 1. Эвристики

Быстрая блокировка по признакам:

- scam-фразы;
- гемблинг;
- adult-паттерны;
- `wallet connect`;
- `airdrop`;
- множественные ссылки;
- burst of emojis;
- много `@mentions`.

### Шаг 2. LLM-классификация

Если эвристика не сработала, модель определяет:

- является ли комментарий spam/scam/mass-promo;
- насколько она уверена;
- почему.

### Шаг 3. Порог confidence

Если:

- `isSpam = true`
- и `confidence >= spamConfidenceThreshold`

комментарий удаляется.

Дефолтный порог: `0.8`.

## Логика публикации постов

### Manual publish

Команда:

```text
/publish <targetId>
```

Поведение:

1. Если есть `lastDraft`, публикуется он.
2. Если `lastDraft` нет, бот сначала пытается сгенерировать draft.
3. После публикации:
   - обновляется `lastSourceMessageByReference`;
   - фиксируется `lastPublishedAt`;
   - создаётся `PublishedPostRecord`;
   - если discussion-thread найден, он сохраняется для дальнейшей модерации и аналитики.

Важно:

- `/publish` публикует сразу;
- approve-flow на эту команду не распространяется.

### Auto-post: interval mode

Настройка:

```text
/schedule <targetId> <minutes|off>
```

Логика:

1. Фоновый цикл запускается раз в минуту.
2. Если target в режиме `interval` и `autoPost.enabled = true`, проверяется `lastRunAt`.
3. Если интервал ещё не прошёл, target пропускается.
4. Если интервал прошёл:
   - собираются только новые source posts;
   - генерируется draft;
   - draft либо публикуется сразу, либо ставится в approval.

### Auto-post: calendar mode

Настройка:

```text
/calendar_set <targetId> <timezone> <expression>
```

Логика:

1. Фоновый цикл раз в минуту проверяет текущее время в timezone target-а.
2. Если текущая минута совпадает со слотом календаря, получается `slotKey`.
3. Если `slotKey` уже использовался, повторной публикации не будет.
4. Если слот новый:
   - собираются только новые source posts;
   - генерируется draft;
   - draft публикуется или ставится в approval;
   - slot помечается как отработанный.

### Поддерживаемый календарный DSL

Примеры:

- `weekdays@09:00,14:00,19:00`
- `daily@10:00`
- `mon,wed,fri@08:30; sat@12:00`

Поддерживается:

- `daily`
- `everyday`
- `weekdays`
- `weekends`
- список `mon..sun`
- несколько сегментов через `;`
- несколько слотов времени через `,`

Важно:

- матч идёт по минуте;
- пропущенные во время оффлайна слоты не догоняются задним числом.

Реализация: [src/scheduling/calendar.ts](/Users/averichie/Desktop/auto-smm-telegram/src/scheduling/calendar.ts:1)

## Approval-flow: как он устроен

Approval распространяется только на автоматические действия:

- autopost;
- autocomment.

### Настройка

```text
/approval <targetId> <posts|comments|all> <on|off> [timeoutMinutes] [publish|skip]
```

Примеры:

```text
/approval crypto-main posts on 45 publish
/approval crypto-main comments on 20 skip
/approval crypto-main all off
```

### Что происходит при pending approval

Если approval для постов включён:

1. Фоновый автопост не публикует post сразу.
2. Создаёт `PendingPostApproval`.
3. Сохраняет draft в state.
4. Шлёт уведомление всем `BOT_ADMIN_IDS`.
5. В уведомлении есть inline-кнопки `Approve` / `Reject`.

Если approval для комментариев включён:

1. Автокомментарий генерируется как обычно.
2. Вместо публикации создаётся `PendingCommentApproval`.
3. Он отправляется администраторам.

### Timeout policy

У каждого approval есть:

- `expiresAt`;
- `timeoutAction`.

Если админ не ответил вовремя:

- `publish` — действие выполняется автоматически;
- `skip` — действие пропускается.

### Важная фактическая логика по коду

- для target одновременно допускается не больше одного pending post approval;
- для target одновременно допускается не больше одного pending comment approval;
- когда interval autopost ставит post в approval, `lastRunAt` уже обновляется;
- когда calendar autopost ставит post в approval, слот уже помечается как отработанный;
- это сделано, чтобы один и тот же автопроход не дублировался;
- если pending comment создан, reference post помечается как уже обработанный по `lastCommentedPostId`.

### Просмотр очереди

```text
/pending
/pending <targetId>
```

### Ручные решения

Решения принимаются через inline-кнопки в сообщении бота:

- `Approve`
- `Reject`

Дополнительно service рассылает уведомления о:

- создании pending approval;
- approve;
- reject;
- timeout publish;
- timeout skip;
- failure.

Реализация: [src/services/approval-service.ts](/Users/averichie/Desktop/auto-smm-telegram/src/services/approval-service.ts:27)

## Логика бренд-комментариев в референсных каналах

Цель функции:

- повышать узнаваемость бренда;
- присутствовать в смежных каналах;
- делать это не через прямую рекламу, а через уместные экспертные комментарии.

### Включение

```text
/commenting <targetId> <on|off> [maxPerDay] [cooldownHours] [sendAsRef]
/ref_comment <targetId> <referenceId> <on|off>
```

Пример:

```text
/commenting crypto-main on 3 6 @my_brand_channel
/ref_comment crypto-main ref-1 on
```

### Как выбирается кандидат на комментарий

Для каждого target:

1. Комментарии должны быть включены глобально.
2. У target не должно быть другого pending comment approval.
3. Не должен быть превышен `maxCommentsPerDay` по уже опубликованным комментариям.
4. Должен пройти cooldown `minHoursBetweenComments`.
5. Берутся только reference channels, у которых `commentingEnabled = true`.
6. По каждому reference читаются последние `min(fetchLimit, 3)` поста.
7. Уже обработанные post ids пропускаются.

### Как строится комментарий

Для каждого candidate post:

1. Source post проходит anti-ad filter.
2. OpenRouter получает задачу:
   - написать короткий, уместный, полезный комментарий;
   - не делать прямую рекламу;
   - вернуть `shouldComment`.
3. Если модель говорит `shouldComment = false`, пост пропускается.
4. Если comment text выглядит как реклама, он блокируется.
5. Если approve для comments включён:
   - создаётся pending approval;
   - публикация откладывается.
6. Если approve выключен:
   - бот пытается написать комментарий сразу.

### Как происходит публикация комментария

Публикация возможна только если:

1. у reference post есть discussion thread;
2. `sendAsRef` разрешён в этой discussion-группе.

Проверка идёт через `channels.getSendAs`.

Если всё в порядке:

1. сохраняется default `send as`;
2. отправляется reply в discussion thread.

Если discussion thread недоступен или `send as` запрещён:

- комментарий не публикуется;
- событие фиксируется как `blocked`.

### Что записывается в историю

В `brandCommentHistory` попадают события со статусами:

- `posted`
- `skipped`
- `blocked`

Реализация: [src/services/community-service.ts](/Users/averichie/Desktop/auto-smm-telegram/src/services/community-service.ts:30)

## Логика модерации discussion-комментариев

Модерация относится к комментариям под уже опубликованными post-ами target-канала.

### Включение

```text
/moderation <targetId> <on|off> [maxDeletesPerCycle]
```

### Что делает модератор

1. Берёт последние 5 опубликованных target-posts, у которых известен discussion thread.
2. Для каждого поста загружает ответы из discussion-группы.
3. Берёт только комментарии после `lastModeratedCommentId`.
4. Игнорирует:
   - свои исходящие сообщения;
   - пустые сообщения.
5. Оценивает комментарий как spam/scam/mass-promo.
6. Если spam confidence выше порога — помечает на удаление.
7. За один цикл удаляет не больше `maxDeletesPerCycle`.
8. После прохода сохраняет новый `lastModeratedCommentId`.

Важно:

- moderation scanning не анализирует весь канал целиком;
- сканируются discussion-комментарии только у последних опубликованных target-posts.

## Логика аналитики и адаптации стратегии

Аналитика решает задачу “не просто постить, а учиться на том, что зашло”.

### Что собирается

По target-каналу:

- followers current;
- followers previous;
- follower delta;
- views per post;
- shares per post;
- reactions per post;
- growth graph, если Telegram его отдаёт;
- недавние посты и их метрики.

По отдельному опубликованному посту:

- views;
- forwards;
- reactions;
- replies;
- engagement rate.

### Источник данных

Сначала сервис пытается использовать `stats.getBroadcastStats`.

Если этот API не срабатывает:

- пишет warning в лог;
- использует fallback через `messages.getMessagesViews` и данные по самим сообщениям.

### Как обновляется стратегия

После сбора snapshot:

1. Для последних опубликованных постов обновляется `metricsHistory`.
2. Формируется payload:
   - follower dynamics;
   - growth series;
   - summary последних post metrics.
3. Этот payload отправляется в OpenRouter как стратегическая задача.
4. Модель возвращает:
   - summary;
   - что делать чаще;
   - чего избегать;
   - рекомендованные posting windows.
5. `strategyInsight` сохраняется в target.
6. При следующих генерациях это summary добавляется в content prompt.

Таким образом аналитика влияет не только на отчёт, но и на будущий контент.

Реализация: [src/services/analytics-service.ts](/Users/averichie/Desktop/auto-smm-telegram/src/services/analytics-service.ts:1)

## Как OpenRouter используется в проекте

OpenRouter решает четыре разные задачи:

1. Генерация основного контента.
2. Генерация изображения.
3. Классификация рекламы и спама.
4. Стратегический анализ и генерация бренд-комментариев.

### Текстовая модель

По умолчанию:

```text
OPENROUTER_TEXT_MODEL=openai/gpt-4.1-mini
```

Используется для:

- content generation;
- ad classification;
- spam classification;
- brand comments;
- strategy analysis.

### Image model

По умолчанию:

```text
OPENROUTER_IMAGE_MODEL=google/gemini-2.5-flash-image
```

Используется только для image generation.

### Как обрабатываются ответы модели

Текстовые задачи:

- модель должна вернуть JSON;
- JSON извлекается даже если пришёл в fenced block;
- потом валидируется через `zod`.

Если JSON невалиден, операция падает с ошибкой.

Реализация: [src/openrouter/client.ts](/Users/averichie/Desktop/auto-smm-telegram/src/openrouter/client.ts:1), [src/utils/json.ts](/Users/averichie/Desktop/auto-smm-telegram/src/utils/json.ts:1)

## Логика состояния и хранения данных

### Где хранится state

По умолчанию:

```text
data/state.json
```

Путь можно изменить через `STATE_FILE`.

### Как устроено хранение

StateStore:

- читает JSON при старте;
- если файла нет, создаёт пустое состояние;
- при любом `saveAccount` или `saveTarget` полностью переписывает state через временный `.tmp` файл;
- нормализует target records, чтобы старые state-файлы автоматически получили новые поля `approval` и `pendingApprovals`.

Реализация: [src/store/state-store.ts](/Users/averichie/Desktop/auto-smm-telegram/src/store/state-store.ts:12), [src/target-defaults.ts](/Users/averichie/Desktop/auto-smm-telegram/src/target-defaults.ts:3)

## Фоновые циклы

Приложение запускает несколько независимых `setInterval`-циклов.

### 1. Autopost cycle

Интервал: 1 минута.

Что делает:

- проверяет interval mode;
- проверяет calendar slots;
- генерирует draft;
- публикует сразу или ставит в approval.

### 2. Analytics cycle

Интервал: `ANALYTICS_INTERVAL_MINUTES`.

Что делает:

- собирает аналитику только по target-каналам, у которых есть опубликованные посты.

### 3. Community cycle

Интервал: `COMMUNITY_INTERVAL_MINUTES`.

Что делает:

- запускает brand commenting;
- отправляет pending comment approvals;
- модерирует discussion-comments.

### 4. Approval timeout cycle

Интервал: 1 минута.

Что делает:

- ищет pending approvals с истекшим `expiresAt`;
- выполняет `publish` или `skip` в зависимости от политики.

Реализация: [src/index.ts](/Users/averichie/Desktop/auto-smm-telegram/src/index.ts:42)

## Все команды управляющего бота

### Справка и базовое управление

- `/start`
- `/help`
- `/cancel`

Важно:

- после `/start` бот показывает постоянную reply-клавиатуру с основными разделами;
- списки каналов, референсов и pending approve открываются с inline-кнопками;
- большая часть ежедневных операций выполняется кнопками, а текст вводится только там, где нужны свободные значения.

## Кнопочный интерфейс

После запуска `/start` бот отдаёт два слоя управления:

### 1. Постоянная reply-клавиатура

На ней доступны кнопки:

- `/targets`
- `/accounts`
- `/pending`
- `/target_add`
- `/ref_add`
- `/account_add`
- `/help`
- `/cancel`

Эта клавиатура остаётся внизу чата и даёт быстрый доступ к разделам без ручного ввода команд.

### 2. Inline-панели

Сейчас через inline-кнопки можно:

- открыть карточку target-канала;
- сгенерировать draft;
- посмотреть preview;
- опубликовать post;
- обновить аналитику;
- открыть список референсов;
- открыть pending approvals для конкретного target;
- включать и выключать:
  - comments,
  - moderation,
  - post approval,
  - comment approval;
- переключать пресеты автопостинга:
  - `manual`,
  - `60m`,
  - `180m`,
  - default calendar preset;
- включать и выключать commenting по отдельным reference channels;
- запускать сценарии:
  - `account_add`,
  - `target_add`,
  - `ref_add`.

### Что всё ещё вводится текстом

Кнопки закрывают навигацию и дискретные выборы, но следующие поля по-прежнему вводятся текстом:

- `API ID`
- `API Hash`
- `StringSession`
- `channelRef`
- язык
- `tone`
- `style notes`
- кастомный календарь для `/calendar_set`
- кастомные timeout/approval значения, если нужны не дефолтные кнопочные пресеты
- кастомный интервал, если нужен не `60m` и не `180m`

### Аккаунты

- `/accounts` — список подключённых user sessions.
- `/account_add` — пошаговое добавление Telegram-аккаунта.

### Каналы

- `/targets` — список target-каналов.
- `/target_add` — пошаговое создание target-канала.

### Референсы

- `/refs <targetId>` — список reference channels target-а.
- `/ref_add` — пошаговое добавление reference channel.

### Draft и публикация

- `/generate <targetId>` — собрать новый draft.
- `/preview <targetId>` — показать последний draft.
- `/publish <targetId>` — опубликовать `lastDraft` немедленно.

### Расписание

- `/schedule <targetId> <minutes|off>` — interval posting.
- `/calendar <targetId>` — показать текущий календарь.
- `/calendar_set <targetId> <timezone> <expression>` — включить calendar mode.

### Brand comments

- `/commenting <targetId> <on|off> [maxPerDay] [cooldownHours] [sendAsRef]`
- `/ref_comment <targetId> <referenceId> <on|off>`

### Moderation

- `/moderation <targetId> <on|off> [maxDeletesPerCycle]`

### Approval

- `/approval <targetId> <posts|comments|all> <on|off> [timeoutMinutes] [publish|skip]`
- `/pending [targetId]`

### Analytics

- `/analytics <targetId>`

## Примеры рабочих сценариев

### Сценарий 1. Полуавтоматический канал

Цель: получать draft вручную, смотреть preview и публиковать только после ручной проверки.

Как настраивать:

1. Создать account.
2. Создать target.
3. Добавить references.
4. Не включать `/schedule` и не ставить calendar.
5. Использовать:
   - `/generate`
   - `/preview`
   - `/publish`

### Сценарий 2. Автопост по календарю с fallback publish

Цель: бот сам постит в фиксированные окна, но сначала даёт шанс админу вмешаться.

Как настраивать:

```text
/calendar_set target-1 Europe/Moscow weekdays@09:00,14:00,19:00
/approval target-1 posts on 30 publish
```

Что будет:

- в каждый слот бот соберёт новый draft;
- пришлёт админам pending approval;
- если ответа не будет 30 минут, пост выйдет сам.

### Сценарий 3. Бренд-комментинг с ручным approve и безопасным skip

```text
/commenting target-1 on 3 6 @brand_channel
/ref_comment target-1 ref-1 on
/approval target-1 comments on 20 skip
```

Что будет:

- бот найдёт подходящий новый пост в `ref-1`;
- сгенерирует экспертный комментарий;
- отправит его на approve;
- если админ не ответит 20 минут, комментарий не будет опубликован.

## Переменные окружения

Пример: [.env.example](/Users/averichie/Desktop/auto-smm-telegram/.env.example:1)

### Обязательные

- `BOT_TOKEN` — токен управляющего Telegram-бота.
- `BOT_ADMIN_IDS` — список Telegram user ids, разделённых запятой.
- `OPENROUTER_API_KEY` — ключ OpenRouter.

### OpenRouter

- `OPENROUTER_BASE_URL` — базовый URL OpenRouter.
- `OPENROUTER_TEXT_MODEL` — модель для текста и классификации.
- `OPENROUTER_IMAGE_MODEL` — модель для изображений.
- `APP_NAME` — имя приложения в заголовках запросов.
- `APP_URL` — referer для OpenRouter.

### Хранение и логирование

- `STATE_FILE` — путь до JSON state.
- `LOG_LEVEL` — `debug|info|warn|error`.

### Дефолты приложения

- `DEFAULT_SOURCE_POST_LIMIT` — сейчас объявлен в конфиге, но не применяется автоматически в bot flow; `fetchLimit` задаётся вручную через `/ref_add`.
- `DEFAULT_IMAGE_ASPECT_RATIO` — дефолтный aspect ratio при создании target.
- `DEFAULT_AUTOPUBLISH_INTERVAL_MINUTES` — запасной default интервал.
- `DEFAULT_CALENDAR_TIMEZONE` — default timezone для новых calendar configs.
- `DEFAULT_CALENDAR_EXPRESSION` — default expression для новых calendar configs.
- `ANALYTICS_INTERVAL_MINUTES` — частота analytics cycle.
- `COMMUNITY_INTERVAL_MINUTES` — частота brand-comment/moderation cycle.

## Быстрый старт

1. Скопировать `.env.example` в `.env`.
2. Заполнить обязательные переменные.
3. Установить зависимости:

```bash
npm install
```

4. Создать `StringSession`:

```bash
npm run session:create
```

5. Запустить бота:

```bash
npm run dev
```

6. В Telegram пройти сценарии:

```text
/account_add
/target_add
/ref_add
```

## Разработка

Команды:

```bash
npm run build
npm test
npm run dev
```

Текущие тесты покрывают:

- calendar parsing;
- JSON extraction from model responses;
- state persistence;
- normalization of legacy target state;
- timeout behavior of approval service.

## Ограничения и нюансы

### Telegram-ограничения

- для публикации и чтения статистики аккаунт должен иметь нужные права;
- brand commenting зависит от того, есть ли discussion thread;
- `send as` зависит от разрешений конкретной discussion-группы;
- если discussion thread пропал между генерацией и approve, комментарий не будет опубликован.

### Контентные ограничения

- quality output зависит от качества референсов;
- anti-ad filter может быть консервативным и отбрасывать спорные посты;
- генерируемый контент не проверяет факты во внешних источниках, а работает только с тем, что было получено из референсов.

### Технические ограничения

- JSON state удобен для MVP, но не подходит как high-load storage;
- нет распределённой очереди задач;
- нет retry-policy для сложных бизнес-процессов кроме следующего фонового цикла;
- нет отдельной таблицы событий, вся история хранится внутри target record.

## Почему проект полезен

В текущем виде проект закрывает реальную операционную боль небольших editorial / growth / SMM-команд:

- один оператор может вести несколько каналов;
- контент перестаёт собираться вручную из десятков референсов;
- появляется единая логика анти-рекламы;
- бренд получает системное присутствие в референсной среде через комментарии;
- публикация начинает опираться на метрики, а не только на интуицию;
- при этом остаётся ручной контроль через approve-flow.
