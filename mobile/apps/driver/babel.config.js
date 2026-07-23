/* Reanimated's plugin MUST be last in the list — it rewrites worklets and
   silently misbehaves if another plugin runs after it. */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["react-native-reanimated/plugin"],
  };
};
