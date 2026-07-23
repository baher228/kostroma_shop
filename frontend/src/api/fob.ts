import { FobChallenge, WorkerCheckInEvent, WorkerCheckInStatus } from '../types/models';
import { request } from './http';

type StatusResponse = { status: WorkerCheckInStatus | null };
type ChallengeResponse = { challenge: FobChallenge };
type ScanResponse = { status: WorkerCheckInStatus; event: WorkerCheckInEvent };

export const fobApi = {
  getMyStatus: async (token: string): Promise<WorkerCheckInStatus | null> => {
    const result = await request<StatusResponse>('/api/fob/me', { token });
    return result.status;
  },

  createChallenge: async (token: string): Promise<FobChallenge> => {
    const result = await request<ChallengeResponse>('/api/fob/challenges', { method: 'POST', token });
    return result.challenge;
  },

  scan: async (token: string, payload: string): Promise<ScanResponse> =>
    request<ScanResponse>('/api/fob/scans', { method: 'POST', token, body: { payload } }),
};
