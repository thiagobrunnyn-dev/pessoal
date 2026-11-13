import assert from 'node:assert/strict';
import {returnDeadline,businessDate,act,empty} from '../src/model.js';
const cases=[['2026-10-05','2026-10-07'],['2026-10-02','2026-10-05'],['2026-10-03','2026-10-06'],['2026-10-31','2026-11-03'],['2026-12-31','2027-01-02'],['2028-02-28','2028-03-01'],['2026-10-01','2026-10-03']];
for(const timezone of ['UTC','America/Los_Angeles','Asia/Tokyo','America/Belem']){process.env.TZ=timezone;for(const [start,due] of cases){const r=returnDeadline(start);assert.equal(r.due,due);assert.equal(r.dueAt,due+'T09:00:00-03:00');assert.equal(r.triageStartAt,start+'T09:00:00-03:00');assert.equal(new Date(r.dueAt).toISOString(),due+'T12:00:00.000Z')}}
for(const bad of ['9999-12-31','2026-10-04','2026-02-30','2026-13-01','2026-00-01','2026-10-00','2026-10-32','2026-1-01','2026-10-03T09:00:00Z','',null,{},123])assert.throws(()=>returnDeadline(bad));
assert.equal(businessDate('2026-10-04T02:59:59Z'),'2026-10-03');assert.equal(businessDate('2026-10-04T03:00:00Z'),'2026-10-04');
const legacy=act(empty(),{type:'seed'},'demo','2026-10-03T15:00:00Z').state;
const before=structuredClone(legacy.rols[0]);const updated=act(legacy,{type:'entry',rolId:'ROL-DEMO',code:'DEMO-001'},'demo','2026-10-05T10:00:00Z');
assert.equal(updated.state.rols[0].due,before.due);assert.equal(updated.state.rols[0].triageDate,undefined);assert.equal(updated.state.rols[0].dueAt,undefined);assert.deepEqual(legacy.rols[0],before);
console.log('PASS: deadline calendar, timezone invariance, Friday/Saturday, month/year/leap rollover, Sundays/malformed inputs, UTC-local boundary, historic records preserved.');
