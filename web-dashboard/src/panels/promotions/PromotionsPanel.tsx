import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import { Feedback, Modal, PageHeader } from '../../components/ui';
import { messageOf } from '../../shared/format';
import type { PromotionDocument, PromotionDocumentType, Session } from '../../types';

const uploadOptions: Array<{ value: Exclude<PromotionDocumentType, 'final_table_csv'>; label: string; hint: string; accept: string }> = [
  { value: 'invoice', label: 'Накладная', hint: 'Только PDF', accept: '.pdf,application/pdf' },
  {
    value: 'two_month_plan',
    label: 'План на два месяца',
    hint: 'Excel или CSV',
    accept: '.xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
];

const formatBytes = (value: number) => {
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} КБ`;
  return `${(value / 1024 / 1024).toFixed(1)} МБ`;
};

const formatDocumentOption = (document: PromotionDocument) =>
  `${document.fileName} · ${new Date(document.uploadedAt).toLocaleString('ru-RU')} · ${formatBytes(document.sizeBytes)}`;

export const PromotionsPanel = ({ session }: { session: Session }) => {
  const [documentsOpen, setDocumentsOpen] = useState(false);
  return (
    <section className="page-section promotions-page">
      <PageHeader title="Акции" subtitle="Пока подключаем документы для акций: накладные, план на два месяца и CSV." />
      <button className="promotions-documents-button" onClick={() => setDocumentsOpen(true)}>Документы</button>
      {documentsOpen && <DocumentsModal session={session} onClose={() => setDocumentsOpen(false)} />}
    </section>
  );
};

const DocumentsModal = ({ session, onClose }: { session: Session; onClose: () => void }) => {
  const [documents, setDocuments] = useState<PromotionDocument[]>([]);
  const [documentType, setDocumentType] = useState<Exclude<PromotionDocumentType, 'final_table_csv'>>('invoice');
  const [file, setFile] = useState<File | null>(null);
  const [invoiceId, setInvoiceId] = useState('');
  const [planId, setPlanId] = useState('');
  const [csvId, setCsvId] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement | null>(null);

  const invoices = useMemo(() => documents.filter((document) => document.documentType === 'invoice'), [documents]);
  const plans = useMemo(() => documents.filter((document) => document.documentType === 'two_month_plan'), [documents]);
  const csvFiles = useMemo(() => documents.filter((document) => document.documentType === 'final_table_csv'), [documents]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const nextDocuments = await api.promotions.documents(session.token);
      setDocuments(nextDocuments);
      setInvoiceId((current) => current || nextDocuments.find((document) => document.documentType === 'invoice')?.id || '');
      setPlanId((current) => current || nextDocuments.find((document) => document.documentType === 'two_month_plan')?.id || '');
      setCsvId((current) => current || nextDocuments.find((document) => document.documentType === 'final_table_csv')?.id || '');
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
      setNotice('Документ прикреплен.');
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      await load();
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

  const createAndDownloadCsv = async () => {
    setError('');
    setNotice('');
    try {
      const document = csvId
        ? documents.find((item) => item.id === csvId)!
        : await api.promotions.createFinalTable(session.token);
      if (!csvId) {
        setCsvId(document.id);
        await load();
      }
      const result = await api.promotions.downloadDocument(session.token, { documentId: document.id });
      window.open(result.url, '_blank', 'noopener,noreferrer');
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
              <small>{selectedOption.value === 'invoice' ? 'Доступен только PDF' : 'Доступны Excel и CSV'}</small>
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
                label="Итоговая таблица CSV"
                value={csvId}
                documents={csvFiles}
                empty="CSV еще не создан"
                onChange={setCsvId}
                onDownload={() => void createAndDownloadCsv()}
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
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={!documents.length}>
        {!documents.length && <option value="">{empty}</option>}
        {documents.map((document) => (
          <option key={document.id} value={document.id}>{formatDocumentOption(document)}</option>
        ))}
      </select>
    </label>
    <button className="secondary documents-download-button" onClick={onDownload}>Скачать</button>
  </div>
);
