const assert=require('node:assert/strict');
const {harness,walk,words}=require('./request-hooks-harness.cjs');
const fields=harness('app/components/property-details-fields.tsx',{},'PropertyCountFields');
const level=fields.find(n=>n.type==='select'&&n.props.name==='property_level')[0];
assert.ok(level);assert.equal(level.props.multiple,undefined);assert.equal(level.props.defaultValue,'');
assert.deepEqual(walk(level,n=>n.type==='option').map(words),['Não informado','OPERACIONAL','TÉCNICO','ENCARREGADO','STAFF','ENGENHARIA E COORDENAÇÃO','SUPERVISORES']);
const slots=fields.find(n=>n.type==='input'&&n.props.name==='declared_slots')[0];assert.equal(slots.props.min,0);assert.equal(slots.props.step,1);assert.equal(slots.props.required,undefined);
fields.unmount();
for(const [declared,rooms,warn]of [[null,null,false],[0,null,false],[0,0,false],[4,3,true],[4,4,false]]){const h=harness('app/components/property-capacity-summary.tsx',{data:{property_level:'supervisors',declared_slots:declared,confirmed_room_capacity:rooms}},'default');assert.ok(h.words.includes('SUPERVISORES'));assert.equal(h.words.includes('difere'),warn);assert.ok(h.words.includes('Capacidade confirmada dos quartos'));if(declared===null&&rooms===null)assert.equal((h.words.match(/Não informado/g)||[]).length,2);h.unmount();}
console.log('PASS capacity UI: single-choice six-option select, empty default, optional integer input, unknown/zero/divergence rendering');
