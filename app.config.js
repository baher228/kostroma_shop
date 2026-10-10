module.exports = ({ config }) => {
  const nextConfig = JSON.parse(JSON.stringify(config));

  if (process.env.EXPO_DISABLE_UPDATES === '1') {
    nextConfig.updates = { enabled: false };
  }

  if (process.env.EXPO_LOCAL_APK === '1') {
    nextConfig.name = 'Analitika Tablet Local';
    nextConfig.slug = process.env.EXPO_LOCAL_APK_SLUG || nextConfig.slug;
    nextConfig.android.package = 'com.gringobochka.analitika.local';
    nextConfig.android.versionCode = Number(process.env.EXPO_LOCAL_APK_VERSION_CODE || 2);
    if (process.env.EXPO_LOCAL_APK_PROJECT_ID) {
      nextConfig.extra = nextConfig.extra || {};
      nextConfig.extra.eas = {
        ...(nextConfig.extra.eas || {}),
        projectId: process.env.EXPO_LOCAL_APK_PROJECT_ID,
      };
    }
  }

  const updateChannel = process.env.EXPO_UPDATE_CHANNEL;
  if (updateChannel) {
    nextConfig.updates = {
      ...nextConfig.updates,
      requestHeaders: {
        ...nextConfig.updates?.requestHeaders,
        'expo-channel-name': updateChannel,
      },
    };
  }

  return nextConfig;
};
