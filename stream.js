import * as ops from './ops/basic.js';

const o1 = new ops.iota();

const iter = o1.eval();
iter.skip(1000000000000000n);

for(const i of iter)
  console.log(i.desc());
