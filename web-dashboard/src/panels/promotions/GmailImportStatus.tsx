import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { Feedback } from '../../components/ui';
import { messageOf } from '../../shared/format';
import type { GmailHealth, GmailImport, GmailDelivery,GmailDeliverySettings,Session } from '../../types';
import { GmailDeliveryPanel } from './GmailDeliveryPanel';

const statuses: Record<GmailImport['status'], string> = {
  processing: 'Обрабатывается', success: 'Импортирован', failed: 'Ошибка импорта', skipped: 'Пропущен',
};
const importReasons: Record<string, string> = {
  signature_image: 'Изображение из письма или подписи пропущено.',
  unsupported_extension: 'Формат вложения не разрешён.',
  mime_type_mismatch: 'Тип содержимого не соответствует расширению файла.',
  attachment_too_large: 'Вложение превышает допустимый размер.',
  empty_attachment: 'Вложение пустое.',
  invalid_pdf: 'Файл не является корректным PDF.',
  no_text_layer: 'В PDF нет текстового слоя. Нужен исходный PDF с текстом.',
  invoice_structure_not_recognized: 'В PDF не распознаны период акции и рекомендованные розничные цены.',
  ambiguous_workbook: 'В файле есть признаки и прайса, и плана. Загрузите его вручную с выбранным типом.',
  invalid_content_or_document_structure: 'Файл не читается или его структура не распознана.',
  document_structure_not_recognized: 'Структура акционного документа не распознана.',
  legacy_xls_needs_xlsx_conversion: 'Сохраните старый XLS в формате XLSX или CSV и загрузите повторно.',
  duplicate_file_hash: 'Такой файл уже импортирован.',
  attachment_content_changed: 'Содержимое вложения изменилось во время проверки.',
};
const dateTime = (value: string | null) => value ? new Date(value).toLocaleString('ru-RU') : 'Ещё не было';

export const GmailImportStatus = ({ session, onImported }: { session: Session; onImported: () => void | Promise<void> }) => {
  const [health, setHealth] = useState<GmailHealth | null>(null);
  const [imports, setImports] = useState<GmailImport[]>([]);
  const [deliverySettings,setDeliverySettings]=useState<GmailDeliverySettings|null>(null);
  const [deliveries,setDeliveries]=useState<GmailDelivery[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(() => {
    const result = new URLSearchParams(window.location.search).get('gmail');
    return result === 'connected' ? 'Gmail подключён. Почта будет проверяться автоматически.'
      : result === 'busy' ? 'Сейчас выполняется импорт. Подключите Gmail повторно после завершения проверки.'
      : result === 'failed' ? 'Gmail не подключён. Повторите подключение и разрешите чтение почты.' : '';
  });
  const [polling, setPolling] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const connectionPending = useRef(false);
  const importedCallback = useRef(onImported);
  importedCallback.current = onImported;
  const lastImport = useRef<string | null | undefined>(undefined);
  const historyRequest = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);
  const pollPending = useRef(false);
  const sessionToken = useRef(session.token);
  sessionToken.current = session.token;

  const load = async () => {
    if (sessionToken.current !== session.token || !mounted.current) return;
    if (historyRequest.current) return historyRequest.current;
    const request = (async () => {
      try {
        const result = await api.promotions.gmailImports(session.token);
        if (!mounted.current || sessionToken.current !== session.token) return;
        setHealth(result.health);
        setImports(result.imports);
        setDeliverySettings(result.settings??null);setDeliveries(result.deliveries??[]);
        setError('');
        const changed = lastImport.current !== undefined && result.health.lastImportAt !== lastImport.current;
        lastImport.current = result.health.lastImportAt;
        if (changed && result.health.lastImportAt) await importedCallback.current();
      } catch (error) {
        if (mounted.current && sessionToken.current === session.token) setError(messageOf(error));
      }
    })();
    historyRequest.current = request;
    await request;
    if (historyRequest.current === request) historyRequest.current = null;
  };

  useEffect(() => {
    mounted.current = true;
    const url = new URL(window.location.href);
    if (url.searchParams.has('gmail')) {
      url.searchParams.delete('gmail');
      window.history.replaceState(window.history.state,'',url.pathname + url.search + url.hash);
    }
    lastImport.current = undefined;
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState !== 'hidden') void load(); }, 30_000);
    return () => { mounted.current = false; historyRequest.current = null; window.clearInterval(timer); };
  }, [session.token]);

  const changeConnection = async (disconnect: boolean) => {
    if (connectionPending.current) return;
    connectionPending.current = true;
    setConnecting(true);
    setError('');
    setNotice('');
    try {
      if (disconnect) {
        await api.promotions.disconnectGmail(session.token);
        if (mounted.current && sessionToken.current === session.token) {
          setNotice('Gmail отключён. Новые письма больше не импортируются.');
          await load();
        }
      } else {
        const result = await api.promotions.connectGmail(session.token);
        if (mounted.current && sessionToken.current === session.token) window.location.assign(result.authorizationUrl);
      }
    } catch (error) {
      if (mounted.current && sessionToken.current === session.token) setError(messageOf(error));
    } finally {
      connectionPending.current = false;
      if (mounted.current) setConnecting(false);
    }
  };

  const poll = async () => {
    if (pollPending.current) return;
    pollPending.current = true;
    setPolling(true);
    setError('');
    setNotice('');
    try {
      const result = await api.promotions.pollGmail(session.token);
      if (!mounted.current || sessionToken.current !== session.token) return;
      setHealth(result.health);
      setNotice(`Проверка завершена. Импортировано: ${result.result.imported}, пропущено: ${result.result.skipped}, ошибок: ${result.result.failed}.`);
      await load();
      if (mounted.current && sessionToken.current === session.token) await importedCallback.current();
    } catch (error) {
      if (mounted.current && sessionToken.current === session.token) {
        await load();
        if (mounted.current && sessionToken.current === session.token) setError(messageOf(error));
      }
    } finally {
      pollPending.current = false;
      if (mounted.current) setPolling(false);
    }
  };

  const label = !health ? 'Проверяем подключение...' : !health.enabled ? 'Автоматический импорт выключен'
    : health.connected === false ? 'Не подключена' : health.authenticated ? 'Подключена'
      : health.lastError ? 'Требует повторного подключения' : 'Ожидает первой проверки';
  return (
    <section className="documents-panel gmail-import-panel">
      <div className="gmail-status-heading">
        <h4>Почта</h4>
        {session.user.role === 'manager' && <div className="gmail-connection-actions">
          <button className="secondary" disabled={connecting || !health?.configured || health.running} onClick={() => void changeConnection(false)}>
            {connecting ? 'Подключаем...' : health?.connected ? 'Сменить аккаунт' : 'Подключить Gmail'}
          </button>
          {health?.email && <button className="secondary" disabled={connecting || health.running} onClick={() => void changeConnection(true)}>Отключить</button>}
          <button className="secondary" disabled={connecting || polling || !health?.enabled || health.connected === false || health.running} onClick={() => void poll()}>
            {polling || health?.running ? 'Проверяем...' : 'Проверить сейчас'}
          </button>
        </div>}
      </div>
      <p className="gmail-connection-status"><span className={`status-dot ${health?.enabled && health.authenticated ? 'in' : ''}`} />{label}</p>
      {health?.email && <p className="batch-hint">Аккаунт: {health.email}. Вложения из этой почты импортируются в общий список документов.</p>}
      {health?.configured === false && <p className="batch-hint">Подключение Gmail пока не настроено.</p>}
      {health && <dl className="gmail-health-details">
        <div><dt>Последняя проверка</dt><dd>{dateTime(health.lastPollAt)}</dd></div>
        <div><dt>Последний успешный импорт</dt><dd>{dateTime(health.lastImportAt)}</dd></div>
      </dl>}
      <Feedback error={error || health?.lastError || ''} notice={notice} />
      <details className="gmail-history">
      <summary>История импорта{imports.length > 0 ? ` · ${imports.length}` : ''}</summary>
      {imports.length > 0 ? <ul className="gmail-import-list" tabIndex={0} aria-label="История импорта из Gmail">{imports.map((item) => (
        <li key={item.id}>
          <div><strong>{item.filename}</strong><span className={`gmail-import-status ${item.status}`}>{statuses[item.status]}</span></div>
          <small>{dateTime(item.receivedAt)} · {item.sender} · Попыток: {item.attemptCount}</small>
          {item.error && <p>{importReasons[item.error] || item.error}{item.retryable && item.status === 'failed' ? ' Повторная попытка при следующей проверке.' : ''}</p>}
        </li>
      ))}</ul> : health && <p className="batch-hint">Импортов из почты пока нет.</p>}
      </details>
      {deliverySettings&&<GmailDeliveryPanel key={session.token} session={session} health={health} settings={deliverySettings} deliveries={deliveries} onChanged={load}/>}
    </section>
  );
};
