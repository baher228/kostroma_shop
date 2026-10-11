# Автоматический импорт акционных документов из Gmail

Pipeline работает на Dubai backend поверх существующих импортёров акций:

```text
Gmail read/send OAuth → recursive MIME attachments → sender/file/content validation
  → классификация всех кандидатов → прайс → план → накладная
  → единый importPromotionDocument (тот же service, что у Web upload)
  → R2 оригинал + PostgreSQL документ/интервалы/строки + gmail_imports success
  → Dashboard preview → ценник / постер → печать / скачивание
```

Google Drive постеры продолжают использовать отдельный service account и `drive.readonly`. Gmail OAuth использует `gmail.readonly` для импорта и `gmail.send` для отправки пакетов с подключённого аккаунта. Доступа к удалению писем, изменению labels или прочитанности приложение не запрашивает.

## Автоматические пакеты и отправка

Сервис отправляет не более пяти писем одному получателю за скользящие 24 часа, вместе для ручной и автоматической отправки и всех подключённых ящиков. Адрес сравнивается без учёта регистра. `sending` и `unknown` занимают место в лимите, подтверждённый отказ Gmail его не занимает. Проверка квоты и сохранение времени начала отправки выполняются под общим Gmail lock. Шестой пакет остаётся готовым и отправляется после освобождения лимита; перезапуск и повторное нажатие не снимают ограничение.

История импорта и пакетов изначально свёрнуты и открываются нажатием на заголовок. Успешные уведомления скрываются через четыре секунды, ошибки остаются видимыми. Каталог постеров задаётся через production variable `GOOGLE_DRIVE_POSTERS_FOLDER_ID`. Перед чтением проверяются наличие папки и доступ; ошибки не превращаются в сообщение об отсутствии постера. PSD распознаётся по расширению даже при MIME `application/octet-stream`.

В блоке **Документы → Почта** manager задаёт адрес получателя, точные адреса разрешённых отправителей (до 50) и включает автоматическую отправку. Настройки сохраняются в PostgreSQL, переживают deploy и применяются под той же блокировкой, что и импорт. Пустой список отправителей приостанавливает импорт. Входящие письма дополнительно требуют одного заголовка From и `dmarc=pass` для его домена в первом Authentication-Results, добавленном `mx.google.com`; Spam, Trash, Sent и Draft игнорируются. Более поздние результаты и ARC не заменяют отрицательный результат. Проверки размера, MIME и содержимого вложений сохраняются.

Каждая новая успешно импортированная накладная атомарно создаёт задание в `gmail_deliveries`; несколько накладных из одного письма образуют один пакет. Исторические импорты автоматически не рассылаются. Пакет ждёт завершения всех вложений письма и сохраняет снимок цен/периодов исходных накладных, а не объединённого диапазона общей таблицы. Обычный импорт в таблицу сохраняется. ZIP содержит ценники A4 (4 на лист), PDF постеров из доступных PSD на Google Drive и README. Для каждого товара без постера письмо и README сообщают: «Для товара … постеров ещё нет». Отсутствие цен тоже перечисляется; ошибка доступа к Drive не маскируется под отсутствие постера.

Старое OAuth-подключение продолжает читать почту, но не отправляет письма. Нажмите **Сменить аккаунт**, выберите тот же Gmail и разрешите чтение и отправку. Приложение проверяет фактически выданные scopes и сохраняет их вместе с зашифрованным токеном. Если Google Auth Platform использует объявленный список scopes, добавьте `https://www.googleapis.com/auth/gmail.send` в **Data Access** существующего проекта `kostroma-503116`. Новый OAuth client/JSON не нужен.

Подготовленный ZIP сохраняется приватно в R2 и доступен авторизованным пользователям в истории пакетов. До настройки получателя/разрешения отправки пакет остаётся готовым. Отправитель всегда совпадает с исходным подключённым Gmail; смена аккаунта не пересылает старую очередь с другого ящика. Архив до 18 МБ прикрепляется к письму; больший архив отправляется по приватной подписанной ссылке сроком 7 дней. Подготовка ограничена 500 позициями, 64 МБ исходных PDF и тремя автоматическими попытками.

Перед `messages.send` сохраняются статус `sending`, получатель и постоянный RFC Message-ID. Отправка не имеет слепых HTTP-повторов. При потере ответа или перезапуске `sending` становится `unknown`, проверяется папка «Отправленные» по Message-ID; автоматический повтор запрещён. Подтверждённый `sent` терминален. Получатели не берутся из входящего письма. Ошибки провайдера и токены не попадают в API/логи.

В **Пакет ценников** общей таблицы можно выбрать акции и нажать **Отправить ценники и постеры**. Ручной запрос имеет ключ идемпотентности, создаёт отдельный снимок и может отправляться при выключенной автоматической отправке. Настройки и отправка доступны только manager; существующая Ops-авторизация обязательна для истории и скачивания ZIP. В истории готовый/ошибочный пакет можно отправить повторно после исправления настроек; уже отправленные и неподтверждённые задания не отправляются повторно.

## Подключение из приложения (основной способ)

Администратор открывает **Акции → Документы → Почта → Подключить Gmail**, выбирает Google-аккаунт и разрешает чтение почты. После возврата в приложение включается автоматический импорт. «Сменить аккаунт» повторяет авторизацию, «Отключить» прекращает импорт; уже загруженные документы сохраняются. Один подключённый ящик используется для общего списка акционных документов.

Сервер сохраняет refresh token в PostgreSQL, зашифрованный AES-256-GCM. Подключение переживает перезапуск и deploy. Ключ `GMAIL_TOKEN_ENCRYPTION_KEY` должен оставаться неизменным; его потеря требует повторного подключения. API статуса возвращает только адрес почты и статус, без токенов. Начать и отключить подключение может только manager. Callback использует PKCE и одноразовый state сроком 10 минут, связанный с HttpOnly/SameSite=Lax cookie. Смена аккаунта и импорт сериализуются PostgreSQL lock; история и дедупликация разделены по ящикам.

В Google Cloud проекте создайте **OAuth client ID → Web application**, включите Gmail API и настройте Google Auth Platform / consent screen. Добавьте authorized redirect URIs:

- Production: `https://affera.co.uk/dxb/api/promotions/gmail/oauth/callback`
- Local: `http://127.0.0.1:5173/dxb/api/promotions/gmail/oauth/callback`

JSON для постеров имеет тип `service_account` и не подходит для входа пользователя. Новый OAuth JSON имеет объект `web`; сервисный аккаунт Drive продолжает работать независимо.

Для локального запуска сохраните Web OAuth JSON в игнорируемом `services/dubai-backend/secrets/` и выполните:

```powershell
node scripts/configure-gmail-local.cjs services/dubai-backend/secrets/gmail-oauth-client.json
./scripts/stop-email-dev.ps1
./scripts/start-email-dev.ps1
```

Для production в GitHub environment `production-backend` нужны отдельные secrets `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_TOKEN_ENCRYPTION_KEY` (случайные 32 байта, 64 hex символа), а также variables `GMAIL_ENABLED=true`, `GMAIL_REDIRECT_URI=https://affera.co.uk/dxb/api/promotions/gmail/oauth/callback`. CI/CD добавляет только эти настройки к существующему ENV_FILE. Refresh token заранее не нужен: владелец почты авторизуется в приложении уже после deploy. Preflight проверяет настройки Web OAuth и R2 до перезапуска backend.

Google документирует [серверный OAuth с offline access](https://developers.google.com/identity/protocols/oauth2/web-server). Для внешнего приложения в режиме Testing добавьте нужный аккаунт в Test users; refresh token с Gmail scope в таком режиме обычно истекает через 7 дней. Для постоянной работы настройте production consent согласно требованиям Google.

## CLI OAuth (совместимость со старыми установками)

1. В Google Cloud создайте OAuth client типа **Desktop app**, включите Gmail API и настройте consent screen. В режиме Testing добавьте Gmail аккаунт в test users.
2. Сохраните предоставленный OAuth JSON в `services/dubai-backend/secrets/gmail-oauth-client.json`. JSON должен содержать объект `installed`.
3. Запустите в корне новой копии проекта:

```powershell
npm --prefix services/dubai-backend ci
npm --prefix services/dubai-backend run gmail:auth
```

Команда поднимает callback на `127.0.0.1` со свободным портом, использует state и PKCE, открывает Google OAuth и запрашивает только `https://www.googleapis.com/auth/gmail.readonly` с offline access. Полученные четыре настройки записываются в локальный `services/dubai-backend/secrets/gmail-token.env`; refresh token и client secret не печатаются в терминал. Перенесите настройки в backend `.env` или секреты production окружения. В production OAuth JSON и интерактивный вход не нужны.

Опционально можно задать `GMAIL_OAUTH_CREDENTIALS_FILE` и `GMAIL_AUTH_CALLBACK_PORT` для bootstrap-команды. Если браузер не открылся, используйте выведенную ссылку. Callback ждёт до пяти минут. Credentials, token-файлы, `.env` и каталог `secrets/` игнорируются Git.

Google поддерживает [loopback callback для desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app). При внешнем consent screen со статусом Testing refresh token с Gmail scope обычно [истекает через 7 дней](https://developers.google.com/identity/protocols/oauth2). Для постоянной интеграции проверьте статус приложения и требования Google consent/verification.

## ENV

Все значения есть в `.env.example` и передаются в `docker-compose.dubai.yml`:

```dotenv
GMAIL_ENABLED=false
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
GMAIL_USER=me
GMAIL_QUERY=has:attachment newer_than:30d
GMAIL_ALLOWED_SENDERS=
GMAIL_ALLOWED_EXTENSIONS=.pdf,.xlsx,.xls,.csv
GMAIL_POLL_INTERVAL_MS=60000
GMAIL_MAX_MESSAGES_PER_POLL=100
GMAIL_MAX_RETRIES=3
GMAIL_MAX_ATTACHMENT_BYTES=26214400
GMAIL_GLOBAL_DEDUPE_BY_HASH=false
```

`GMAIL_ALLOWED_SENDERS` — список email через запятую, например `allowed@example.com,second@example.com`. Если список пуст, разрешён любой корректный адрес; для production заполните список. From фильтр добавляется к Gmail search, затем фактический From ещё раз проверяется после `messages.get`. Тема письма может быть пустой и не используется как обязательный фильтр.

`GMAIL_MAX_RETRIES` ограничивает суммарное число попыток каждого вложения, включая первую. Временные Gmail запросы используют этот же предел с коротким exponential backoff. Размер ограничивается максимумом 25 МБ для Gmail и Web upload; ENV может уменьшить Gmail лимит.

Для Docker после помещения ENV в секреты/окружение:

```powershell
docker compose -f docker-compose.dubai.yml up --build -d backend-dubai
```

## Миграции и сохранение состояния

`027_gmail_imports.sql` создаёт историю `gmail_imports`, уникальность `(message_id, attachment_key)`, связь на source promotion document и журнал незавершённых R2 objects. `028_gmail_poll_cursor.sql` хранит pagination cursor; лимит 100 сообщений не оставляет старые письма навсегда за первой страницей. Cursor переживает рестарт, сбрасывается при изменении query/whitelist, при исчерпании результатов и при просроченном page token.

Backend выполняет миграции на старте; их также можно применить отдельно:

```powershell
npm --prefix services/dubai-backend run db:migrate
```

PostgreSQL session advisory lock допускает один poll одновременно даже при нескольких backend экземплярах. Потеря lock connection останавливает poll; attempt-count fencing защищает recovered claims от старого worker. R2 original, document, изменения прайса/интервалов/таблицы и успешный Gmail record формируют один import unit; DB часть коммитится одной транзакцией с savepoints для существующих repositories.

При ошибке DB изменения откатываются, R2 object удаляется. Если ответ COMMIT потерян, service проверяет созданный source document и возвращает успешный результат при подтверждённом commit. При недоступности DB/R2 cleanup откладывается в persistent object journal. Cleanup выполняется при старте backend и перед Gmail poll; активные транзакции пропускаются через `FOR UPDATE SKIP LOCKED`. Незавершённые ручные upload objects учитываются после 24 часов, чтобы не затронуть текущий upload.

По умолчанию одинаковый файл в другом письме является отдельным вложением. `GMAIL_GLOBAL_DEDUPE_BY_HASH=true` запрещает повторный импорт уже успешно обработанного SHA-256. Удаление promotion document не сбрасывает успешный Gmail статус; тот же attachment не появится снова при следующем poll.

Ключ вложения использует неизменяемый `partId` Gmail (при его отсутствии — позицию в MIME-дереве) и имя файла. `attachmentId` используется только для скачивания: изменение этого идентификатора между проверками не создаёт новый импорт. Google описывает `partId` как immutable в [Messages API](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages). В production включён `GMAIL_GLOBAL_DEDUPE_BY_HASH=true`; одноимённая GitHub variable в `production-backend` сохраняет настройку при следующих deploy и защищает старые записи с прежним ключом.

## Форматы и статусы

PDF сначала проверяется на `%PDF-`, затем реальный текст проходит существующий invoice parser: период акции, блок рекомендованных розничных цен и хотя бы один товар. Неподходящий PDF получает `invoice_structure_not_recognized`; image-only PDF получает `no_text_layer`. OCR не выполняется.

XLSX открывается ExcelJS, прайс определяется по конкретным колонкам существующего parser, план — по колонкам товара/цены/дат. Workbook с признаками сразу двух типов получает `ambiguous_workbook`. CSV должен быть корректным UTF-8 текстом с распознаваемой структурой плана. Legacy binary XLS не поддерживается ExcelJS и пропускается с `legacy_xls_needs_xlsx_conversion`; сохраните файл как XLSX. Signature images, пустые и слишком большие attachments пропускаются.

| Статус | Значение |
| --- | --- |
| `processing` | Вложение закреплено за текущей попыткой. После прерывания может восстановиться. |
| `success` | Оригинал и акции сохранены, `promotionDocumentId` связан с источником. |
| `skipped` | Неподходящий формат, структура, пустой файл или включённый hash dedupe. |
| `failed` | Ошибка импорта. `retryable=true` только пока есть оставшиеся временные попытки. |

Retry применяется к 408/429/5xx, сетевым временным ошибкам, transient R2/PostgreSQL и отсутствующему прайсу для накладной. Ошибки структуры/формата не повторяются. После исчерпания лимита исправленный документ можно загрузить вручную или получить новым письмом.

## API и Dashboard

Все promotion API требуют Ops auth. Ручной poll и удаление документов доступны только manager:

| Endpoint | Результат |
| --- | --- |
| `GET /api/health` | Cached `gmail` health; без Gmail или DB запроса. |
| `GET /api/promotions/gmail/imports?limit=50&offset=0&status=failed` | `{ imports, health }`, limit 1–100, статус необязателен. |
| `POST /api/promotions/gmail/poll` | Manager запускает poll; `{ result, health }`, 409 если занят, 503 если отключён/ошибка. |
| `POST /api/promotions/documents` | Существующий multipart upload через общий service, прежний ответ 201 `{ document, import }`. |
| `GET /api/promotions/documents/:documentId/preview` | Inline invoice PDF или ограниченный JSON spreadsheet preview. |
| `GET /api/promotions/documents/download?id=...` | Скачивание оригинала. |
| `GET /api/promotions/documents/final-table/preview` | Preview актуальной итоговой CSV таблицы. |
| `GET /api/promotions/rows/by-number/:rowNumber/price-tag.pdf` | Существующий ценник PDF. |
| `GET /api/promotions/rows/by-number/:rowNumber/poster-generated.pdf` | Существующий Google Drive PSD → PDF poster. |
| `POST /api/promotions/price-tags/batch.pdf` | Один многостраничный A4 PDF; см. [promotion-printing.md](promotion-printing.md). |

В «Акции → Документы» блок «Почта» показывает состояние подключения, время проверок/импортов и последние вложения. «Проверить почту» — дополнительный manager trigger; polling выполняется автоматически после запуска backend, затем через completion → timeout, без overlapping calls.

«Просмотреть» открывает документ внутри Dashboard. PDF preview предлагает «Печать» и «Скачать»; XLSX/CSV показывается таблицей максимум первых 3 sheets, 100 rows и 30 columns. Оригинал можно скачать отдельно. Blob URLs освобождаются при закрытии, новом preview и unmount.

## Проверка и диагностика

```powershell
npm --prefix services/dubai-backend run typecheck
npm --prefix services/dubai-backend test
npm --prefix services/dubai-backend run build
```

Для проверки через API используйте действующий Ops token в `$opsToken`, выставленный пользователем в локальной сессии:

```powershell
$headers = @{ Authorization = "Bearer $opsToken" }
Invoke-RestMethod http://localhost:4000/api/health
Invoke-RestMethod http://localhost:4000/api/promotions/gmail/poll -Method Post -Headers $headers
Invoke-RestMethod 'http://localhost:4000/api/promotions/gmail/imports?limit=10' -Headers $headers
```

У контейнера порт по умолчанию 4001 вместо 4000. Automated Gmail tests полностью mock, без реального Google account/network. Отдельный opt-in `tests/promotion-pipeline.postgres-smoke.js` проверяет настоящее disposable PostgreSQL, существующие parsers, provenance, дедупликацию, rollback, compensation и A4 generator; реальный Gmail/R2 там заменён локальными mocks.

Реальный smoke: отправьте письмо от whitelist sender с пустой темой и стандартной PDF накладной, дождитесь poll, убедитесь в `success`, исходном документе и новой строке акции. Повторный poll и рестарт не должны создавать ещё один документ. Откройте накладную/ценник/постер в preview, скачайте/распечатайте; затем сформируйте общий A4 PDF в toolbar «Печать ценников».

`invalid_grant` / 401: backend продолжает обслуживать другие routes, health выставляет `authenticated=false`; повторите `gmail:auth` и замените refresh token. Возможные причины: отозванный grant, истёкший Testing token, смена параметров аккаунта/приложения. При временных ошибках смотрите `attemptCount`, `retryable` и последние imports; при `no_text_layer` нужен документ с текстовым слоем. При отсутствии прайса загрузите его и дождитесь следующей оставшейся попытки.

Logs, health и Gmail history содержат только безопасные diagnostics, без client secret, refresh/access token и email body.
