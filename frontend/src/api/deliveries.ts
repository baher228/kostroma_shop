import { DeliveryReceipt, DeliverySupplier } from '../types/models';
import { request } from './http';

type DeliveriesBoard = { suppliers: DeliverySupplier[]; receipts: DeliveryReceipt[] };

export const deliveriesApi = {
  board: (token: string, date: string): Promise<DeliveriesBoard> =>
    request<DeliveriesBoard>(`/api/deliveries?from=${date}&to=${date}`, { token }),
  markReceived: async (
    token: string,
    payload: { supplierId: string; date: string; receivedAt: string; photoUri?: string },
  ): Promise<DeliveryReceipt> => {
    const form = new FormData();
    form.append('supplierId', payload.supplierId);
    form.append('date', payload.date);
    form.append('receivedAt', payload.receivedAt);
    if (payload.photoUri) {
      form.append('photo', { uri: payload.photoUri, name: 'invoice.jpg', type: 'image/jpeg' } as unknown as Blob);
    }
    const result = await request<{ receipt: DeliveryReceipt }>('/api/deliveries/receipts', {
      method: 'POST',
      token,
      formData: form,
      timeoutMs: 60_000,
    });
    return result.receipt;
  },
};
