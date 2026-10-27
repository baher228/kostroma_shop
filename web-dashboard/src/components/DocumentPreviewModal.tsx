import React, { useEffect, useRef, useState } from 'react';
import { Feedback } from './ui';
import { DocumentPreviewController } from './documentPreviewState';
import type { DocumentPreviewState } from './documentPreviewState';

export const useDocumentPreview = (sessionKey?: string) => {
  const [controller] = useState(() => new DocumentPreviewController());
  const [state, setState] = useState<DocumentPreviewState | null>(null);
  useEffect(() => {
    const unsubscribe = controller.subscribe(setState);
    return () => {
      unsubscribe();
      controller.close();
    };
  }, [controller, sessionKey]);
  return {
    open: controller.open.bind(controller),
    modal: state ? <DocumentPreviewModal state={state} onClose={() => controller.close()} /> : null,
  };
};

export const DocumentPreviewModal = ({ state, onClose }: { state: DocumentPreviewState; onClose: () => void }) => {
  const iframe = useRef<HTMLIFrameElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [printNotice, setPrintNotice] = useState('');
  useEffect(() => {
    setPdfLoaded(false);
    setDownloadError('');
    setPrintNotice('');
  }, [state.objectUrl, state.content]);
  useEffect(() => {
    const previousFocus = document.activeElement;
    closeButton.current?.focus();
    return () => { if (previousFocus instanceof HTMLElement) previousFocus.focus(); };
  }, []);

  const download = async () => {
    if (state.objectUrl) {
      const link = document.createElement('a');
      link.href = state.objectUrl;
      link.download = state.fileName;
      link.click();
      return;
    }
    if (!state.download) return;
    setDownloading(true);
    setDownloadError('');
    try {
      const result = await state.download();
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Не удалось скачать документ.');
    } finally {
      setDownloading(false);
    }
  };

  const print = () => {
    if (!state.objectUrl) return;
    try {
      const printWindow = iframe.current?.contentWindow;
      if (!printWindow) throw new Error('PDF viewer is unavailable');
      printWindow.focus();
      printWindow.print();
    } catch {
      window.open(state.objectUrl, '_blank', 'noopener,noreferrer');
      setPrintNotice('PDF открыт в новой вкладке. Нажмите Ctrl+P для печати.');
    }
  };

  return (
    <div className="modal-backdrop document-preview-backdrop" role="dialog" aria-modal="true" aria-label={`Просмотр: ${state.fileName}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
        if (event.key !== 'Tab') return;
        const controls = card.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], iframe');
        if (!controls?.length) return;
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}>
      <div className="modal-card document-preview-card" ref={card}>
        <header>
          <h3>{state.fileName}</h3>
          <div className="document-preview-actions">
            {state.content?.type === 'pdf' && <button className="secondary" disabled={!pdfLoaded} onClick={print}>Печать</button>}
            <button className="secondary" disabled={state.loading || downloading || (!state.objectUrl && !state.download)} onClick={() => void download()}>
              {downloading ? 'Скачиваем...' : state.content?.type === 'pdf' ? 'Скачать PDF' : 'Скачать оригинал'}
            </button>
            <button ref={closeButton} className="secondary" onClick={onClose}>Закрыть</button>
          </div>
        </header>
        <Feedback error={state.error || downloadError} notice={printNotice || (state.content?.type === 'pdf' ? state.content.notice : undefined)} />
        <div className="document-preview-content">
          {state.loading && <p role="status">Загружаем документ...</p>}
          {state.content?.type === 'pdf' && state.objectUrl && (
            <>
              <p className="notice">Для сохранения размеров шаблона выберите в окне печати «Фактический размер» или масштаб 100%, без подгонки под лист.</p>
              <iframe ref={iframe} src={state.objectUrl} title={state.fileName} onLoad={() => setPdfLoaded(true)} />
              <a href={state.objectUrl} target="_blank" rel="noreferrer">Открыть PDF в новой вкладке для просмотра или печати</a>
            </>
          )}
          {state.content?.type === 'table' && (
            <div className="document-table-preview">
              {state.content.truncated && <p className="notice">Показаны первые 100 строк, 30 столбцов и 3 листа. Полная версия доступна в оригинале.</p>}
              {state.content.sheets.map((sheet, sheetIndex) => (
                <section key={sheetIndex}>
                  <h4>{sheet.name}</h4>
                  <div className="table-scroll" tabIndex={0} role="region" aria-label={sheet.name}>
                    <table><tbody>{sheet.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}><th scope="row">{rowIndex + 1}</th>{row.map((cell, columnIndex) => <td key={columnIndex}>{cell}</td>)}</tr>
                    ))}</tbody></table>
                  </div>
                  {sheet.rows.length === 0 && <p>Лист пуст.</p>}
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
