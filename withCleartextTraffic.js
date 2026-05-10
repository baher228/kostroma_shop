const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withCleartextTraffic(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application && manifest.manifest.application[0];
    if (app && app.$) {
      app.$["android:usesCleartextTraffic"] = "true";
    }
    return config;
  });
};
