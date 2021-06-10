import { Op, Atom, Stream, InfStream } from '../base.js';

function asnum(s) {
  if(!(s instanceof Atom))
    throw 'not atom';
  const v = s.value;
  if(typeof v !== 'bigint')
    throw 'not number';
  return v;
}

export class iota extends Op {
  eval(env) {
    this.check([[0,0],[0,0]]);
    const s = new InfStream(this, env);
    let i = 1n;
    s.nextv = () => new Atom(i++);
    s.skip = c => i += c;
    return s;
  }
};

export class range extends Op {
  eval(env) {
    this.check([[0,0],[1,2]]);
    const s = new Stream(this, env);
    const [min, max] = this.ins[1] && this.ins[2]
      ? [asnum(this.ins[1]), asnum(this.ins[2])]
      : [1n, asnum(this.ins[1])];
    let i = min;
    s.next = () => i <= max
        ? { value: new Atom(i++), done: false }
        : { done: true };
    s.len = () => max >= min ? max - min + 1n : 0
    s.last = () => max >= min ? new Atom(max) : null;
    s.skip = c => i += c;
    return s;
  }
};

export class len extends Op {
  eval(env) {
    this.check([[1,1],[0,0]]);
    if(!this.ins[0])
      throw 'no arg';
    return new Atom(this.ins[0].eval(env).len());
  }
};

export class first extends Op {
  eval(env) {
    this.check([[1,1],[0,0]]);
    if(!this.ins[0])
      throw 'no arg';
    const {value, done} = this.ins[0].eval(env).next();
    if(done)
      throw 'first of empty';
    else
      return value.eval(env);
  }
};

export class last extends Op {
  eval(env) {
    this.check([[1,1],[0,0]]);
    if(!this.ins[0])
      throw 'no arg';
    const l = this.ins[0].eval(env).last();
    if(l === null)
      throw 'last of empty';
    else
      return l;
  }
};
