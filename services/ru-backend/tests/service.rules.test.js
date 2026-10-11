const assert = require('node:assert/strict');
const test = require('node:test');

const loadWithMock = (modulePath, mocks) => {
  for (const [mockPath, exports] of Object.entries(mocks)) {
    const resolved = require.resolve(mockPath);
    require.cache[resolved] = {
      id: resolved,
      filename: resolved,
      loaded: true,
      exports,
    };
  }
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
};

const manager = {
  id: 'manager_1',
  username: 'manager',
  firstName: 'Main',
  lastName: 'Manager',
  fullName: 'Main Manager',
  role: 'manager',
  shopId: null,
  shopName: null,
};

const worker = {
  id: 'worker_1',
  username: 'worker',
  firstName: 'Shop',
  lastName: 'Worker',
  fullName: 'Shop Worker',
  role: 'worker',
  shopId: 'shop_a',
  shopName: 'Shop A',
};

const tablet = {
  ...worker,
  id: 'tablet_1',
  username: 'tablet',
  fullName: 'Shop Tablet',
  role: 'store_tablet',
};

test('task service assigns tasks to store tablets and enforces ownership rules', async () => {
  let createdTaskInput = null;
  const baseTask = {
    id: 'task_1',
    title: 'Check fridge',
    assigneeId: tablet.id,
    assigneeDisplayName: tablet.fullName,
    createdById: 'manager_1',
    createdByDisplayName: 'Main Manager',
    status: 'open',
    createdAt: '2026-05-17T07:00:00.000Z',
    completedAt: null,
    deadlineAt: null,
    requiresPhotoConfirmation: true,
    photoConfirmationUrl: null,
    photoConfirmedAt: null,
    photoReviewStatus: 'none',
    photoReviewedAt: null,
    photoDeletesAt: null,
    overdue: false,
  };
  const secondTablet = { ...tablet, id: 'tablet_2', fullName: 'Tablet 2' };
  const createdTaskInputs = [];
  let currentTask = baseTask;
  let attachedPhoto = null;
  let reviewedDecision = null;
  const { changeTaskStatus, createManagedTask, reviewTaskPhotoConfirmation, uploadTaskPhotoConfirmation } = loadWithMock('../dist/services/taskService', {
    '../dist/repositories/taskRepository': {
      attachTaskPhoto: async (_id, fileName, mimeType) => {
        attachedPhoto = { fileName, mimeType };
        currentTask = { ...baseTask, status: 'done', photoConfirmationUrl: '/api/tasks/task_1/photo', photoReviewStatus: 'pending' };
        return currentTask;
      },
      createTask: async (input) => {
        createdTaskInput = input;
        createdTaskInputs.push(input);
        return { ...baseTask, ...input, id: 'task_created', status: 'open' };
      },
      deleteTask: async () => false,
      detachExpiredTaskPhotos: async () => [],
      getTaskPhotoFile: async () => null,
      listTasks: async () => [currentTask],
      reviewTaskPhoto: async (_id, decision) => {
        reviewedDecision = decision;
        return {
          ...baseTask,
          status: decision === 'approve' ? 'done' : 'open',
          photoConfirmationUrl: '/api/tasks/task_1/photo',
          photoReviewStatus: decision === 'approve' ? 'approved' : 'declined',
          photoDeletesAt: '2026-05-17T08:00:00.000Z',
        };
      },
      updateTaskStatus: async () => ({ ...baseTask, status: 'done' }),
    },
    '../dist/repositories/userRepository': {
      findStoreTabletById: async (id) => [tablet, secondTablet].find((candidate) => candidate.id === id) ?? null,
    },
    '../dist/services/taskPhotoStorageService': {
      deleteTaskPhotoFile: async () => undefined,
      readTaskPhoto: async () => null,
      saveTaskPhoto: async () => ({ fileName: 'photo.jpg', mimeType: 'image/jpeg' }),
    },
  });

  assert.deepEqual(
    await changeTaskStatus(worker, 'task_1', { status: 'done' }),
    { status: 'forbidden' },
  );
  assert.deepEqual(
    await changeTaskStatus(tablet, 'task_1', { status: 'done' }),
    { status: 'photo_required' },
  );
  assert.deepEqual(
    await changeTaskStatus(manager, 'task_1', { status: 'done' }),
    { status: 'photo_required' },
  );

  const uploaded = await uploadTaskPhotoConfirmation(tablet, 'task_1', {
    photoDataUrl: 'data:image/jpeg;base64,aGVsbG8=',
  });
  assert.equal(uploaded.status, 'updated');
  assert.equal(uploaded.task.status, 'done');
  assert.equal(uploaded.task.photoReviewStatus, 'pending');
  assert.deepEqual(attachedPhoto, { fileName: 'photo.jpg', mimeType: 'image/jpeg' });

  const reviewed = await reviewTaskPhotoConfirmation(manager, 'task_1', { decision: 'approve' });
  assert.equal(reviewed.status, 'updated');
  assert.equal(reviewed.task.photoReviewStatus, 'approved');
  assert.equal(reviewedDecision, 'approve');

  const created = await createManagedTask(manager, {
    title: 'Check delivery',
    assigneeId: tablet.id,
    deadlineAt: null,
    requiresPhotoConfirmation: false,
  });
  assert.equal(created.length, 1);
  assert.equal(created[0].assigneeId, tablet.id);
  assert.equal(created[0].createdById, manager.id);
  assert.equal(createdTaskInput.assigneeDisplayName, tablet.fullName);
  assert.equal(createdTaskInput.groupId, null);

  createdTaskInputs.length = 0;
  const grouped = await createManagedTask(manager, {
    title: 'Check shelves',
    assigneeIds: [tablet.id, secondTablet.id, tablet.id],
    deadlineAt: null,
    requiresPhotoConfirmation: false,
  });
  assert.deepEqual(grouped.map((task) => task.assigneeId), [tablet.id, secondTablet.id]);
  assert.ok(createdTaskInputs[0].groupId);
  assert.equal(createdTaskInputs[1].groupId, createdTaskInputs[0].groupId);
  assert.equal(
    await createManagedTask(manager, {
      title: 'Unknown tablet in the group',
      assigneeIds: [tablet.id, worker.id],
      deadlineAt: null,
      requiresPhotoConfirmation: false,
    }),
    null,
  );
  assert.equal(
    await createManagedTask(manager, {
      title: 'Worker cannot be assigned',
      assigneeId: worker.id,
      deadlineAt: null,
      requiresPhotoConfirmation: false,
    }),
    null,
  );
});

test('task repository create insert covers photo review columns', async () => {
  let insertSql = '';
  let insertParams = null;
  const { createTask } = loadWithMock('../dist/repositories/taskRepository', {
    '../dist/db/personalDb': {
      personalDb: {
        query: async (sql, params) => {
          insertSql = sql;
          insertParams = params;
          return {
            rows: [{
              id: 'task_created',
              title: 'Check fridge',
              assignee_id: 'tablet_1',
              assignee_display_name: 'Shop Tablet',
              created_by_id: 'manager_1',
              created_by_display_name: 'Main Manager',
              status: 'open',
              created_at: '2026-05-17T07:00:00.000Z',
              completed_at: null,
              deadline_at: null,
              requires_photo_confirmation: false,
              photo_confirmation_url: null,
              photo_confirmation_file_name: null,
              photo_confirmation_mime_type: null,
              photo_confirmation_uploaded_at: null,
              photo_confirmed_at: null,
              photo_review_status: 'none',
              photo_reviewed_at: null,
              photo_deletes_at: null,
            }],
            rowCount: 1,
          };
        },
      },
    },
  });

  const task = await createTask({
    title: 'Check fridge',
    assigneeId: 'tablet_1',
    assigneeDisplayName: 'Shop Tablet',
    createdById: 'manager_1',
    createdByDisplayName: 'Main Manager',
    deadlineAt: null,
    requiresPhotoConfirmation: false,
  });

  assert.equal(task.id, 'task_created');
  assert.equal(insertParams.length, 10);
  assert.match(insertSql, /photo_confirmation_uploaded_at,\s*photo_confirmed_at,\s*photo_review_status/);
  assert.match(insertSql, /NULL,NULL,NULL,'none',NULL,NULL,NOW\(\)/);
});

test('task notification sounds on the tasks channel and removes invalid devices', async () => {
  const originalFetch = global.fetch;
  const removedTokens = [];
  let requestBody = '';
  global.fetch = async (_url, options) => {
    requestBody = options.body;
    return {
    ok: true,
    json: async () => ({
      data: [
        { status: 'ok' },
        { status: 'error', details: { error: 'DeviceNotRegistered' } },
      ],
    }),
    };
  };

  try {
    const { notifyTaskAssigneeOfNewTask } = loadWithMock('../dist/services/notificationService', {
      '../dist/repositories/notificationRepository': {
        savePushToken: async () => undefined,
        listPushTokens: async () => [
          { token: 'ExpoPushToken[first]', alarmSound: true },
          { token: 'ExpoPushToken[stale]', alarmSound: false },
        ],
        deletePushToken: async (_userId, token) => removedTokens.push(token),
      },
    });
    const task = {
      id: 'task_1',
      title: 'Check fridge',
      assigneeId: tablet.id,
      assigneeDisplayName: tablet.fullName,
      createdById: manager.id,
      createdByDisplayName: manager.fullName,
      status: 'open',
      createdAt: '2026-05-17T07:00:00.000Z',
      completedAt: null,
      deadlineAt: null,
      requiresPhotoConfirmation: false,
      photoConfirmationUrl: null,
      photoConfirmedAt: null,
      photoReviewStatus: 'none',
      photoReviewedAt: null,
      photoDeletesAt: null,
      overdue: false,
    };

    await notifyTaskAssigneeOfNewTask(task);
    const messages = JSON.parse(requestBody);
    assert.equal(messages[0].channelId, 'tasks');
    assert.equal(messages[0].sound, 'default');
    assert.equal(messages[0].priority, 'high');
    assert.deepEqual(removedTokens, ['ExpoPushToken[stale]']);
  } finally {
    global.fetch = originalFetch;
  }
});

test('user service prevents deleting the current user before repository access', async () => {
  let deleteCalled = false;
  const { deleteManagedUser } = loadWithMock('../dist/services/userService', {
    '../dist/repositories/userRepository': {
      assignUserShop: async () => null,
      createUser: async () => null,
      deleteUser: async () => {
        deleteCalled = true;
        return true;
      },
      listUsers: async () => [],
      listWorkers: async () => [],
      listStoreTablets: async () => [],
      updateUser: async () => null,
      updateUserPassword: async () => false,
    },
  });

  const result = await deleteManagedUser(manager, manager.id);
  assert.equal(result, 'self');
  assert.equal(deleteCalled, false);
});

test('support service blocks worker messages on another worker thread', async () => {
  let addMessageCalled = false;
  const { addUserSupportMessage } = loadWithMock('../dist/services/supportService', {
    '../dist/repositories/supportRepository': {
      addSupportMessage: async () => {
        addMessageCalled = true;
        return null;
      },
      createSupportThread: async () => null,
      getSupportThread: async () => ({
        id: 'thread_other',
        category: 'technical_failure',
        subject: 'Other issue',
        createdById: 'worker_2',
        createdByDisplayName: 'Other Worker',
        status: 'open',
        createdAt: '2026-05-17T07:00:00.000Z',
        updatedAt: '2026-05-17T07:00:00.000Z',
        messages: [],
      }),
      listSupportThreads: async () => [],
    },
  });

  const result = await addUserSupportMessage(worker, 'thread_other', { body: 'Help' });
  assert.equal(result, 'forbidden');
  assert.equal(addMessageCalled, false);
});

test('manual check-in preserves the worker shop in attendance records', async () => {
  let recordedInput = null;
  const { updateOwnCheckInStatus } = loadWithMock('../dist/services/checkInService', {
    '../dist/repositories/checkInRepository': {
      getCheckInStats: async () => null,
      getWorkerCheckInStatus: async () => null,
      listWorkerCheckInEvents: async () => [],
      listWorkerCheckInStatuses: async () => [],
      recordWorkerCheckIn: async (input) => {
        recordedInput = input;
        return { status: { status: input.status }, event: { status: input.status } };
      },
    },
  });

  await updateOwnCheckInStatus(worker, { status: 'in' });

  assert.equal(recordedInput.shopId, worker.shopId);
  assert.equal(recordedInput.shopName, worker.shopName);
});

test('deadline reminders use the loud deadline channel for claimed tasks only', async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ data: [{ status: 'ok' }] }) };
  };
  const claimedKinds = [];
  const reminderTask = (id, title) => ({
    id,
    title,
    assigneeId: tablet.id,
    assigneeDisplayName: tablet.fullName,
    createdById: manager.id,
    createdByDisplayName: manager.fullName,
    status: 'open',
    createdAt: '2026-05-17T07:00:00.000Z',
    completedAt: null,
    deadlineAt: '2026-05-17T12:00:00.000Z',
    requiresPhotoConfirmation: false,
    photoConfirmationUrl: null,
    photoConfirmedAt: null,
    photoReviewStatus: 'none',
    photoReviewedAt: null,
    photoDeletesAt: null,
    overdue: false,
  });

  try {
    const { sendTaskDeadlineReminders } = loadWithMock('../dist/services/notificationService', {
      '../dist/repositories/notificationRepository': {
        savePushToken: async () => undefined,
        listPushTokens: async () => [
          { token: 'ExpoPushToken[old_apk]', alarmSound: false },
          { token: 'ExpoPushToken[alarm_apk]', alarmSound: true },
        ],
        deletePushToken: async () => undefined,
      },
      '../dist/repositories/taskRepository': {
        claimTaskDeadlineReminders: async (kind) => {
          claimedKinds.push(kind);
          return kind === 'hour_before' ? [reminderTask('task_soon', 'Check fridge')] : [reminderTask('task_due', 'Clean shelf')];
        },
      },
    });

    await sendTaskDeadlineReminders();
    assert.deepEqual(claimedKinds, ['hour_before', 'deadline']);
    assert.equal(requests.length, 2);
    const [soon, soonAlarm] = requests[0];
    const [due, dueAlarm] = requests[1];
    assert.equal(soon.title, 'Через 1 час срок задачи');
    assert.equal(soon.body, 'Check fridge');
    assert.deepEqual(soon.data, { type: 'task_deadline', kind: 'hour_before', taskId: 'task_soon' });
    assert.equal(due.title, 'Срок задачи истёк');
    assert.deepEqual(due.data, { type: 'task_deadline', kind: 'deadline', taskId: 'task_due' });
    for (const message of [soon, due]) {
      assert.equal(message.to, 'ExpoPushToken[old_apk]');
      assert.equal(message.channelId, 'task-deadlines');
      assert.equal(message.sound, 'default');
      assert.equal(message.priority, 'high');
    }
    for (const message of [soonAlarm, dueAlarm]) {
      assert.equal(message.to, 'ExpoPushToken[alarm_apk]');
      assert.equal(message.channelId, 'task-deadline-alarm');
      assert.equal(message.sound, 'deadline_alarm.wav');
      assert.equal(message.priority, 'high');
    }
  } finally {
    global.fetch = originalFetch;
  }
});

test('repeating tasks create the next occurrence after the previous deadline and skip missed ones', () => {
  const { dueTaskOccurrence } = require('../dist/domain/taskRepeat');
  const day = 24 * 60 * 60 * 1000;
  const next = Date.parse('2026-10-11T10:00:00.000Z');
  assert.equal(dueTaskOccurrence(next, 'daily', next - day - 1), null);
  assert.deepEqual(dueTaskOccurrence(next, 'daily', next - day + 1), { deadlineMs: next, followingDeadlineMs: next + day });
  assert.deepEqual(dueTaskOccurrence(next, 'every_2_days', next + 1), { deadlineMs: next + 2 * day, followingDeadlineMs: next + 4 * day });
  assert.deepEqual(dueTaskOccurrence(next, 'weekly', next + 8 * day), { deadlineMs: next + 14 * day, followingDeadlineMs: next + 21 * day });
});
