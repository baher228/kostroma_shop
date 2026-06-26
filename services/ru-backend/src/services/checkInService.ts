import {
  getCheckInStats,
  getWorkerCheckInStatus,
  listWorkerCheckInEvents,
  listWorkerCheckInStatuses,
  recordWorkerCheckIn,
} from '../repositories/checkInRepository';
import { SessionUser } from '../domain/types';
import { updateCheckInStatusSchema } from '../http/validation';
import { z } from 'zod';

export const getOwnCheckInStatus = (user: SessionUser) => getWorkerCheckInStatus(user.id);

export const getAllWorkerCheckInStatuses = () => listWorkerCheckInStatuses();

export const getCheckInEvents = (range: { from: string; to: string; shopId?: string }) =>
  listWorkerCheckInEvents(range.from, range.to, range.shopId);

export const getCheckInSummary = (range: { from: string; to: string; shopId?: string }) =>
  getCheckInStats(range.from, range.to, range.shopId);

export const updateOwnCheckInStatus = (
  user: SessionUser,
  payload: z.infer<typeof updateCheckInStatusSchema>,
) => {
  if (user.role !== 'worker') {
    return null;
  }
  return recordWorkerCheckIn({
    workerId: user.id,
    workerDisplayName: user.fullName,
    status: payload.status,
  });
};
