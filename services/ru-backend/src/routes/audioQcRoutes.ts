import { Express, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AuthorizedRequest, requireAuth, requireRole } from '../auth/middleware';
import { toValidationMessage } from '../http/http';
import {
  audioQcHeartbeatSchema,
  audioQcPolicySchema,
  audioQcRecordingSchema,
  audioQcRecordingsQuerySchema,
  shopIdParamSchema,
} from '../http/validation';
import {
  AudioQcPolicyError,
  getManagedAudioQcRecordings,
  getManagedAudioQcPolicies,
  getTabletAudioQcPolicy,
  recordTabletAudioQcHeartbeat,
  recordTabletAudioQcRecording,
  saveManagedAudioQcPolicy,
} from '../services/audioQcService';

const handleAudioQcError = (error: unknown, res: Response, fallbackMessage: string) => {
  if (error instanceof ZodError) {
    res.status(400).json({ message: toValidationMessage(error) });
    return;
  }
  if (error instanceof AudioQcPolicyError) {
    res.status(error.reason === 'forbidden' ? 403 : 400).json({
      message: error.reason === 'shop_required' ? 'Shop is required for Audio QC.' : 'Not enough permissions for Audio QC.',
    });
    return;
  }
  res.status(500).json({ message: fallbackMessage });
};

export const registerAudioQcRoutes = (app: Express) => {
  app.get('/api/audio-qc/recordings', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
    try {
      const query = audioQcRecordingsQuerySchema.parse(req.query);
      const recordings = await getManagedAudioQcRecordings((req as AuthorizedRequest).user, query.shopId, query.limit);
      res.json({ recordings });
    } catch (error) {
      handleAudioQcError(error, res, 'Failed to load Audio QC recordings.');
    }
  });

  app.get('/api/audio-qc/policies', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
    try {
      const policies = await getManagedAudioQcPolicies((req as AuthorizedRequest).user);
      res.json({ policies });
    } catch (error) {
      handleAudioQcError(error, res, 'Failed to load Audio QC policies.');
    }
  });

  app.put('/api/audio-qc/shops/:shopId/policy', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
    try {
      const params = shopIdParamSchema.parse(req.params);
      const payload = audioQcPolicySchema.parse(req.body);
      const policy = await saveManagedAudioQcPolicy((req as AuthorizedRequest).user, params.shopId, payload);
      res.json({ policy });
    } catch (error) {
      handleAudioQcError(error, res, 'Failed to save Audio QC policy.');
    }
  });

  app.get('/api/audio-qc/tablet/policy', requireAuth, async (req: Request, res: Response) => {
    try {
      const policy = await getTabletAudioQcPolicy((req as AuthorizedRequest).user);
      res.json({ policy });
    } catch (error) {
      handleAudioQcError(error, res, 'Failed to load tablet Audio QC policy.');
    }
  });

  app.post('/api/audio-qc/tablet/heartbeat', requireAuth, async (req: Request, res: Response) => {
    try {
      const payload = audioQcHeartbeatSchema.parse(req.body);
      const heartbeat = await recordTabletAudioQcHeartbeat((req as AuthorizedRequest).user, payload);
      res.json({ heartbeat });
    } catch (error) {
      handleAudioQcError(error, res, 'Failed to save Audio QC heartbeat.');
    }
  });

  app.put('/api/audio-qc/tablet/recordings', requireAuth, async (req: Request, res: Response) => {
    try {
      const payload = audioQcRecordingSchema.parse(req.body);
      const recording = await recordTabletAudioQcRecording((req as AuthorizedRequest).user, payload);
      res.json({ recording });
    } catch (error) {
      handleAudioQcError(error, res, 'Failed to save Audio QC recording.');
    }
  });
};
