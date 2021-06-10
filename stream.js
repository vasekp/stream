import { Op, Atom, Stream, InfStream } from './base.js'

class iota extends Op {
  eval() {
    const s = new InfStream(this, null);
    let i = 1n;
    s.nextv = () => new Atom(i++);
    s.skip = c => i += c;
    return s;
  }
};

const o1 = new iota();

const iter = o1.eval();
iter.skip(1000000000000000n);

for(const i of iter)
  console.log(i.desc());
