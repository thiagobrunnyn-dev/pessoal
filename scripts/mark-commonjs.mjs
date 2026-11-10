// O package.json raiz é "type":"module"; o servidor é compilado em CommonJS. Este marcador faz o Node tratá-lo corretamente.
import {writeFileSync, mkdirSync} from 'node:fs';
mkdirSync('dist-server', {recursive: true});
writeFileSync('dist-server/package.json', JSON.stringify({type: 'commonjs', private: true}) + '\n');
