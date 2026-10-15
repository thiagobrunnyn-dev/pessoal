const assert=require('node:assert/strict'),fs=require('node:fs');
const {harness}=require('./request-hooks-harness.cjs');
const data={properties:[{id:'11111111-1111-4111-8111-111111111111',name:'Imóvel QA',address:'Rua QA',state_code:'PA',control_number:1}],items:[{id:'22222222-2222-4222-8222-222222222222',name:'Central QA',location:'Quarto',property_name:'Imóvel QA',property_id:'11111111-1111-4111-8111-111111111111',address:'Rua QA',property_control_number:1}]};
for(const view of ['properties','equipment']){
 const h=harness('app/control.tsx',{initialData:data,view,displayName:'QA'},'default',{href:'https://fixture.invalid/'+(view==='properties'?'imoveis':'centrais')});
 if(view==='properties'){assert.match(h.words,/Controle deimóveis/);assert.match(h.words,/Cadastro, níveis, vagas/);assert.doesNotMatch(h.words,/Central QA|Próxima limpeza|Intervalo operacional|Manutenção em dia|Novo equipamento/);assert.ok(h.button('Novo imóvel'));assert.equal(h.find(n=>n.props?.id==='imoveis').length,1);}else{assert.match(h.words,/Controle declimatização/);assert.match(h.words,/Central QA/);assert.equal(h.find(n=>n.props?.id==='imoveis').length,0);assert.equal(h.button('Novo imóvel'),undefined);assert.ok(h.find(n=>n.type==='a'&&n.props.href==='/imoveis').length);}
 h.replayEffects();assert.equal(h.requests.length,0);h.unmount();console.log('PASS separate '+view+' view, links, repeat effects');
}
const h=harness('app/control.tsx',{initialData:{properties:[],items:[]},view:'properties',displayName:'QA'},'default');assert.match(h.words,/Nenhum imóvel cadastrado/);assert.doesNotMatch(h.words,/Nenhum equipamento|Vamos cadastrar o primeiro local/);h.unmount();console.log('PASS empty property page');
const nav=fs.readFileSync('app/components/hub-navigation.tsx','utf8');assert.match(nav,/href="\/imoveis\?new=property"/);assert.match(nav,/href="\/centrais">Centrais de ar/);assert.doesNotMatch(nav,/centrais#imoveis/);console.log('PASS independent navigation');
