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
    overdue: false,
  };
  const { changeTaskStatus, createManagedTask } = loadWithMock('../dist/services/taskService', {
    '../dist/repositories/taskRepository': {
      createTask: async (input) => {
        createdTaskInput = input;
        return { ...baseTask, ...input, id: 'task_created', status: 'open' };
      },
      deleteTask: async () => false,
      listTasks: async () => [baseTask],
      updateTaskStatus: async () => ({ ...baseTask, status: 'done' }),
    },
    '../dist/repositories/userRepository': {
      findStoreTabletById: async (id) => (id === tablet.id ? tablet : null),
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

  const updated = await changeTaskStatus(manager, 'task_1', {
    status: 'done',
    photoConfirmationUrl: 'https://example.com/photo.jpg',
  });
  assert.equal(updated.status, 'updated');
  assert.equal(updated.task.status, 'done');

  const created = await createManagedTask(manager, {
    title: 'Check delivery',
    assigneeId: tablet.id,
    deadlineAt: null,
    requiresPhotoConfirmation: false,
  });
  assert.equal(created.assigneeId, tablet.id);
  assert.equal(created.createdById, manager.id);
  assert.equal(createdTaskInput.assigneeDisplayName, tablet.fullName);
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
        listPushTokens: async () => ['ExpoPushToken[first]', 'ExpoPushToken[stale]'],
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
