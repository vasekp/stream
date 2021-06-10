import {Atom} from './base.js';
import * as ops from './ops/basic.js';

const o1 = new ops.range().plug(new Atom(7), 2).plug(new Atom(-4), 1);
const o2 = new ops.len().plug(o1);

/*const iter = o1.eval();

for(const i of iter)
  console.log(i.desc());*/
console.log(o2.eval().desc());
