import './filters/basic.js';
import './filters/arith.js';
import {parse, ParseError} from './parser.js';
import {mainEnv, StreamError} from './base.js';

import repl from 'repl';

repl.start({eval: e => {
  try {
    const st = parse(e);
    //console.log(st.desc());
    console.log(st.writeout(mainEnv));
  } catch(e) {
    if(e instanceof ParseError) {
      console.error(e.str);
      console.error(' '.repeat(e.pos) + '^');
      console.error(`${e.name}: ${e.msg}`);
    } else if(e instanceof StreamError) {
      if(e.node)
        console.error(`${e.node.desc()}: ${e.msg}`);
      else
        console.error(e.msg);
    } else if(typeof e === 'string')
      console.error(`Error: ${e}`);
    else
      throw e;
  }
}});
