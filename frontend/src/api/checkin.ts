import { WorkerCheckInEvent, WorkerCheckInStatus } from '../types/models';
import { request } from './http';

type CheckInResponse = { status: WorkerCheckInStatus | null; event?: WorkerCheckInEvent };

export const checkInApi = {
  getMyStatus: async (token: string): Promise<WorkerCheckInStatus | null> => {
    const result = await request<CheckInResponse>('/api/checkin/me', { token });
    return result.status;
  },
  setMyStatus: async (token: string, status: 'in' | 'out'): Promise<WorkerCheckInStatus> => {
    const result = await request<CheckInResponse>('/api/checkin/me', {
      method: 'PUT',
      token,
      body: { status },
    });
    if (!result.status) {
      throw new Error('Check-in status was not returned.');
    }
    if (!result.event) {
      throw new Error('Check-in event was not registered.');
    }
    return result.status;
  },
};
