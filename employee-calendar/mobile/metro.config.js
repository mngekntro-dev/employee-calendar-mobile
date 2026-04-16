const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Fix import.meta issue with Supabase on web
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
