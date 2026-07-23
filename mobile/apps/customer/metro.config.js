/* Metro — monorepo configuration (Expo's recommended two settings).
   Without these, Metro only watches this app's folder and fails to resolve
   @doodly/core and @doodly/ui. This matches the official Expo monorepo guide:
   watch the workspace root, and resolve from both node_modules trees. We do
   NOT set disableHierarchicalLookup — npm workspaces hoist shared deps (React)
   to the root, so the default hierarchical resolution finds one copy. */
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Append (don't replace) so Expo's default watch entries are preserved and
// the workspace root is added on top — needed to follow the npm-workspace
// symlinks for @doodly/core and @doodly/ui.
config.watchFolders = [...(config.watchFolders ?? []), workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
