import StreamSession from './interface.js';
import mainReg from './register.js';

import * as fs from 'fs/promises';

let passed = 0, failed = 0;

for(const [ident, obj] of mainReg) {
  if(ident !== obj.aliases[0])
    continue;
  if(!obj.help?.ex)
    continue;
  if(obj.help.skipTest)
    continue;
  const sess = new StreamSession();
  for(const [input, expOut, extra] of obj.help.ex) {
    const res = sess.eval(input);
    const realOut = res.result === 'ok' ? res.output : `!${res.error}`;
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
      console.error(`Input:\t${input}`);
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
