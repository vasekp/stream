import './filters/lang.js';
import './filters/streams.js';
import './filters/numeric.js';
import './filters/string.js';
import './filters/combi.js';
import './filters/iface.js';
import {StreamError, TimeoutError, ParseError} from './errors.js';
import parse from './parser.js';
import RNG from './random.js';
import mainReg from './register.js';
import History from './history.js';

import repl from 'repl';
import * as fs from 'fs/promises';

const history = new History();
const saveReg = mainReg.child();
const sessReg = saveReg.child();

await fs.readFile('.stream_vars')
  .then(cont => saveReg.init(JSON.parse(cont)))
  .catch(() => {});

const prompt = repl.start({eval: str => {
  try {
    if(str.includes(';'))
      str = str.substring(0, str.indexOf(';'));
    str = str.replace(/[\n\r]+$/, '');
    if(!str.replace(/[ \t\n\r]/g, ''))
      return;
    let node = parse(str);
    if(node.ident === 'equal' && node.token.value === '=' && !node.src && node.args[0] && node.args[0].type === 'symbol')
      node = node.toAssign();
    node = node.timed(n => n.prepare({history, register: sessReg, seed: RNG.seed()}));
    const out = node.timed(n => n.writeout());
    console.log(`$${history.add(node)}: ${out}`);
  } catch(e) {
    if(e instanceof ParseError) {
      if(e.str !== '')
        console.error(e.str);
      if(e.pos >= 0)
        console.error(' '.repeat(e.pos) + '^'.repeat(e.len));
      console.error(`${e.name}: ${e.msg}`);
    } else if(e instanceof StreamError) {
      if(e.len) {
        console.error(str);
        console.error(' '.repeat(e.pos) + '^'.repeat(e.len));
      }
      if(e.desc)
        console.error(`${e.desc}: ${e.msg}`);
      else
        console.error(e.msg);
    } else if(e instanceof TimeoutError) {
      console.error(`Timeout`);
    } else if(typeof e === 'string')
      console.error(`Error: ${e}`);
    else
      throw e;
  }
}});

prompt.on('exit', e => {
  fs.open('.stream_vars', 'w')
    .then(f => f.writeFile(JSON.stringify(saveReg.dump())))
    .catch(console.error);
});
