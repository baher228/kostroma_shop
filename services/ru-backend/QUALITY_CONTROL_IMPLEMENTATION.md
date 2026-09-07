# AI Quality Control: итоговый отчёт

## 1. Existing Analitika architecture

Analitika — monorepo с Expo/React Native клиентами, web dashboard и двумя отдельными Node.js 22 / TypeScript backend. Российский сервис использует Express 5, Zod, `pg`, последовательность route → service → repository, SQL-миграции с advisory lock и `node:test`. JWT middleware на каждом запросе заново загружает пользователя; роли: `manager`, `worker`, `store_tablet`. Персональная PostgreSQL и новый QC domain принадлежат RU backend. Dubai backend не получает аудио, транскрипты или QC-результаты.

В RU базе сотрудник — существующая запись `users` с ролью `worker`; магазин представлен уже используемым непрозрачным `shop_id`; отдельной таблицы смен нет. Поэтому QC ссылается на сотрудника FK, а необязательная смена — на существующее событие входа `worker_checkin_events` со статусом `in`. Сервис проверяет совпадение сотрудника, магазина и временного интервала.

## 2. Existing ML architecture

Реальное состояние старого Python-проекта, включая отличие рабочего кода от roadmap, разобрано в [ML_MIGRATION_AUDIT.md](./ML_MIGRATION_AUDIT.md). В нём работали FastAPI-сессии, загрузка через boto3, отдельные PostgreSQL/MinIO/Redis/Celery и Nexara text transcription. Preprocessing и analysis были заглушками; GigaChat, prompt, JSON schema, scorecard, FFmpeg, diarization/local inference и video analytics не были реализованы.

## 3. REUSE / ADAPT / REWRITE / DROP

Полная матрица находится в [QUALITY_CONTROL_PLAN.md](./QUALITY_CONTROL_PLAN.md). Коротко: понятия session/media/job/transcript, защита имени файла, Nexara timeout/empty-result и семь scorecard criteria адаптированы. HTTP, DTO, persistence, storage adapter и очередь переписаны на стек RU backend. Отдельные FastAPI, PostgreSQL, Redis/Celery, Docker application и Python API clients исключены из целевой архитектуры. Неиспользуемые Faster-Whisper/PyTorch/CUDA/pyannote/NeMo/YOLO и фиктивный FFmpeg stage не перенесены.

## 4. Новая AI QC architecture

`quality-control` содержит доменные типы, версионную схему, prompt, конфигурацию, MinIO adapter, Nexara/GigaChat providers и PostgreSQL worker. Express routes вызывают service, service управляет загрузкой, repository владеет SQL и RBAC scope. Долгие AI calls выполняются фоновым poller, который атомарно захватывает DB jobs через `FOR UPDATE SKIP LOCKED`, lease token и fencing.

## 5. Созданные файлы

- `src/quality-control/{types,config,analysis,providers,storage,worker}.ts`
- `src/quality-control/prompts/dialog-analysis.ts`
- `src/repositories/qualityControlRepository.ts`
- `src/services/qualityControlService.ts`
- `src/routes/qualityControlRoutes.ts`
- `migrations/010_quality_control.sql`
- `tests/quality-control.{providers,integration,routes}.test.js`
- `tests/quality-control.db-helper.js`
- `ML_MIGRATION_AUDIT.md`, `QUALITY_CONTROL_PLAN.md`, этот отчёт

## 6. Изменённые файлы

`russiaApp.ts` регистрирует routes, `server.ts` валидирует config и запускает/останавливает worker. Обновлены package manifests, test runner, RU environment example и оба Compose-файла. Tablet API/queue теперь обращаются с текущим JWT к RU `/api/quality-control`, загружают multipart туда же и опрашивают серверный status; прежний URL отдельного ML backend удалён из `.env.example`. Уже имевшиеся пользовательские изменения локальной истории записей сохранены.

## 7. Migration

Добавлена только новая additive migration `010_quality_control.sql`; applied migrations не менялись. Она создаёт FK, composite provenance constraints, checks, unique idempotency/current-job constraints и индексы по session/shop/seller/shift/time/class/job polling.

## 8. Database tables/entities

- `qc_sessions`: существующие shop/seller/shift ссылки, владелец, время, lifecycle.
- `qc_media`: MinIO key/bucket, безопасное исходное имя, MIME, size, duration, SHA-256; один audio на сессию.
- `qc_processing_jobs`: stage, attempt, retry time, lease/fencing, safe stage error.
- `qc_transcripts` и `qc_transcript_segments`: provider metadata, optional raw audit result и canonical timeline.
- `qc_analysis_results`: полная validated JSON, стабильные analytics columns, technical metadata и возрастающая session-local version.
- `qc_criterion_scores`: нормализованные семь критериев.

## 9. Existing MinIO

RU backend подключается к указанным `S3_ENDPOINT_URL` и `S3_BUCKET_AUDIO` через S3-compatible AWS SDK с `forcePathStyle`. Он не создаёт bucket/instance, не меняет policy и не формирует public URL. Object key: `quality-control/shops/{shopId}/sessions/{sessionId}/audio/{sha256}.{ext}`. PostgreSQL хранит только key и metadata. Upload/read имеют size/concurrency/time limits; подпись файла проверяется, имя клиента не входит в key. R2 не используется.

## 10. QC session lifecycle

`created → queued → transcribing → analysis_queued → analyzing → completed`. Терминальные ошибки: `transcription_failed` и `analysis_failed`. Временная ошибка возвращает job в `queued` с bounded exponential backoff; permanent/исчерпавшая попытки остаётся `failed`. `externalSessionId` обеспечивает идемпотентность tablet recording, а повторный upload того же SHA возвращает существующую media/job.

## 11. Audio → Nexara → transcript → GigaChat → analysis

HTTP upload сохраняет MinIO object и в одной DB-транзакции metadata + transcription job, затем отвечает 202. Worker скачивает конкретную media, вызывает `SttProvider`, атомарно сохраняет canonical transcript и публикует analysis job. Второй stage отправляет минимальную проекцию диалога в `LlmAnalysisProvider`, валидирует strict JSON, пересчитывает score/class и одной транзакцией сохраняет result, criteria и completed statuses.

## 12. Canonical transcript

`DialogTranscript` содержит только `sessionId`, optional `language`/`duration` и `segments[]` с optional start/end/confidence, speaker и text. Raw Nexara JSON не используется business logic. Если provider вернул только text, создаётся один segment с `speaker=unknown` и `start/end=null`; роли и времена не выдумываются.

## 13. NexaraSttProvider

Provider использует проверенный REST endpoint `POST /v1/audio/transcriptions`, Bearer API key, multipart audio/model/task, `verbose_json` и segment timestamps. Он отображает ответ в canonical model, ограничивает timeout/response size, отклоняет empty/invalid timing и классифицирует auth/rate-limit/timeout/provider errors, не сохраняя сырой текст исключений. Контракт сверялся с [официальной документацией Nexara](https://docs.nexara.ru/api-reference/create_transcription_audio_transcriptions_post).

## 14. GigaChatAnalysisProvider

Provider принимает только language и пары speaker/text; session/seller/user/device/storage IDs не пересылаются. Он использует strict native JSON schema, низкую temperature, лимиты input/output, отклоняет incomplete/invalid JSON и повторно валидирует результат Zod, включая наличие evidence в транскрипте.

## 15. GigaChat authentication

Используется официальный JS SDK `gigachat` с постоянным `GIGACHAT_AUTH_KEY` и scope. Один экземпляр SDK получает, кеширует и обновляет access token; своего scheduler/cache/БД для token нет. TLS verification не отключается; при необходимости задаётся PEM bundle. Поведение initial OAuth + cached token + renewal после 401 проверено fake transport тестом. Основание — [официальный SDK](https://developers.sber.ru/docs/ru/gigachain/tools/js/gigachat).

## 16. Structured JSON schema

Версия 1.0 содержит `summary`, фиксированный `quality.criteria`, `customer`, `dialog`, `strengths`, `problems`, `violations`, `recommendations`. Findings имеют severity, description и nullable evidence. Zod schema одновременно генерирует provider JSON Schema и выполняет runtime validation. Extra keys и несогласованные score/status отклоняются. GigaChat strict contract сверялся с [официальным structured output guide](https://developers.sber.ru/docs/ru/gigachat/guides/structured-output).

## 17–20. Prompt и версии

Prompt расположен в `src/quality-control/prompts/dialog-analysis.ts`. Текущие `prompt_version`, `scorecard_version`, `schema_version` равны `1.0`; все три сохраняются на каждом analysis вместе с provider/model. Каждая повторная оценка получает монотонный `version`, старая история остаётся доступной.

## 21. Overall score

Backend игнорирует заявленный LLM итог и пересчитывает `round(sum(score) / sum(maxScore) * 100, 2)` по применимым критериям. `not_applicable` обязан иметь score 0 и исключается из знаменателя; хотя бы один критерий должен быть применим.

## 22. Good / neutral / bad

Классификация выполняется только backend: `good >= 80`, `neutral >= 60`, иначе `bad`. Пороги централизованы и меняются через `QC_QUALITY_*`. `customer_sentiment` хранится отдельно и не влияет на class.

## 23. Analytics-friendly columns

Отдельно индексируются/хранятся overall score, quality class, sentiment, satisfaction, conflict/complaint/objection flags, violation and critical counts, provider/model/versions/analyzed time. Criteria нормализованы, поэтому dashboard не разбирает JSON для агрегатов.

## 24. Session API

- `POST/GET /api/quality-control/sessions`
- `GET /api/quality-control/sessions/:id`
- `POST .../:id/audio` (202)
- `POST .../:id/process` и `POST .../:id/reanalyze` (202; reanalysis требует Idempotency-Key)
- `GET .../:id/status`, `/transcript`, `/analysis?history=true|false`, `/scorecard`, `/recommendations`

Manager имеет management/read access; worker видит только собственные sensitive results; tablet ограничен своим shop и не читает transcript/analysis. Все routes используют существующий JWT/RBAC.

## 25. Analytics API

`GET /api/quality-control/analytics/{overview|trends|criteria|sellers|shops}`. Доступ manager. Filters: from/to, shopId, sellerId, shiftId, qualityClass; trends поддерживает day/week/month и группирует по московскому времени. Overview отдаёт total/processed, average, good/neutral/bad и проценты, conflicts, complaints, violations/critical violations.

## 26. Tests

Добавлены provider contract/error/schema/privacy tests; actual official SDK token lifecycle с fake HTTP; все migrations в disposable PostgreSQL; FK/check constraints; relation/scope/idempotency; file signatures/limits; fake MinIO; полный двухэтапный worker; retries; expired-lease fencing; versioned reanalysis; overview/trend/criteria SQL; HTTP routes/status codes/role gates/date normalization. Реальные Nexara/GigaChat вызовы automated tests не выполняют.

## 27–28. Validation commands and results

- `npm --prefix services/ru-backend test`: 43/43 passed.
- `npm run backend:test`: RU 43/43 and Dubai 19/19 passed.
- `npm run typecheck`: passed for frontend, worker app, RU and Dubai backends.
- `npm run dashboard:build`: passed.
- `docker compose -f docker-compose.ru.yml config --no-interpolate`: passed (Docker CLI emitted a local config-file access warning, model rendered correctly).
- `git diff --check`: passed.
- Separate lint command is not defined in this repository.
- RU production dependency audit: no high/critical findings; three moderate advisories remain under the already existing Express dependency and have no currently available nonbreaking fix.

## 29. Remaining TODO

Live-provider smoke tests remain opt-in because this workspace has no approved test audio/credentials. The future web QC page and video pipeline remain outside Audio MVP. A retention/deletion policy for server-side audio/raw transcripts must be set by the product/data owner before production.

## 30. Architecture risks

RU schema has no shop master table; it intentionally retains the existing `shop_id` convention and validates IDs from RU assignments/check-ins rather than copying Dubai shop rows. “Shift” is currently a check-in event because no shift entity exists. Embedded worker mode is reliable via PostgreSQL leases but one worker per replica increases external concurrency; provider quotas must define replica count/polling. MinIO connectivity and GigaChat CA trust differ by deployment and require staging verification.

## 31. Before production deployment

Back up RU PostgreSQL and apply migration in staging; configure the existing private MinIO endpoint/bucket and network route; inject Nexara/GigaChat secrets via deployment secret storage; install/verify CA bundle; confirm provider data-processing geography/contracts and consent; define retention/redaction/access audit policies; set quotas/timeouts/worker replica count; run live smoke tests with approved nonproduction audio; monitor failure codes/latency without logging transcripts or tokens; only then set `QC_ENABLED=true`.
