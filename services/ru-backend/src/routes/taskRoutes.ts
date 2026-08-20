import { Express, Request, Response } from 'express';
import { ZodError } from 'zod';
import { toValidationMessage } from '../http/http';
import { AuthorizedRequest, requireAuth, requireRole } from '../auth/middleware';
import { changeTaskStatus, createManagedTask, getVisibleTasks, removeTask } from '../services/taskService';
import { notifyTaskAssigneeOfNewTask } from '../services/notificationService';
import { createTaskSchema, idParamSchema, updateTaskStatusSchema } from '../http/validation';

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
      void notifyTaskAssigneeOfNewTask(created).catch((error) => {
        console.error('Failed to send task notification:', error);
      });
      res.status(201).json({ task: created });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: toValidationMessage(error) });
        return;
      }
      res.status(500).json({ message: 'Failed to create task.' });
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
