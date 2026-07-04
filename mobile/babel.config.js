const mcpPreset =
  process.env.NODE_ENV === 'development' || process.env.REACT_NATIVE_MCP_ENABLED === '1'
    ? require.resolve('@ohah/react-native-mcp-server/babel-preset')
    : null;

module.exports = function (api) {
  api.cache(true);

  return {
    presets: [
      require.resolve('expo/node_modules/babel-preset-expo'),
      ...(mcpPreset ? [mcpPreset] : []),
    ],
    plugins: [
      '@babel/plugin-transform-arrow-functions',
      '@babel/plugin-transform-parameters',
      '@babel/plugin-transform-shorthand-properties',
      '@babel/plugin-transform-template-literals',
      '@babel/plugin-transform-destructuring',
      '@babel/plugin-transform-spread',
      '@babel/plugin-transform-object-rest-spread',
      '@babel/plugin-transform-optional-chaining',
      '@babel/plugin-transform-nullish-coalescing-operator',
      'react-native-reanimated/plugin',
    ],
  };
};
