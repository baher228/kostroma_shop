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

test('task service enforces worker ownership and photo confirmation rules', async () => {
  const baseTask = {
    id: 'task_1',
    title: 'Check fridge',
    assigneeId: 'worker_2',
    assigneeDisplayName: 'Other Worker',
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
  const { changeTaskStatus } = loadWithMock('../dist/services/taskService', {
    '../dist/repositories/taskRepository': {
      createTask: async () => null,
      deleteTask: async () => false,
      listTasks: async () => [baseTask],
      updateTaskStatus: async () => ({ ...baseTask, status: 'done' }),
    },
    '../dist/repositories/userRepository': {
      findWorkerById: async () => null,
    },
  });

  assert.deepEqual(
    await changeTaskStatus(worker, 'task_1', { status: 'done' }),
    { status: 'forbidden' },
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
