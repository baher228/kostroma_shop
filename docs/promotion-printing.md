# Просмотр и печать акционных документов

## Работа в dashboard

В разделе «Акции» откройте «Документы». Кнопка «Просмотреть» открывает PDF или таблицу внутри dashboard. «Скачать» сохраняет исходный файл. Предпросмотр XLSX/CSV ограничен первыми 3 листами, 100 строками и 30 столбцами; длинные ячейки сокращаются. Полный оригинал остаётся доступен для скачивания. Старый бинарный XLS не поддерживает предпросмотр: скачайте файл или сохраните его как XLSX.

В карточке акции документы связаны с исходной накладной и планом. «Просмотреть ценник» использует существующий PSD-шаблон ценника. «Просмотреть постер» ищет PSD в Google Drive и открывает сформированный PDF. При отсутствии шаблона показано «Такой постер ещё не сделали». Gmail OAuth и Google Drive service account настраиваются отдельно.

В PDF-просмотре доступны «Печать», «Скачать PDF», «Закрыть». Печать вызывается через встроенный PDF viewer; если браузер запрещает её, PDF открывается в новой вкладке для Ctrl+P. Для точного размера выберите масштаб **100% / фактический размер**, отключите подгонку под лист. Для баннера на A4 нужна альбомная ориентация; для печати до краёв нужен принтер с подходящей областью печати или бумага большего формата. Поддержка встроенного PDF viewer и диалога печати зависит от браузера.

Постеры (баннеры) формируются на странице строго **297 × 160 мм**, независимо от размера PSD в пикселях и DPI. Рисунок сохраняет пропорции и целиком размещается по центру; у нестандартных пропорций остаются белые поля. Одиночный ценник остаётся **100 × 115 мм**, общий лист ценников — **A4, 210 × 297 мм**. Во все генерируемые PDF добавлено `/PrintScaling /None` (PDF 1.6): поддерживающий эту настройку просмотрщик по умолчанию печатает без масштабирования. Браузер или драйвер принтера может переопределить настройку, поэтому в предпросмотре есть напоминание о масштабе 100%.

## Общий PDF ценников

1. Нажмите «Печать ценников» в панели акций.
2. Выберите текущие, будущие, текущие и будущие акции либо отдельные строки. Для отдельных строк доступны поиск и флажки выбора.
3. При необходимости задайте период. В PDF попадут акции, пересекающиеся с ним, включая границы. Отсутствующая дата строки считается открытой границей.
4. Проверьте количество найденных и готовых к печати позиций. Строки без старой/новой цены или с некорректной ценой пропускаются. Цена 0 допустима.
5. Нажмите «Сформировать», затем «Печать» или «Скачать PDF» в предпросмотре.

Каждая страница: A4, 210 × 297 мм, вертикально. До 4 ценников размером 100 × 115 мм, сетка 2 × 2 с промежутком 2 мм по центру страницы. 5 ценников дают 2 страницы, 9 — 3, 12 — 3. Каждый выбранный номер строки появляется один раз. Порядок: дата начала (неизвестная дата в конце), название товара, номер строки.

Renderer и кеш PSD используются совместно с одиночными ценниками. Backend собирает один PDF без внутренних HTTP-запросов и повторной загрузки PSD для каждой строки.

## API

Все перечисленные endpoints требуют Ops bearer token.

| Метод и путь | Результат |
| --- | --- |
| `GET /api/promotions/documents/:documentId/preview` | PDF с `application/pdf` и inline disposition либо ограниченный JSON таблицы |
| `GET /api/promotions/documents/final-table/preview` | Предпросмотр актуальной итоговой таблицы без создания документа |
| `GET /api/promotions/documents/download?id=...` | Исходный документ |
| `GET /api/promotions/documents/final-table/download` | Актуальная итоговая таблица CSV |
| `GET /api/promotions/rows/by-number/:rowNumber/outputs` | Доступность ценника и постера, имя/оценка подходящего шаблона |
| `GET /api/promotions/rows/by-number/:rowNumber/price-tag.pdf` | Одиночный ценник PDF |
| `GET /api/promotions/rows/by-number/:rowNumber/poster-generated.pdf` | Постер PDF из Google Drive PSD |
| `POST /api/promotions/price-tags/batch.pdf` | Общий A4 PDF |

Тело batch-запроса:

```json
{
  "scope": "current_and_future",
  "rowNumbers": [],
  "from": null,
  "to": null,
  "layout": "a4_2x2"
}
```

`scope`: `current`, `future`, `current_and_future` (по умолчанию), `selected`. Для `selected` нужен непустой массив положительных целых `rowNumbers`; повторы удаляются. Даты — `YYYY-MM-DD`. `layout` сейчас только `a4_2x2`.

Ответ PDF содержит UTF-8 имя вида `Акционные_ценники_04.10.2026.pdf` и ASCII fallback. Заголовки `X-Price-Tags-Count`, `X-Price-Tags-Skipped-Count`, `X-Price-Tags-Skipped-Row-Numbers`, `X-Price-Tags-Page-Count` доступны browser JavaScript через CORS. При отсутствии пригодных строк возвращается 400 с понятным `message` и `skippedRowNumbers`.

```json
{
  "type": "table",
  "sheets": [{ "name": "Лист 1", "rows": [["Товар", "Цена"], ["Молоко", "55"]] }],
  "truncated": false
}
```

Предпросмотр не меняет данные, не сохраняет таблицы заново и не выполняет формулы. React показывает ячейки как текст. Blob URL освобождаются при закрытии, замене предпросмотра и размонтировании; устаревшие асинхронные ответы игнорируются.

## Проверки

Из корня нового клона:

```powershell
npm --prefix services/dubai-backend run typecheck
npm --prefix services/dubai-backend test
npm --prefix services/dubai-backend run build
.\web-dashboard\node_modules\.bin\tsc.cmd -b .\web-dashboard\tsconfig.json --pretty false
npm --prefix web-dashboard test
npm --prefix web-dashboard run build
```

HTTP smoke-test (токен задайте локально, не сохраняйте в репозитории):

```powershell
$apiBase = 'http://localhost:4001'
$opsHeaders = @{ Authorization = "Bearer $env:OPS_SMOKE_TOKEN" }
Invoke-RestMethod -Uri "$apiBase/api/promotions/documents/final-table/preview" -Headers $opsHeaders
$batchBody = @{ scope = 'current'; layout = 'a4_2x2' } | ConvertTo-Json
Invoke-WebRequest -Uri "$apiBase/api/promotions/price-tags/batch.pdf" -Method Post -Headers $opsHeaders -ContentType 'application/json' -Body $batchBody -OutFile "$env:TEMP/promotion-price-tags.pdf"
```

Проверки UI: накладная открывается без автоматического скачивания; оригинал скачивается отдельной кнопкой; ценник и постер открываются в preview; общий PDF из 9 готовых строк содержит 3 страницы. У таблиц с превышением лимитов показано предупреждение о сокращённом просмотре.

Дополнительный opt-in smoke-test выполняет весь импорт с настоящими PDF/XLSX/CSV и PostgreSQL; Gmail и R2 замокированы. Он проверяет приоритет источников, повторную проверку новым экземпляром сервиса, связи документов и строк, создание A4 PDF, транзакционный откат прайса и удаление R2 при ошибке. Запускайте только на временной локальной базе с именем, заканчивающимся на `_test`:

```powershell
docker run --detach --rm --name email-discount-test-postgres --publish 127.0.0.1:55439:5432 --env POSTGRES_USER=discount_test --env POSTGRES_PASSWORD=discount_test_local --env POSTGRES_DB=discount_test postgres:16-alpine
$env:PROMOTION_SMOKE_DATABASE_URL = 'postgresql://discount_test:discount_test_local@127.0.0.1:55439/discount_test'
npm --prefix services/dubai-backend run build
node services/dubai-backend/tests/promotion-pipeline.postgres-smoke.js
docker stop email-discount-test-postgres
```
