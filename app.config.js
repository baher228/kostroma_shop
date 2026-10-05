module.exports = ({ config }) => {
  const updateChannel = process.env.EXPO_UPDATE_CHANNEL;

  if (!updateChannel) {
    return config;
  }

  return {
    ...config,
    updates: {
      ...config.updates,
      requestHeaders: {
        ...config.updates?.requestHeaders,
        'expo-channel-name': updateChannel,
      },
    },
  };
};
