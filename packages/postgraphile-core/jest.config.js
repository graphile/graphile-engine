module.exports = {
  snapshotSerializers: ["jest-serializer-graphql-schema"],
  transform: {
    "^.+\\.jsx?$": "../../.jest-wrapper.js",
    "^.+\\.graphql$": "<rootDir>/__tests__/transform-graphql.js",
  },
  testRegex: "__tests__/.*\\.test\\.(?:js|ts|graphql)$",
  moduleFileExtensions: ["js", "ts", "graphql"],
};
