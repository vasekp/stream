import { Op, Atom, Stream, InfStream } from '../base.js';

export class iota extends Op {
  eval() {
    const s = new InfStream(this, null);
    let i = 1n;
    s.nextv = () => new Atom(i++);
    s.skip = c => i += c;
    return s;
  }
};
