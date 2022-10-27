const { BreakingChanges } = require('../src/breaking-changes'); 

test('default to use all breaking change types', () => {
  const breakingChanges = new BreakingChanges();
  expect(breakingChanges.breakingChanges.length).toBe(0);
  expect(breakingChanges.breakingChangeTypes.length).toBe(14);
});

test('use provided breaking change types', () => {
  const breakingChanges = new BreakingChanges(['removed-paths', 'new-schema-definition']);
  expect(breakingChanges.breakingChangeTypes.length).toBe(2);
  expect(breakingChanges.breakingChangeTypes[1].name).toBe('new-schema-definition');
});

test('Does not use unsupported breaking change types', () => {
  const breakingChanges = new BreakingChanges(['required-request-body', 'unsupported', 'schema-new-required-properties']);
  expect(breakingChanges.breakingChangeTypes.length).toBe(2);
});

test('correctly detects a supported breaking change type', () => {
  const breakingChanges = new BreakingChanges(['removed-paths', 'new-schema-definition']);
  breakingChanges.detect('new-schema-definition', 'unit test message');
  expect(breakingChanges.breakingChanges.length).toBe(1);
  expect(breakingChanges.breakingChanges[0].type).toBe('new-schema-definition');
  expect(breakingChanges.breakingChanges[0].message).toBe('unit test message has a new definition that did not exist before');
});

test('correctly skips unsupported breaking change type', () => {
  const breakingChanges = new BreakingChanges(['removed-paths', 'new-schema-definition']);
  breakingChanges.detect('unsupported', 'unit test message');
  expect(breakingChanges.breakingChanges.length).toBe(0);
});