import React, { useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import { useDocumentPreview } from '../../components/DocumentPreviewModal';
import { Feedback, Modal } from '../../components/ui';
import type { PromotionBatchRequest, PromotionBatchScope, PromotionTableRow, Session } from '../../types';
import { priceTagReady, selectBatchRows } from './batchSelection';

const scopes: Array<{ value: PromotionBatchScope; label: string }> = [
  { value: 'current', label: 'Текущие акции' },
  { value: 'future', label: 'Будущие' },
  { value: 'current_and_future', label: 'Текущие и будущие' },
  { value: 'selected', label: 'Выбранные' },
];

export const BatchPriceTagsModal = ({ session, rows, onClose }: { session: Session; rows: PromotionTableRow[]; onClose: () => void }) => {
  const [scope, setScope] = useState<PromotionBatchScope>('current_and_future');
  const [selected, setSelected] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const preview = useDocumentPreview(session.token);
  const [generating, setGenerating] = useState(false);
  const generationPending = useRef(false);
  const request: PromotionBatchRequest = { scope, rowNumbers: selected, from: from || null, to: to || null, layout: 'a4_2x2' };
  const found = selectBatchRows(rows, request);
  const ready = found.filter(priceTagReady);
  const skipped = found.length - ready.length;
  const datesInvalid = Boolean(from && to && from > to);
  const choices = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('ru-RU');
    return rows.filter((row) => !needle || `${row.rowNumber} ${row.productName}`.toLocaleLowerCase('ru-RU').includes(needle));
  }, [rows, search]);

  const generate = async () => {
    if (generationPending.current) return;
    generationPending.current = true;
    setGenerating(true);
    try {
      await preview.open('Акционные ценники.pdf', async () => {
      const result = await api.promotions.batchPriceTags(session.token, request);
      const skippedCount = result.skippedCount ?? skipped;
      const count = result.count ?? ready.length;
      return {
        type: 'pdf', blob: result.blob, fileName: result.fileName,
        notice: `Сформировано ценников: ${count}. Страниц A4: ${result.pageCount ?? Math.ceil(count / 4)}.`
          + (skippedCount ? ` Пропущено позиций: ${skippedCount} — отсутствует старая/новая цена или цена некорректна.` : ''),
      };
      });
    } finally {
      generationPending.current = false;
      setGenerating(false);
    }
  };

  return (
    <>
      <Modal title="Сформировать ценники" onClose={onClose}>
        <div className="batch-price-tags-form">
          <fieldset className="batch-scopes">
            <legend>Какие акции печатать</legend>
            {scopes.map((option) => <label key={option.value}>
              <input type="radio" name="price-tags-scope" value={option.value} checked={scope === option.value} onChange={() => setScope(option.value)} />
              {option.label}
            </label>)}
          </fieldset>
          <div className="batch-date-range">
            <label>Период от<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
            <label>до<input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label>
          </div>
          <p className="batch-hint">Печатаются акции, которые пересекаются с выбранным периодом. Без дат — весь выбранный список.</p>
          {scope === 'selected' && <section className="batch-selection">
            <label>Поиск позиций<input placeholder="Название или номер строки" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <div className="batch-selection-actions">
              <button className="secondary" onClick={() => setSelected((current) => [...new Set([...current, ...choices.map((row) => row.rowNumber)])])}>Выбрать найденные</button>
              <button className="secondary" onClick={() => setSelected([])}>Снять выбор</button>
              <span>Выбрано: {selected.length}</span>
            </div>
            <div className="batch-selection-list">
              {choices.map((row) => <label key={row.id}>
                <input type="checkbox" checked={selected.includes(row.rowNumber)} onChange={(event) => setSelected((current) => event.target.checked
                  ? [...current, row.rowNumber] : current.filter((number) => number !== row.rowNumber))} />
                <span>{row.rowNumber}. {row.productName}<small>{priceTagReady(row) ? 'Готов к печати' : 'Отсутствует старая/новая цена или цена некорректна'}</small></span>
              </label>)}
              {choices.length === 0 && <p>Позиции не найдены.</p>}
            </div>
          </section>}
          <p className="batch-count" role="status">Найдено: {found.length}. Готово к печати: {ready.length} ценников.</p>
          {skipped > 0 && <p className="notice">{skipped} позиции пропущены — отсутствует старая/новая цена или цена некорректна.</p>}
          <Feedback error={datesInvalid ? 'Дата начала периода должна быть не позже даты окончания.' : ''} />
          <p className="batch-hint">На каждом листе A4 до 4 ценников, размер каждого — 100 × 115 мм.</p>
          <div className="modal-actions">
            <button className="secondary" onClick={onClose}>Отмена</button>
            <button disabled={generating || datesInvalid || ready.length === 0} onClick={() => void generate()}>{generating ? 'Формируем...' : 'Сформировать'}</button>
          </div>
        </div>
      </Modal>
      {preview.modal}
    </>
  );
};
