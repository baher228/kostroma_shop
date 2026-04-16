import { ColumnKey, StockRow } from '../types/models';
import { request } from './http';

type RowsResponse = {
  rows: StockRow[];
};

type RowResponse = {
  row: StockRow;
};

export const stockApi = {
  list: async (token: string): Promise<StockRow[]> => {
    const result = await request<RowsResponse>('/api/stock', { token });
    return result.rows;
  },

  create: async (token: string, name: string): Promise<StockRow> => {
    const result = await request<RowResponse>('/api/stock', {
      method: 'POST',
      token,
      body: { name },
    });
    return result.row;
  },

  update: async (
    token: string,
    rowId: string,
    payload: {
      name?: string;
      values?: Partial<Record<ColumnKey, string>>;
    },
  ): Promise<StockRow> => {
    const result = await request<RowResponse>(`/api/stock/${rowId}`, {
      method: 'PUT',
      token,
      body: payload,
    });
    return result.row;
  },

  remove: async (token: string, rowId: string): Promise<void> => {
    await request<{}>(`/api/stock/${rowId}`, {
      method: 'DELETE',
      token,
    });
  },
};
