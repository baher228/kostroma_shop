module.exports = ({ config }) => {
  const projectId = process.env.EXPO_WORKER_EAS_PROJECT_ID;

  if (!projectId) {
    return config;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
    throw new Error('EXPO_WORKER_EAS_PROJECT_ID must be a valid UUID.');
  }

  return {
    ...config,
    updates: {
      url: `https://u.expo.dev/${projectId}`,
    },
    extra: {
      ...config.extra,
      eas: {
        projectId,
      },
    },
  };
};
