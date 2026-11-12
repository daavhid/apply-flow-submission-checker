'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { preferences, validate, historyRows, csv } = require('../options/settings-model');

test('settings submits only supported preferences and never sends identity or connection overrides', () => {
  const draft = {...preferences(), autoFillCompensation:false, activeProfileId:'another-candidate',
    isProfileLocked:false, applierId:'another-applier', backendApiKey:'key', apiOrigin:'https://other.example'};
  const result = validate(draft);
  assert.equal(result.autoFillCompensation, false);
  for (const key of ['activeProfileId','isProfileLocked','applierId','backendApiKey','apiOrigin']) assert.equal(key in result,false);
});
test('screening thresholds must be valid whole numbers and stored false preferences survive loading', () => {
  assert.equal(preferences({autoFillDemographics:false}).autoFillDemographics,false);
  for(const value of [0,501,15.5,NaN]) assert.throws(()=>validate({...preferences(),minScreeningLength:value}),/whole number/);
  assert.throws(()=>validate({...preferences(),interceptionMode:'unprotected'}),/validation mode/);
});
test('filtering audit history preserves the original record index used by the inspector', () => {
  const records = [{profile_name:'First candidate',validation_status:'PASSED'},
    {profile_name:'Second candidate',validation_status:'BLOCKED',extracted_data:{company:'Example'}},
    {profile_name:'Third candidate',validation_status:'WARNING'}];
  const rows = historyRows(records,'example');
  assert.equal(rows.length,1); assert.equal(rows[0].index,1); assert.equal(rows[0].record,records[1]);
  assert.deepEqual(historyRows(records,'','attention').map(row=>row.index),[1,2]);
});
test('CSV export escapes quotes, line breaks, commas and spreadsheet formulas in server data', () => {
  const text = csv([{profile_name:'=HYPERLINK("https://example.com")',extracted_data:{job_title:'Engineer, platform',company:'A "quoted"\ncompany'}}]);
  assert.ok(text.includes('"\'=HYPERLINK(""https://example.com"")"'));
  assert.ok(text.includes('"Engineer, platform"'));
  assert.ok(text.includes('"A ""quoted""\ncompany"'));
});
