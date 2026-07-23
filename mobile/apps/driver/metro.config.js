/* =============================================================
   Metro — monorepo configuration.
   Without this, Metro only watches this app's folder and fails to
   resolve @doodly/core and @doodly/ui ("Unable to resolve module").
   Two things are required:
     • watchFolders — so edits in packages/* trigger a reload
     • nodeModulesPaths — so hoisted deps at the workspace root resolve
   ============================================================= */
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// npm workspaces hoist to the root; without this a package installed in
// BOTH places can load twice and break React's hook invariants.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
