import './filters/basic.js';
import {parse} from './parser.js';
import {mainEnv} from './base.js';

import repl from 'repl';

repl.start({eval: e => {
  const st = parse(e);
  console.log(st.desc());
  console.log(st.writeout(mainEnv));
}});
