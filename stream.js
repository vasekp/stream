import './filters/basic.js';
import './filters/arith.js';
import './filters/string.js';
import {parse, ParseError} from './parser.js';
import {History, Register, StreamError, TimeoutError, mainReg} from './base.js';

import repl from 'repl';

const history = new History();
const userReg = new Register(mainReg);

repl.start({eval: str => {
  try {
    str = str.replace(/[\n\r]+$/, '');
    const node = parse(str).withScope({history, register: userReg}).timeConstr().prepare();
    const out = node.timeConstr().writeout();
    console.log(`$${history.add(node)}: ${out}`);
  } catch(e) {
    if(e instanceof ParseError) {
      if(e.str !== '')
        console.error(e.str);
      if(e.pos >= 0)
        console.error(' '.repeat(e.pos) + '^'.repeat(e.len));
      console.error(`${e.name}: ${e.msg}`);
    } else if(e instanceof StreamError) {
      if(e.node) {
        console.error(str);
        console.error(' '.repeat(e.node.token.pos) + '^');
        console.error(`${e.node.desc()}: ${e.msg}`);
      } else
        console.error(e.msg);
    } else if(e instanceof TimeoutError) {
      console.error(`Timeout`);
    } else if(typeof e === 'string')
      console.error(`Error: ${e}`);
    else
      throw e;
  }
}});
