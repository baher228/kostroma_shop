import { opsDb } from '../db/opsDb';

export type PromotionDocumentType = 'invoice' | 'two_month_plan' | 'retail_price_list' | 'final_table_csv';

export type PromotionDocument = {
  id: string;
  documentType: PromotionDocumentType;
  fileName: string;
  contentType: string;
  storageKey: string;
  sizeBytes: number;
  uploadedBy: string | null;
  uploadedAt: string;
};

export type DeletedPromotionDocument = {
  document: PromotionDocument;
  deletedRows: number;
};

type PromotionDocumentRow = {
  id: string;
  document_type: PromotionDocumentType;
  file_name: string;
  content_type: string;
  storage_key: string;
  size_bytes: number;
  uploaded_by: string | null;
  uploaded_at: Date | string;
};

const id = () => `promo_doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const iso = (value: Date | string) => (value instanceof Date ? value.toISOString() : new Date(value).toISOString());

const mapDocument = (row: PromotionDocumentRow): PromotionDocument => ({
  id: row.id,
  documentType: row.document_type,
  fileName: row.file_name,
  contentType: row.content_type,
  storageKey: row.storage_key,
  sizeBytes: Number(row.size_bytes),
  uploadedBy: row.uploaded_by,
  uploadedAt: iso(row.uploaded_at),
});

export const createPromotionDocument = async (input: Omit<PromotionDocument, 'id' | 'uploadedAt'>): Promise<PromotionDocument> => {
  const result = await opsDb.query<PromotionDocumentRow>(
    `INSERT INTO promotion_storage_documents (id, document_type, file_name, content_type, storage_key, size_bytes, uploaded_by, uploaded_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     RETURNING *;`,
    [id(), input.documentType, input.fileName, input.contentType, input.storageKey, input.sizeBytes, input.uploadedBy],
  );
  return mapDocument(result.rows[0]);
};

export const listPromotionDocuments = async (): Promise<PromotionDocument[]> => {
  const result = await opsDb.query<PromotionDocumentRow>('SELECT * FROM promotion_storage_documents ORDER BY uploaded_at DESC;');
  return result.rows.map(mapDocument);
};

export const getLatestPromotionDocument = async (documentType: PromotionDocumentType): Promise<PromotionDocument | null> => {
  const result = await opsDb.query<PromotionDocumentRow>(
    'SELECT * FROM promotion_storage_documents WHERE document_type = $1 ORDER BY uploaded_at DESC LIMIT 1;',
    [documentType],
  );
  return result.rows[0] ? mapDocument(result.rows[0]) : null;
};

export const getPromotionDocumentById = async (documentId: string): Promise<PromotionDocument | null> => {
  const result = await opsDb.query<PromotionDocumentRow>(
    'SELECT * FROM promotion_storage_documents WHERE id = $1 LIMIT 1;',
    [documentId],
  );
  return result.rows[0] ? mapDocument(result.rows[0]) : null;
};

export const deletePromotionDocumentById = async (documentId: string): Promise<DeletedPromotionDocument | null> =>
  opsDb.withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const found = await client.query<PromotionDocumentRow>(
        'SELECT * FROM promotion_storage_documents WHERE id = $1 FOR UPDATE;',
        [documentId],
      );
      const row = found.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return null;
      }

      let deletedRows = 0;
      if (row.document_type === 'invoice') {
        const removed = await client.query(
          `DELETE FROM promotion_table_rows
           WHERE invoice_document_id = $1
              OR source_document_id = $1;`,
          [documentId],
        );
        deletedRows = removed.rowCount ?? 0;
      } else if (row.document_type === 'two_month_plan') {
        const removed = await client.query(
          `DELETE FROM promotion_table_rows
           WHERE source_document_id = $1
             AND invoice_document_id IS NULL;`,
          [documentId],
        );
        deletedRows = removed.rowCount ?? 0;
        await client.query(
          `UPDATE promotion_table_rows
           SET plan_document_id = NULL,
               plan_document_file_name = NULL,
               updated_at = NOW()
           WHERE plan_document_id = $1;`,
          [documentId],
        );
      }

      await client.query(
        'DELETE FROM promotion_storage_documents WHERE id = $1;',
        [documentId],
      );
      await client.query('COMMIT');
      return { document: mapDocument(row), deletedRows };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
