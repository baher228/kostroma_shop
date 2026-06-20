import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import { Feedback, Modal, PageHeader, Table } from '../../components/ui';
import { messageOf } from '../../shared/format';
import type {
  PromotionDocument,
  PromotionDocumentType,
  PromotionRowPayload,
  PromotionRowStatus,
  PromotionTableRow,
  Session,
} from '../../types';

type SortKey =
  | 'rowNumber'
  | 'status'
  | 'productName'
  | 'startDate'
  | 'endDate'
  | 'promoPrice'
  | 'regularPrice'
  | 'priceDifference'
  | 'realDiscountPercent'
  | 'advertisingDiscountPercent';
type SortDirection = 'asc' | 'desc' | 'default';
type RowForm = {
  rowNumber: string;
  status: PromotionRowStatus;
  productName: string;
  startDate: string;
  endDate: string;
  promoPrice: string;
  regularPrice: string;
};

const emptyForm = (): RowForm => ({
  rowNumber: '',
  status: 'future',
  productName: '',
  startDate: '',
  endDate: '',
  promoPrice: '',
  regularPrice: '',
});

const uploadOptions: Array<{ value: Exclude<PromotionDocumentType, 'final_table_csv'>; label: string; hint: string; accept: string }> = [
  { value: 'invoice', label: 'Накладная', hint: 'Только PDF', accept: '.pdf,application/pdf' },
  {
    value: 'two_month_plan',
    label: 'План на два месяца',
    hint: 'Excel или CSV',
    accept: '.xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  {
    value: 'retail_price_list',
    label: 'Розничные цены',
    hint: 'Только XLSX',
    accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
];

const statusLabels: Record<PromotionRowStatus, string> = {
  past: 'Прошедшая',
  current: 'Текущая',
  future: 'Будущая',
};
const statusOrder: Record<PromotionRowStatus, number> = { past: 0, current: 1, future: 2 };

const formatBytes = (value: number) => {
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} КБ`;
  return `${(value / 1024 / 1024).toFixed(1)} МБ`;
};

const formatDocumentOption = (document: PromotionDocument) =>
  `${document.fileName} · ${new Date(document.uploadedAt).toLocaleString('ru-RU')} · ${formatBytes(document.sizeBytes)}`;

const money = (value: number | null) => (value === null ? '' : value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const percent = (value: number | null) => (value === null ? '' : `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`);
const dateText = (value: string | null) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('ru-RU') : '');
const textValue = (value: number | null) => (value === null ? '' : String(value));
const parseNullableNumber = (value: string) => {
  const trimmed = value.replace(',', '.').trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};
const formFromRow = (row: PromotionTableRow): RowForm => ({
  rowNumber: String(row.rowNumber),
  status: row.status,
  productName: row.productName,
  startDate: row.startDate ?? '',
  endDate: row.endDate ?? '',
  promoPrice: textValue(row.promoPrice),
  regularPrice: textValue(row.regularPrice),
});
const payloadFromForm = (form: RowForm): PromotionRowPayload => ({
  status: form.status,
  productName: form.productName.trim(),
  startDate: form.startDate || null,
  endDate: form.endDate || null,
  promoPrice: parseNullableNumber(form.promoPrice),
  regularPrice: parseNullableNumber(form.regularPrice),
});

const compareValues = (left: string | number | null, right: string | number | null) => {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right), 'ru', { numeric: true, sensitivity: 'base' });
};

const sortValue = (row: PromotionTableRow, key: SortKey): string | number | null => {
  if (key === 'status') return statusOrder[row.status];
  return row[key];
};

export const PromotionsPanel = ({ session }: { session: Session }) => {
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [editingOpen, setEditingOpen] = useState(false);
  const [addingOpen, setAddingOpen] = useState(false);
  const [rows, setRows] = useState<PromotionTableRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [rowsError, setRowsError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PromotionRowStatus | ''>('');
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'rowNumber', direction: 'default' });

  const loadRows = async () => {
    setLoadingRows(true);
    setRowsError('');
    try {
      setRows(await api.promotions.rows(session.token));
    } catch (err) {
      setRowsError(messageOf(err));
    } finally {
      setLoadingRows(false);
    }
  };

  useEffect(() => {
    void loadRows();
  }, [session.token]);

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      const matchesStatus = !statusFilter || row.status === statusFilter;
      const haystack = [
        row.rowNumber,
        statusLabels[row.status],
        row.productName,
        row.startDate,
        row.endDate,
        row.promoPrice,
        row.regularPrice,
        row.priceDifference,
        row.realDiscountPercent,
        row.advertisingDiscountPercent,
      ].join(' ').toLowerCase();
      return matchesStatus && (!needle || haystack.includes(needle));
    });

    const sorted = [...filtered];
    if (sort.direction === 'default') {
      sorted.sort((left, right) => statusOrder[left.status] - statusOrder[right.status] || left.rowNumber - right.rowNumber);
      return sorted;
    }
    sorted.sort((left, right) => {
      const result = compareValues(sortValue(left, sort.key), sortValue(right, sort.key));
      return sort.direction === 'asc' ? result : -result;
    });
    return sorted;
  }, [rows, search, sort, statusFilter]);

  const cycleSort = (key: SortKey) => {
    setSort((current) => {
      if (current.key !== key) return { key, direction: 'desc' };
      if (current.direction === 'desc') return { key, direction: 'asc' };
      if (current.direction === 'asc') return { key, direction: 'default' };
      return { key, direction: 'desc' };
    });
  };

  return (
    <section className="page-section promotions-page">
      <PageHeader title="Акции" subtitle="Основная таблица акций и документы для загрузки." />
      <div className="promotions-toolbar">
        <button className="promotions-documents-button" onClick={() => setDocumentsOpen(true)}>Документы</button>
        <input className="search-field" placeholder="Поиск по таблице" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as PromotionRowStatus | '')}>
          <option value="">Все статусы</option>
          <option value="past">Прошедшие</option>
          <option value="current">Текущие</option>
          <option value="future">Будущие</option>
        </select>
        <button className="secondary" onClick={() => setAddingOpen(true)}>Добавить строку</button>
        <button className="secondary" onClick={() => setEditingOpen(true)}>Редактировать строку</button>
      </div>
      <Feedback error={rowsError} notice={notice} />
      {loadingRows ? (
        <p className="documents-loading">Загружаем таблицу акций...</p>
      ) : (
        <PromotionRowsTable rows={visibleRows} sort={sort} onSort={cycleSort} />
      )}
      {addingOpen && (
        <RowModal
          title="Добавить строку"
          mode="add"
          session={session}
          rows={rows}
          onClose={() => setAddingOpen(false)}
          onSaved={async () => {
            setAddingOpen(false);
            setNotice('Строка добавлена.');
            await loadRows();
          }}
        />
      )}
      {editingOpen && (
        <RowModal
          title="Редактировать строку"
          mode="edit"
          session={session}
          rows={rows}
          onClose={() => setEditingOpen(false)}
          onSaved={async () => {
            setEditingOpen(false);
            setNotice('Строка обновлена.');
            await loadRows();
          }}
          onDeleted={async () => {
            setEditingOpen(false);
            setNotice('Строка удалена.');
            await loadRows();
          }}
        />
      )}
      {documentsOpen && (
        <DocumentsModal
          session={session}
          onClose={() => setDocumentsOpen(false)}
          onInvoiceImported={loadRows}
        />
      )}
    </section>
  );
};

const sortMark = (sort: { key: SortKey; direction: SortDirection }, key: SortKey) => {
  if (sort.key !== key || sort.direction === 'default') return '';
  return sort.direction === 'asc' ? ' ↑' : ' ↓';
};

const SortHeader = ({ label, column, sort, onSort }: { label: string; column: SortKey; sort: { key: SortKey; direction: SortDirection }; onSort: (key: SortKey) => void }) => (
  <th className="sortable-header" onDoubleClick={() => onSort(column)} title="Двойной клик: сортировка">
    {label}{sortMark(sort, column)}
  </th>
);

const PromotionRowsTable = ({
  rows,
  sort,
  onSort,
}: {
  rows: PromotionTableRow[];
  sort: { key: SortKey; direction: SortDirection };
  onSort: (key: SortKey) => void;
}) => (
  <Table>
    <thead>
      <tr>
        <SortHeader label="№" column="rowNumber" sort={sort} onSort={onSort} />
        <SortHeader label="Статус акции" column="status" sort={sort} onSort={onSort} />
        <SortHeader label="Название позиции" column="productName" sort={sort} onSort={onSort} />
        <SortHeader label="Дата начала" column="startDate" sort={sort} onSort={onSort} />
        <SortHeader label="Дата окончания" column="endDate" sort={sort} onSort={onSort} />
        <SortHeader label="Новая цена" column="promoPrice" sort={sort} onSort={onSort} />
        <SortHeader label="Старая цена" column="regularPrice" sort={sort} onSort={onSort} />
        <SortHeader label="Разница" column="priceDifference" sort={sort} onSort={onSort} />
        <SortHeader label="Реальный % акции" column="realDiscountPercent" sort={sort} onSort={onSort} />
        <SortHeader label="Рекламный % акции" column="advertisingDiscountPercent" sort={sort} onSort={onSort} />
      </tr>
    </thead>
    <tbody>
      {rows.length === 0 ? (
        <tr>
          <td colSpan={10}>Строк не найдено.</td>
        </tr>
      ) : rows.map((row) => (
        <tr key={row.id}>
          <td>{row.rowNumber}</td>
          <td><span className={`promotion-status ${row.status}`}>{statusLabels[row.status]}</span></td>
          <td>{row.productName}</td>
          <td>{dateText(row.startDate)}</td>
          <td>{dateText(row.endDate)}</td>
          <td>{money(row.promoPrice)}</td>
          <td>{money(row.regularPrice)}</td>
          <td>{money(row.priceDifference)}</td>
          <td>{percent(row.realDiscountPercent)}</td>
          <td>{percent(row.advertisingDiscountPercent)}</td>
        </tr>
      ))}
    </tbody>
  </Table>
);

const RowModal = ({
  title,
  mode,
  session,
  rows,
  onClose,
  onSaved,
  onDeleted,
}: {
  title: string;
  mode: 'add' | 'edit';
  session: Session;
  rows: PromotionTableRow[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onDeleted?: () => void | Promise<void>;
}) => {
  const [form, setForm] = useState<RowForm>(emptyForm);
  const [error, setError] = useState('');
  const [loadingRow, setLoadingRow] = useState(false);
  const isEdit = mode === 'edit';

  const fillByRowNumber = async (value: string) => {
    setForm((current) => ({ ...current, rowNumber: value }));
    setError('');
    const rowNumber = Number(value);
    if (!Number.isInteger(rowNumber) || rowNumber < 1) return;
    const local = rows.find((row) => row.rowNumber === rowNumber);
    if (local) {
      setForm(formFromRow(local));
      return;
    }
    setLoadingRow(true);
    try {
      const row = await api.promotions.rowByNumber(session.token, rowNumber);
      setForm(formFromRow(row));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoadingRow(false);
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      if (isEdit) {
        const rowNumber = Number(form.rowNumber);
        if (!Number.isInteger(rowNumber) || rowNumber < 1) {
          setError('Введите корректный номер строки.');
          return;
        }
        const exists = rows.some((row) => row.rowNumber === rowNumber);
        if (!exists) {
          await api.promotions.rowByNumber(session.token, rowNumber);
        }
        await api.promotions.updateRowByNumber(session.token, rowNumber, payloadFromForm(form));
      } else {
        await api.promotions.addRow(session.token, payloadFromForm(form));
      }
      await onSaved();
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const remove = async () => {
    setError('');
    const rowNumber = Number(form.rowNumber);
    if (!Number.isInteger(rowNumber) || rowNumber < 1) {
      setError('Введите корректный номер строки.');
      return;
    }
    try {
      const exists = rows.some((row) => row.rowNumber === rowNumber);
      if (!exists) {
        await api.promotions.rowByNumber(session.token, rowNumber);
      }
      const confirmed = window.confirm(`Удалить строку №${rowNumber}?`);
      if (!confirmed) return;
      await api.promotions.deleteRowByNumber(session.token, rowNumber);
      await onDeleted?.();
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <form className="promotion-row-form" onSubmit={save}>
        <Feedback error={error} />
        {isEdit && (
          <label>
            Номер строки
            <input value={form.rowNumber} onChange={(event) => void fillByRowNumber(event.target.value)} placeholder="Например, 3" />
          </label>
        )}
        {loadingRow ? <p className="documents-loading">Загружаем строку...</p> : null}
        <label>
          Статус акции
          <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as PromotionRowStatus })}>
            <option value="past">Прошедшая</option>
            <option value="current">Текущая</option>
            <option value="future">Будущая</option>
          </select>
        </label>
        <label>
          Название позиции
          <input value={form.productName} onChange={(event) => setForm({ ...form, productName: event.target.value })} />
        </label>
        <label>
          Дата начала
          <input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} />
        </label>
        <label>
          Дата окончания
          <input type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} />
        </label>
        <label>
          Новая цена
          <input value={form.promoPrice} onChange={(event) => setForm({ ...form, promoPrice: event.target.value })} placeholder="Акционная цена" />
        </label>
        <label>
          Старая цена
          <input value={form.regularPrice} onChange={(event) => setForm({ ...form, regularPrice: event.target.value })} placeholder="Обычная цена" />
        </label>
        <div className="modal-actions">
          {isEdit ? <button type="button" className="danger" onClick={() => void remove()}>Удалить</button> : <span />}
          <button type="button" className="secondary" onClick={onClose}>Отмена</button>
          <button>{isEdit ? 'Сохранить' : 'Добавить'}</button>
        </div>
      </form>
    </Modal>
  );
};

const DocumentsModal = ({
  session,
  onClose,
  onInvoiceImported,
}: {
  session: Session;
  onClose: () => void;
  onInvoiceImported: () => void | Promise<void>;
}) => {
  const [documents, setDocuments] = useState<PromotionDocument[]>([]);
  const [documentType, setDocumentType] = useState<Exclude<PromotionDocumentType, 'final_table_csv'>>('invoice');
  const [file, setFile] = useState<File | null>(null);
  const [invoiceId, setInvoiceId] = useState('');
  const [planId, setPlanId] = useState('');
  const [priceListId, setPriceListId] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement | null>(null);

  const invoices = useMemo(() => documents.filter((document) => document.documentType === 'invoice'), [documents]);
  const plans = useMemo(() => documents.filter((document) => document.documentType === 'two_month_plan'), [documents]);
  const priceLists = useMemo(() => documents.filter((document) => document.documentType === 'retail_price_list'), [documents]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const nextDocuments = await api.promotions.documents(session.token);
      setDocuments(nextDocuments);
      setInvoiceId((current) => current || nextDocuments.find((document) => document.documentType === 'invoice')?.id || '');
      setPlanId((current) => current || nextDocuments.find((document) => document.documentType === 'two_month_plan')?.id || '');
      setPriceListId((current) => current || nextDocuments.find((document) => document.documentType === 'retail_price_list')?.id || '');
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [session.token]);

  const selectedOption = uploadOptions.find((option) => option.value === documentType)!;

  const pickDroppedFile = (files: FileList | null) => {
    const nextFile = files?.[0] ?? null;
    if (nextFile) setFile(nextFile);
  };

  const attach = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      setError('Выберите файл для прикрепления.');
      return;
    }
    setUploading(true);
    setError('');
    setNotice('');
    try {
      const document = await api.promotions.uploadDocument(session.token, documentType, file);
      if (document.documentType === 'invoice') setInvoiceId(document.id);
      if (document.documentType === 'two_month_plan') setPlanId(document.id);
      if (document.documentType === 'retail_price_list') setPriceListId(document.id);
      setNotice('Документ прикреплен.');
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      await load();
      if (document.documentType === 'invoice') {
        await onInvoiceImported();
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setUploading(false);
    }
  };

  const downloadById = async (documentId: string) => {
    if (!documentId) {
      setError('Выберите документ для скачивания.');
      return;
    }
    setError('');
    setNotice('');
    try {
      const result = await api.promotions.downloadDocument(session.token, { documentId });
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const downloadCurrentCsv = async () => {
    setError('');
    setNotice('');
    try {
      const blob = await api.promotions.downloadFinalTableCsv(session.token);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'itogovaya_tablica.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <Modal title="Документы акций" onClose={onClose}>
      <div className="documents-modal">
        <Feedback error={error} notice={notice} />

        <section className="documents-panel">
          <h4>Прикрепить документ</h4>
          <form className="documents-upload-form" onSubmit={attach}>
            <div className="document-type-tabs">
              {uploadOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={documentType === option.value ? 'active' : ''}
                  onClick={() => {
                    setDocumentType(option.value);
                    setFile(null);
                    if (fileInput.current) fileInput.current.value = '';
                  }}
                >
                  <span>{option.label}</span>
                  <small>{option.hint}</small>
                </button>
              ))}
            </div>

            <label
              className={`upload-dropzone ${dragActive ? 'active' : ''}`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setDragActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                pickDroppedFile(event.dataTransfer.files);
              }}
            >
              <input
                ref={fileInput}
                type="file"
                accept={selectedOption.accept}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <span>{file ? file.name : 'Перетащите файл сюда или нажмите для выбора'}</span>
              <small>
                {selectedOption.value === 'invoice'
                  ? 'Доступен только PDF'
                  : selectedOption.value === 'retail_price_list'
                    ? 'Доступен только XLSX'
                    : 'Доступны Excel и CSV'}
              </small>
            </label>

            <button className="documents-primary-action" disabled={uploading}>
              {uploading ? 'Прикрепляем...' : 'Прикрепить'}
            </button>
          </form>
        </section>

        <section className="documents-panel">
          <h4>Скачать документы</h4>
          {loading ? <p className="documents-loading">Загружаем список документов...</p> : (
            <div className="documents-download-grid">
              <DownloadRow
                label="Накладная"
                value={invoiceId}
                documents={invoices}
                empty="Накладных пока нет"
                onChange={setInvoiceId}
                onDownload={() => void downloadById(invoiceId)}
              />
              <DownloadRow
                label="План на два месяца"
                value={planId}
                documents={plans}
                empty="Планов пока нет"
                onChange={setPlanId}
                onDownload={() => void downloadById(planId)}
              />
              <DownloadRow
                label="Прайс розничных цен"
                value={priceListId}
                documents={priceLists}
                empty="Прайсов пока нет"
                onChange={setPriceListId}
                onDownload={() => void downloadById(priceListId)}
              />
              <DownloadRow
                label="Итоговая таблица CSV"
                value=""
                documents={[]}
                empty="Всегда актуальная версия"
                onChange={() => undefined}
                onDownload={() => void downloadCurrentCsv()}
              />
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
};

const DownloadRow = ({
  label,
  value,
  documents,
  empty,
  onChange,
  onDownload,
}: {
  label: string;
  value: string;
  documents: PromotionDocument[];
  empty: string;
  onChange: (value: string) => void;
  onDownload: () => void;
}) => (
  <div className="documents-download-row">
    <label>
      {label}
      {documents.length ? (
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {documents.map((document) => (
            <option key={document.id} value={document.id}>{formatDocumentOption(document)}</option>
          ))}
        </select>
      ) : (
        <input value={empty} readOnly />
      )}
    </label>
    <button className="secondary documents-download-button" onClick={onDownload}>Скачать</button>
  </div>
);
