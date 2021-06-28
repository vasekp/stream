import './filters/lang.js';
import './filters/streams.js';
import './filters/numeric.js';
import './filters/string.js';
import {StreamError, TimeoutError, ParseError} from './errors.js';
import {parse} from './parser.js';
import {History, Register, mainReg} from './base.js';
import {RNG} from './random.js';

import repl from 'repl';

const history = new History();
const userReg = new Register(mainReg);

repl.start({eval: str => {
  try {
    str = str.replace(/[\n\r]+$/, '');
    let node = parse(str);
    if(node.ident === 'equal')
      node = node.toAssign();
    const rng = new RNG();
    node = node.timed(n => n.prepare({history, register: userReg, rng}));
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
