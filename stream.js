import {Atom} from './base.js';
import * as ops from './ops/basic.js';

const o1 = new ops.range().plug(new Atom(7), 2).plug(new Atom(-4), 1);
const o2 = new ops.len().plug(o1);

console.log(o1.writeout());
console.log(o2.writeout());
console.log(new ops.iota().writeout());
