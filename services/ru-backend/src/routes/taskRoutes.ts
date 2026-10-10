import { Express, Request, Response } from 'express';
import { ZodError } from 'zod';
import { toValidationMessage } from '../http/http';
import { AuthorizedRequest, requireAuth, requireRole } from '../auth/middleware';
import {
  changeTaskStatus,
  createManagedTask,
  getVisibleTasks,
  readTaskPhotoConfirmation,
  removeTask,
  reviewTaskPhotoConfirmation,
  uploadTaskPhotoConfirmation,
  readTaskInstructionPhoto,
} from '../services/taskService';
import { notifyTaskAssigneeOfNewTask } from '../services/notificationService';
import { getActiveTaskSeries, stopManagedTaskSeries } from '../services/taskSeriesService';
import {
  createTaskSchema,
  idParamSchema,
  reviewTaskPhotoSchema,
  updateTaskStatusSchema,
  uploadTaskPhotoSchema,
} from '../http/validation';

export const registerTaskRoutes = (app: Express) => {
  app.get('/api/tasks', requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as AuthorizedRequest).user;
      const tasks = await getVisibleTasks(user);
      res.json({ tasks });
    } catch {
      res.status(500).json({ message: 'Failed to load tasks.' });
    }
  });

  app.post('/api/tasks', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
    try {
      const payload = createTaskSchema.parse(req.body);
      const manager = (req as AuthorizedRequest).user;
      const created = await createManagedTask(manager, payload);
      if (!created) {
        res.status(400).json({ message: 'Store tablet was not found.' });
        return;
      }
      created.forEach((task) => {
        void notifyTaskAssigneeOfNewTask(task).catch((error) => {
          console.error('Failed to send task notification:', error);
        });
      });
      res.status(201).json({ task: created[0], tasks: created });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to create task.' });
    }
  });

  app.get('/api/task-series', requireAuth, requireRole('manager'), async (_req: Request, res: Response) => {
    try {
      res.json({ series: await getActiveTaskSeries() });
    } catch {
      res.status(500).json({ message: 'Failed to load repeating tasks.' });
    }
  });

  app.post('/api/task-series/:id/stop', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      if (!(await stopManagedTaskSeries(id))) {
        res.status(404).json({ message: 'Repeating task was not found.' });
        return;
      }
      res.json({ stopped: true });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to stop repeating task.' });
    }
  });

  app.patch('/api/tasks/:id/status', requireAuth, async (req: Request, res: Response) => {
    try {
      const params = idParamSchema.parse(req.params);
      const payload = updateTaskStatusSchema.parse(req.body);
      const user = (req as AuthorizedRequest).user;
      const result = await changeTaskStatus(user, params.id, payload);
      if (result.status === 'not_found') {
        res.status(404).json({ message: 'Task not found.' });
        return;
      }
      if (result.status === 'forbidden') {
        res.status(403).json({ message: 'Not enough permissions.' });
        return;
      }
      if (result.status === 'photo_required') {
        res.status(400).json({ message: 'Photo confirmation is required for this task.' });
        return;
      }
      if (result.status === 'updated') {
        res.json({ task: result.task });
      }
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to update task.' });
    }
  });

  app.post('/api/tasks/:id/photo', requireAuth, async (req: Request, res: Response) => {
    try {
      const params = idParamSchema.parse(req.params);
      const payload = uploadTaskPhotoSchema.parse(req.body);
      const user = (req as AuthorizedRequest).user;
      const result = await uploadTaskPhotoConfirmation(user, params.id, payload);
      switch (result.status) {
        case 'not_found':
          res.status(404).json({ message: 'Task not found.' });
          return;
        case 'forbidden':
          res.status(403).json({ message: 'Not enough permissions.' });
          return;
        case 'photo_not_required':
          res.status(400).json({ message: 'Photo confirmation is not required for this task.' });
          return;
        case 'updated':
          res.status(201).json({ task: result.task });
          return;
      }
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to upload task photo.' });
    }
  });

  app.get('/api/tasks/:id/photo', requireAuth, async (req: Request, res: Response) => {
    try {
      const params = idParamSchema.parse(req.params);
      const user = (req as AuthorizedRequest).user;
      const result = await readTaskPhotoConfirmation(user, params.id);
      switch (result.status) {
        case 'not_found':
          res.status(404).json({ message: 'Photo not found.' });
          return;
        case 'forbidden':
          res.status(403).json({ message: 'Not enough permissions.' });
          return;
        case 'found':
          res.setHeader('Content-Type', result.mimeType);
          res.setHeader('Cache-Control', 'private, no-store');
          res.send(result.photo);
          return;
      }
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to load task photo.' });
    }
  });

  app.get('/api/tasks/:id/instruction-photo', requireAuth, async (req: Request, res: Response) => {
    try {
      const params = idParamSchema.parse(req.params);
      const result = await readTaskInstructionPhoto((req as AuthorizedRequest).user, params.id);
      switch (result.status) {
        case 'not_found':
          res.status(404).json({ message: 'Instruction photo not found.' });
          return;
        case 'forbidden':
          res.status(403).json({ message: 'Not enough permissions.' });
          return;
        case 'found':
          res.setHeader('Content-Type', result.mimeType);
          res.setHeader('Cache-Control', 'private, max-age=86400');
          res.send(result.photo);
          return;
      }
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to load instruction photo.' });
    }
  });

  app.patch('/api/tasks/:id/photo/review', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
    try {
      const params = idParamSchema.parse(req.params);
      const payload = reviewTaskPhotoSchema.parse(req.body);
      const user = (req as AuthorizedRequest).user;
      const result = await reviewTaskPhotoConfirmation(user, params.id, payload);
      switch (result.status) {
        case 'not_found':
          res.status(404).json({ message: 'Task not found.' });
          return;
        case 'forbidden':
          res.status(403).json({ message: 'Not enough permissions.' });
          return;
        case 'photo_missing':
          res.status(400).json({ message: 'Photo confirmation is missing.' });
          return;
        case 'review_not_ready':
          res.status(400).json({ message: 'Photo confirmation is not waiting for review.' });
          return;
        case 'updated':
          res.json({ task: result.task });
          return;
      }
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to review task photo.' });
    }
  });

  app.delete('/api/tasks/:id', requireAuth, requireRole('manager'), async (req: Request, res: Response) => {
    try {
      const params = idParamSchema.parse(req.params);
      const removed = await removeTask(params.id);
      if (!removed) {
        res.status(404).json({ message: 'Task not found.' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to delete task.' });
    }
  });
};
