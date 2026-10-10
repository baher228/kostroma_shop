# Email downloading discount — отчёт о реализации

Дата проверки: 04.10.2026.

Рабочая копия: `C:\Users\george\projects\kostroma_shop-1\email-downloading-discount`.
Ветка: `email-downloading-discount`. Основа — актуальная на момент клонирования default branch `master`, commit `8dc186c1eb0e905d99d861153efdde4e0931cc7b` (`Add small sliced baton product`). Commit `407d37c` использован только как reference. Работа выполнена с тремя агентами: Gmail/backend, печать PDF, dashboard.

Исходная копия проекта сохранена. Её существующие изменения в `README.md`, `package-lock.json` и локальный `.npmrc` не менялись. Коммиты, push и deployment не выполнялись.

## 1. Что реализовано

- Общий service импорта для ручной загрузки и Gmail с существующими parser, product matcher, расчётами цен и правилами интервалов.
- Gmail Desktop OAuth с единственным scope `gmail.readonly`, offline refresh token, localhost callback, state и PKCE. Gmail credentials отделены от Google Drive service account.
- Автоматический polling, manager trigger, whitelist отправителей, рекурсивный MIME, inline/attachmentId, проверка размера/расширения/signature/структуры, SHA-256, приоритет прайс → план → накладная.
- Persistent история, уникальность вложения, ограниченные retry, восстановление после рестарта, PostgreSQL lock, fencing попыток и сохранённая пагинация. Health не делает запросов в Google.
- Транзакционный импорт DB с компенсацией R2, восстановлением незавершённых uploads и проверкой неоднозначного результата COMMIT.
- Просмотр исходных PDF и таблиц, актуальной итоговой таблицы, ценников и постеров внутри dashboard. Отдельные команды скачивания и печати.
- Общий PDF ценников: текущие/будущие/выбранные акции, поиск, период, пропуск строк без цен, стабильная сортировка, A4 2×2, ценник 100×115 мм, до четырёх на страницу.
- Автоматические регрессионные тесты, отдельный smoke-test настоящей PostgreSQL и инструкции настройки.

## 2. Архитектура pipeline

```text
Gmail readonly OAuth → poll lock + persistent cursor
  → рекурсивный MIME → sender / size / format / content checks
  → классификация и сортировка: прайс → план → накладная
  → claim gmail_imports + SHA-256 + attempt fencing
  → importPromotionDocument ← ручная Web upload
  → original в R2 + единая DB transaction
      → существующие parsers / matcher / интервалы / цены
      → source document + promotion rows + Gmail success
  → dashboard document / price tag / Drive poster preview
  → скачать / печатать

promotion rows → scope / даты / выбранные строки / readiness
  → существующий renderer + общий кеш PSD
  → один A4 PDF 2×2 → preview → скачать / печатать
```

R2 не является участником PostgreSQL transaction: при ошибке DB объект удаляется, а незавершённая очистка остаётся в persistent журнале. При потере ответа COMMIT проверяется сохранённый source document. Успешное вложение не импортируется снова даже после удаления связанного документа.

## 3. Новые файлы

```text
docs/email-downloading-discount-report.md
docs/gmail-import.md
docs/promotion-printing.md
services/dubai-backend/migrations/027_gmail_imports.sql
services/dubai-backend/migrations/028_gmail_poll_cursor.sql
services/dubai-backend/src/gmail/gmailAttachmentClassifier.ts
services/dubai-backend/src/gmail/gmailAttachmentParser.ts
services/dubai-backend/src/gmail/gmailClient.ts
services/dubai-backend/src/gmail/gmailPoller.ts
services/dubai-backend/src/gmail/gmailService.ts
services/dubai-backend/src/repositories/gmailImportsRepository.ts
services/dubai-backend/src/routes/gmailRoutes.ts
services/dubai-backend/src/scripts/gmailAuth.ts
services/dubai-backend/src/services/promotionDocumentImportService.ts
services/dubai-backend/src/services/promotionDocumentPreviewService.ts
services/dubai-backend/src/services/promotionOutputsService.ts
services/dubai-backend/src/services/promotionPriceTagBatchService.ts
services/dubai-backend/tests/gmail-import.test.js
services/dubai-backend/tests/helpers/promotion-invoice-fixture.js
services/dubai-backend/tests/promotion-document-import-routes.test.js
services/dubai-backend/tests/promotion-document-import.test.js
services/dubai-backend/tests/promotion-document-preview.test.js
services/dubai-backend/tests/promotion-import-transaction.test.js
services/dubai-backend/tests/promotion-invoice-recognition.test.js
services/dubai-backend/tests/promotion-pipeline.postgres-smoke.js
services/dubai-backend/tests/promotion-price-tag-batch.test.js
web-dashboard/src/components/DocumentPreviewModal.tsx
web-dashboard/src/components/documentPreviewState.ts
web-dashboard/src/panels/promotions/BatchPriceTagsModal.tsx
web-dashboard/src/panels/promotions/GmailImportStatus.tsx
web-dashboard/src/panels/promotions/batchSelection.ts
web-dashboard/tests/document-preview-state.test.mjs
web-dashboard/tests/promotion-batch-selection.test.mjs
```

## 4. Изменённые файлы

```text
.gitignore
docker-compose.dubai.yml
services/dubai-backend/.env.example
services/dubai-backend/package-lock.json
services/dubai-backend/package.json
services/dubai-backend/src/app/appMiddleware.ts
services/dubai-backend/src/app/dubaiApp.ts
services/dubai-backend/src/config/config.ts
services/dubai-backend/src/db/opsDb.ts
services/dubai-backend/src/repositories/promotionDocumentsRepository.ts
services/dubai-backend/src/repositories/promotionPriceListRepository.ts
services/dubai-backend/src/repositories/promotionRowsRepository.ts
services/dubai-backend/src/routes/promotionDocumentsRoutes.ts
services/dubai-backend/src/routes/promotionRowsRoutes.ts
services/dubai-backend/src/server.ts
services/dubai-backend/src/services/googleDrivePosterService.ts
services/dubai-backend/src/services/promotionInvoiceImportService.ts
services/dubai-backend/src/services/promotionPlanImportService.ts
services/dubai-backend/src/services/promotionPriceListImportService.ts
services/dubai-backend/src/services/promotionPriceTagPdfService.ts
services/dubai-backend/tests/run-tests.js
web-dashboard/src/api.ts
web-dashboard/src/panels/promotions/PromotionsPanel.tsx
web-dashboard/src/styles.css
web-dashboard/src/types.ts
```

## 5. Миграции

| Файл | Назначение |
| --- | --- |
| `027_gmail_imports.sql` | История вложений, уникальный message/attachment, attempts/status/hash/source document; журнал pending R2 objects |
| `028_gmail_poll_cursor.sql` | Persistent query/page token, чтобы ограничение сообщений не оставляло backlog за первой страницей |

Номера 024–026 сохранены. Backend применяет миграции на старте; отдельно: `npm --prefix services/dubai-backend run db:migrate`.

## 6. ENV

Production настройки присутствуют в `.env.example` и передаются Docker Compose:

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

Локальная bootstrap настройка: `GMAIL_OAUTH_CREDENTIALS_FILE=secrets/gmail-oauth-client.json`; опционально `GMAIL_AUTH_CALLBACK_PORT`. Пустая whitelist разрешает любой корректный From; для нужного ограничения заполните `GMAIL_ALLOWED_SENDERS` адресами через запятую. Максимальный размер — 25 МБ; ENV может уменьшить лимит. Три попытки включают первую.

## 7. API endpoints

| Endpoint | Назначение |
| --- | --- |
| `GET /api/health` | Cached Gmail health |
| `GET /api/promotions/gmail/imports?limit=50&offset=0&status=failed` | История и health |
| `POST /api/promotions/gmail/poll` | Ручная проверка, manager; 409 при занятом poll, 503 при отключении/ошибке |
| `POST /api/promotions/documents` | Прежний multipart upload через общий service |
| `GET /api/promotions/documents/:documentId/preview` | Inline PDF или ограниченная таблица JSON |
| `GET /api/promotions/documents/download?id=...` | Оригинал |
| `GET /api/promotions/documents/final-table/preview` | Актуальная итоговая таблица |
| `GET /api/promotions/documents/final-table/download` | Актуальная итоговая CSV |
| `GET /api/promotions/rows/by-number/:rowNumber/outputs` | Доступность ценника/постера и template match |
| `GET /api/promotions/rows/by-number/:rowNumber/price-tag.pdf` | Существующий одиночный ценник |
| `GET /api/promotions/rows/by-number/:rowNumber/poster-generated.pdf` | Существующий Drive poster |
| `POST /api/promotions/price-tags/batch.pdf` | Один A4 PDF с metadata headers |

Promotion endpoints требуют Ops bearer token. Batch body: `{ "scope": "current_and_future", "rowNumbers": [], "from": null, "to": null, "layout": "a4_2x2" }`. Scope также `current`, `future`, `selected`. Полный контракт и response headers: [promotion-printing.md](promotion-printing.md).

## 8. Gmail OAuth setup commands

Создайте Google OAuth Desktop client, включите Gmail API и сохраните JSON с объектом `installed` в `services/dubai-backend/secrets/gmail-oauth-client.json`.

```powershell
Set-Location C:\Users\george\projects\kostroma_shop-1\email-downloading-discount
npm --prefix services/dubai-backend ci
npm --prefix web-dashboard ci
npm --prefix services/dubai-backend run gmail:auth
```

В браузере разрешите чтение Gmail. Команда сохранит настройки в игнорируемый `services/dubai-backend/secrets/gmail-token.env`. Перенесите их в backend `.env` или production secrets, задайте whitelist и `GMAIL_ENABLED=true`. Для работы imports нужны существующие PostgreSQL и R2 настройки; Drive service account нужен только постерам.

```powershell
npm --prefix services/dubai-backend run db:migrate
npm --prefix services/dubai-backend run dev
```

В отдельной локальной сессии: `npm --prefix web-dashboard run dev`. Docker команда и особенности Google Testing tokens: [gmail-import.md](gmail-import.md).

## 9. Smoke-test команды

Локальная интеграционная проверка использует disposable PostgreSQL, настоящие parsers и PDF renderer; Gmail/R2 заменены mocks:

```powershell
docker run --detach --rm --name email-discount-test-postgres --publish 127.0.0.1:55439:5432 --env POSTGRES_USER=discount_test --env POSTGRES_PASSWORD=discount_test_local --env POSTGRES_DB=discount_test postgres:16-alpine
$env:PROMOTION_SMOKE_DATABASE_URL = 'postgresql://discount_test:discount_test_local@127.0.0.1:55439/discount_test'
npm --prefix services/dubai-backend run build
node services/dubai-backend/tests/promotion-pipeline.postgres-smoke.js
docker stop email-discount-test-postgres
```

Скрипт отказывается работать с нелокальной базой и именем без суффикса `_test`. Созданный во время реализации тестовый контейнер остановлен и удалён.

После настройки настоящего mailbox задайте свой manager Ops token локально:

```powershell
$apiBase = 'http://localhost:4001' # Docker; локальный backend обычно 4000
$opsHeaders = @{ Authorization = "Bearer $env:OPS_SMOKE_TOKEN" }
Invoke-RestMethod "$apiBase/api/health"
Invoke-RestMethod "$apiBase/api/promotions/gmail/poll" -Method Post -Headers $opsHeaders
Invoke-RestMethod "$apiBase/api/promotions/gmail/imports?limit=10" -Headers $opsHeaders
Invoke-RestMethod "$apiBase/api/promotions/documents/final-table/preview" -Headers $opsHeaders
$batchBody = @{ scope = 'current'; layout = 'a4_2x2' } | ConvertTo-Json
Invoke-WebRequest "$apiBase/api/promotions/price-tags/batch.pdf" -Method Post -Headers $opsHeaders -ContentType 'application/json' -Body $batchBody -OutFile "$env:TEMP/promotion-price-tags.pdf"
```

Отправьте письмо от whitelist sender с пустой темой и накладной, проверьте success/source document/строку. Повторный poll и рестарт должны оставить одну обработку. Через UI проверьте исходный PDF, ценник, Drive poster и общий PDF из девяти готовых строк: три страницы.

## 10. Как открыть preview

«Акции → Документы → Просмотреть» открывает PDF или таблицу. В карточке акции доступны исходная накладная/план, «Просмотреть ценник», «Просмотреть постер». Отдельно доступна итоговая таблица. PDF имеет команды «Печать», «Скачать PDF», «Закрыть»; при запрете встроенной печати используется новая вкладка и Ctrl+P. Автоматического скачивания при открытии нет.

Таблица показывает максимум 3 листа, 100 строк и 30 столбцов, длинные ячейки сокращены. Полный оригинал доступен отдельно. Blob URLs освобождаются, устаревшие async responses не заменяют новое preview.

## 11. Как сформировать общий PDF ценников

Нажмите «Печать ценников», выберите текущие/будущие/оба типа либо отдельные строки. Используйте поиск и фильтр периода. Проверьте число готовых позиций, нажмите «Сформировать», затем печатайте или скачивайте в preview.

Каждая страница A4 portrait, четыре позиции 100×115 мм, сетка 2×2, промежуток 2 мм. Печатайте с масштабом 100% / фактический размер. Строки без старой/новой цены пропускаются с metadata; цена 0 допустима. Если пригодных позиций нет, API отвечает 400. Порядок: начало акции, товар, номер строки; неизвестная дата в конце. PSD/template renderer переиспользуется и кешируется.

## 12. Результаты tests / typecheck / build

| Проверка | Результат |
| --- | --- |
| Backend `npm --prefix services/dubai-backend run typecheck` | PASS |
| Backend `npm --prefix services/dubai-backend test` | 110/110 PASS, 0 failed/skipped |
| Backend `npm --prefix services/dubai-backend run build` | PASS |
| Dashboard `tsc -b web-dashboard/tsconfig.json` | PASS |
| Dashboard `npm --prefix web-dashboard test` | 29/29 PASS |
| Dashboard `npm --prefix web-dashboard run build` | PASS |
| `docker compose -f docker-compose.dubai.yml config --quiet` | PASS с локальными тестовыми ENV |
| Все migrations 001–028 на временной PostgreSQL | PASS |
| Настоящий PostgreSQL pipeline smoke | PASS |
| `git diff --check` | PASS |

Dashboard typecheck из корня: `.\web-dashboard\node_modules\.bin\tsc.cmd -b .\web-dashboard\tsconfig.json --pretty false`.

Проверены PDF signature/структура/no-text-layer, пустая тема, MIME/sender/лимиты, порядок прайс→план→накладная, retry/dedupe/restart, смена query/просроченный cursor, потеря poll lock, транзакционный rollback/R2 cleanup/COMMIT ambiguity, авторизация routes, bounded preview и URL lifecycle, scopes/даты/цены, batch на 1/4/5/12 ценников и размеры A4.

Настоящие Gmail/OAuth/R2/Drive запросы и диалог браузерной печати не проверялись: credentials и доступный браузерный сеанс не предоставлены. Automated tests не используют реальные секреты. Бинарный legacy XLS требует конвертации в XLSX; PDF без текстового слоя получает `no_text_layer`, OCR не добавлен. Это отражено в UI diagnostics и setup документации.

## 13. git diff --stat

Команда учитывает tracked изменения; новые файлы пока untracked и перечислены выше и в status ниже.

```text
 .gitignore                                         |   3 +
 docker-compose.dubai.yml                           |  13 +
 services/dubai-backend/.env.example                |  17 +
 services/dubai-backend/package-lock.json           | 782 +++++++++++++++++++++
 services/dubai-backend/package.json                |   5 +-
 services/dubai-backend/src/app/appMiddleware.ts    |   6 +-
 services/dubai-backend/src/app/dubaiApp.ts         |   5 +-
 services/dubai-backend/src/config/config.ts        |  18 +
 services/dubai-backend/src/db/opsDb.ts             |  61 +-
 .../repositories/promotionDocumentsRepository.ts   |   2 +-
 .../repositories/promotionPriceListRepository.ts   |   2 +-
 .../src/repositories/promotionRowsRepository.ts    |   4 +-
 .../src/routes/promotionDocumentsRoutes.ts         |  73 +-
 .../src/routes/promotionRowsRoutes.ts              |  42 ++
 services/dubai-backend/src/server.ts               |  23 +-
 .../src/services/googleDrivePosterService.ts       |  27 +-
 .../src/services/promotionInvoiceImportService.ts  |  39 +-
 .../src/services/promotionPlanImportService.ts     |   9 +-
 .../services/promotionPriceListImportService.ts    |  13 +-
 .../src/services/promotionPriceTagPdfService.ts    | 109 ++-
 services/dubai-backend/tests/run-tests.js          |   7 +
 web-dashboard/src/api.ts                           |  48 +-
 .../src/panels/promotions/PromotionsPanel.tsx      | 174 +++--
 web-dashboard/src/styles.css                       | 258 ++++++-
 web-dashboard/src/types.ts                         |  44 ++
 25 files changed, 1649 insertions(+), 135 deletions(-)
```

## 14. git status

`git status --short --untracked-files=all` в новой копии; изменений в index нет:

```text
 M .gitignore
 M docker-compose.dubai.yml
 M services/dubai-backend/.env.example
 M services/dubai-backend/package-lock.json
 M services/dubai-backend/package.json
 M services/dubai-backend/src/app/appMiddleware.ts
 M services/dubai-backend/src/app/dubaiApp.ts
 M services/dubai-backend/src/config/config.ts
 M services/dubai-backend/src/db/opsDb.ts
 M services/dubai-backend/src/repositories/promotionDocumentsRepository.ts
 M services/dubai-backend/src/repositories/promotionPriceListRepository.ts
 M services/dubai-backend/src/repositories/promotionRowsRepository.ts
 M services/dubai-backend/src/routes/promotionDocumentsRoutes.ts
 M services/dubai-backend/src/routes/promotionRowsRoutes.ts
 M services/dubai-backend/src/server.ts
 M services/dubai-backend/src/services/googleDrivePosterService.ts
 M services/dubai-backend/src/services/promotionInvoiceImportService.ts
 M services/dubai-backend/src/services/promotionPlanImportService.ts
 M services/dubai-backend/src/services/promotionPriceListImportService.ts
 M services/dubai-backend/src/services/promotionPriceTagPdfService.ts
 M services/dubai-backend/tests/run-tests.js
 M web-dashboard/src/api.ts
 M web-dashboard/src/panels/promotions/PromotionsPanel.tsx
 M web-dashboard/src/styles.css
 M web-dashboard/src/types.ts
?? docs/email-downloading-discount-report.md
?? docs/gmail-import.md
?? docs/promotion-printing.md
?? services/dubai-backend/migrations/027_gmail_imports.sql
?? services/dubai-backend/migrations/028_gmail_poll_cursor.sql
?? services/dubai-backend/src/gmail/gmailAttachmentClassifier.ts
?? services/dubai-backend/src/gmail/gmailAttachmentParser.ts
?? services/dubai-backend/src/gmail/gmailClient.ts
?? services/dubai-backend/src/gmail/gmailPoller.ts
?? services/dubai-backend/src/gmail/gmailService.ts
?? services/dubai-backend/src/repositories/gmailImportsRepository.ts
?? services/dubai-backend/src/routes/gmailRoutes.ts
?? services/dubai-backend/src/scripts/gmailAuth.ts
?? services/dubai-backend/src/services/promotionDocumentImportService.ts
?? services/dubai-backend/src/services/promotionDocumentPreviewService.ts
?? services/dubai-backend/src/services/promotionOutputsService.ts
?? services/dubai-backend/src/services/promotionPriceTagBatchService.ts
?? services/dubai-backend/tests/gmail-import.test.js
?? services/dubai-backend/tests/helpers/promotion-invoice-fixture.js
?? services/dubai-backend/tests/promotion-document-import-routes.test.js
?? services/dubai-backend/tests/promotion-document-import.test.js
?? services/dubai-backend/tests/promotion-document-preview.test.js
?? services/dubai-backend/tests/promotion-import-transaction.test.js
?? services/dubai-backend/tests/promotion-invoice-recognition.test.js
?? services/dubai-backend/tests/promotion-pipeline.postgres-smoke.js
?? services/dubai-backend/tests/promotion-price-tag-batch.test.js
?? web-dashboard/src/components/DocumentPreviewModal.tsx
?? web-dashboard/src/components/documentPreviewState.ts
?? web-dashboard/src/panels/promotions/BatchPriceTagsModal.tsx
?? web-dashboard/src/panels/promotions/GmailImportStatus.tsx
?? web-dashboard/src/panels/promotions/batchSelection.ts
?? web-dashboard/tests/document-preview-state.test.mjs
?? web-dashboard/tests/promotion-batch-selection.test.mjs
```

Всего: 25 изменённых tracked файлов и 33 новых файла. OAuth JSON, `.env` и token files отсутствуют в status и игнорируются Git.
