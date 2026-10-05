module.exports = ({ config }) => {
  const projectId = process.env.EXPO_WORKER_EAS_PROJECT_ID;
  const updateChannel = process.env.EXPO_UPDATE_CHANNEL;
  const nextConfig = {
    ...config,
    updates: {
      ...config.updates,
      ...(updateChannel
        ? {
            requestHeaders: {
              ...config.updates?.requestHeaders,
              'expo-channel-name': updateChannel,
            },
          }
        : {}),
    },
  };

  if (!projectId) {
    return nextConfig;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(projectId)) {
    throw new Error('EXPO_WORKER_EAS_PROJECT_ID must be a valid UUID.');
  }

  return {
    ...nextConfig,
    updates: {
      ...nextConfig.updates,
      url: `https://u.expo.dev/${projectId}`,
    },
    extra: {
      ...nextConfig.extra,
      eas: {
        projectId,
      },
    },
  };
};
