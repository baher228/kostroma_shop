import { SessionUser } from '../domain/types';
import { getWorkerCheckInStatus } from '../repositories/checkInRepository';
import { createFobChallenge, redeemFobChallenge } from '../repositories/fobRepository';

export const getOwnFobStatus = (user: SessionUser) => getWorkerCheckInStatus(user.id);

export const createOwnFobChallenge = (user: SessionUser) => {
  if (user.role !== 'worker') {
    return null;
  }
  return createFobChallenge(user);
};

export const scanFobChallenge = (user: SessionUser, payload: string) => {
  if (user.role !== 'store_tablet') {
    return null;
  }
  return redeemFobChallenge(payload, user);
};
