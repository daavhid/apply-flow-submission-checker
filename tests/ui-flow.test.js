'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { stage, identityKey } = require('../ui/flow-model');
const connected = () => ({ integration: { state: 'AUTHENTICATED', apiOrigin: 'https://applyflow.example',
  applier: { id: 'applier-1' }, profileAssignment: { id: 'assignment-1', version: '1' } },
  activeProfile: { id: 'profile-1', version: '1' } });

test('setup progresses from server to sign-in to assigned profile before the ready workspace', () => {
  assert.equal(stage({}), 'server');
  assert.equal(stage({integration: {apiOrigin: 'https://applyflow.example', state: 'SIGNED_OUT'}}), 'signin');
  const config = connected();
  assert.equal(stage(config), 'profile');
  assert.equal(stage(config, identityKey(config)), 'ready');
});
test('profile acknowledgement cannot skip login, assignment, or a mandatory password change', () => {
  const config = connected(), confirmation = identityKey(config);
  config.integration.state = 'SIGNED_OUT';
  assert.equal(stage(config, confirmation), 'signin');
  config.integration.state = 'PASSWORD_CHANGE_REQUIRED';
  assert.equal(stage(config, confirmation), 'password');
  config.integration.state = 'UNASSIGNED'; config.activeProfile = null;
  assert.equal(stage(config, confirmation), 'unassigned');
});
test('another account, server, candidate, or assignment version requires a new profile review', () => {
  const initial = connected(), confirmation = identityKey(initial);
  for (const mutate of [c => {c.integration.applier.id = 'applier-2';},
    c => {c.integration.apiOrigin = 'https://another.example';},
    c => {c.integration.profileAssignment.version = '2';},
    c => {c.activeProfile.id = 'profile-2';}, c => {c.activeProfile.version = '2';}]) {
    const config = connected(); mutate(config);
    assert.equal(stage(config, confirmation), 'profile');
  }
});
test('an unrelated portal does not turn a synced account back into the login step', () => {
  const config = connected(), confirmation = identityKey(config);
  config.integration.state = 'CONTEXT_MISMATCH';
  assert.equal(stage(config, confirmation), 'ready');
});
