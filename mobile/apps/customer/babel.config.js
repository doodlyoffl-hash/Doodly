/* Reanimated's plugin MUST be last — it rewrites worklets and misbehaves
   silently if another plugin runs after it. */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["react-native-reanimated/plugin"],
  };
};
