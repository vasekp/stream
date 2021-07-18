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
import {help} from './help.js';

import * as fs from 'fs/promises';

let passed = 0, failed = 0;

for(const [key, obj] of help) {
  if(!obj.ex)
    continue;
  if(obj.skipTest)
    continue;
  const history = new History();
  const saveReg = mainReg.child();
  const sessReg = saveReg.child();
  for(const [inp, expOut, extra] of obj.ex) {
    let realOut;
    try {
      let node = parse(inp);
      if(node.ident === 'equal' && node.token.value === '=' && !node.src && node.args[0] && node.args[0].type === 'symbol')
        node = node.toAssign();
      node = node.timed(n => n.prepare({history, register: sessReg, seed: RNG.seed(), referrer: n}));
      realOut = node.timed(n => n.eval().writeout());
      history.add(node);
    } catch(e) {
      if(e instanceof TimeoutError)
        realOut = '!Timeout';
      else
        realOut = `!${e.msg}`;
    }
    let happy;
    if(realOut === expOut)
      happy = true;
    else if(expOut.endsWith('...]'))
      happy = realOut.substring(0, expOut.length - 4) === expOut.substring(0, expOut.length - 4);
    else if(extra?.skipTest)
      happy = true;
    else
      happy = false;
    if(!happy) {
      console.error(`Key:\t${key}`);
      console.error(`Input:\t${inp}`);
      console.error(`Expect:\t${expOut}`);
      console.error(`Actual:\t${realOut}`);
      console.error();
    }
    if(happy)
      passed++;
    else
      failed++;
  }
}

console.log(`${passed} passed`);
console.log(`${failed} failed`);
