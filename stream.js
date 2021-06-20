import './filters/basic.js';
import './filters/arith.js';
import './filters/string.js';
import {parse, ParseError} from './parser.js';
import {StreamError} from './base.js';

import repl from 'repl';

repl.start({eval: str => {
  try {
    str = str.replace(/[\n\r]+$/, '');
    const st = parse(str).prepare();
    //console.log(st.desc());
    console.log(st.writeout());
  } catch(e) {
    if(e instanceof ParseError) {
      if(e.str !== '')
        console.error(e.str);
      if(e.pos >= 0)
        console.error(' '.repeat(e.pos) + '^');
      console.error(`${e.name}: ${e.msg}`);
    } else if(e instanceof StreamError) {
      if(e.node) {
        console.error(str);
        console.error(' '.repeat(e.node.token.pos) + '^');
        console.error(`${e.node.desc()}: ${e.msg}`);
      } else
        console.error(e.msg);
    } else if(typeof e === 'string')
      console.error(`Error: ${e}`);
    else
      throw e;
  }
}});
