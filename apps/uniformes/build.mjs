import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
await build({entryPoints:['src/vendor-entry.js'],bundle:true,platform:'browser',format:'iife',minify:true,outfile:'public/vendor.js'});
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.jpeg':'image/jpeg','.woff2':'font/woff2'};
const assets={};
for(const name of fs.readdirSync('public')){
  const file='public/'+name;
  if(!fs.statSync(file).isFile())continue;
  const extension=path.extname(name);
  const binary=['.jpeg','.woff2'].includes(extension);
  assets['/'+name]={body:fs.readFileSync(file,binary?'base64':'utf8'),binary,type:mime[extension]||'text/plain'};
}
fs.writeFileSync('src/assets.js','export const assets='+JSON.stringify(assets)+';\n');
fs.rmSync('dist',{recursive:true,force:true});fs.mkdirSync('dist/server',{recursive:true});
await build({entryPoints:['src/worker.js'],bundle:true,platform:'browser',format:'esm',target:'es2022',minify:false,outfile:'dist/server/index.js'});
fs.mkdirSync('dist/.openai',{recursive:true});fs.copyFileSync('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Built authenticated Worker and browser assets.');
