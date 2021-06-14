import {Filter, Atom, Stream, InfStream, mainReg} from '../base.js';

function asnum(s) {
  if(!(s instanceof Atom))
    throw 'not atom';
  const v = s.value;
  if(typeof v !== 'bigint')
    throw 'not number';
  return v;
}

mainReg.register('iota', class extends Filter {
  eval(env) {
    this.check([[0,0],[0,0]]);
    const s = new InfStream(this, env);
    let i = 1n;
    s.nextv = () => new Atom(i++);
    s.skip = c => i += c;
    return s;
  }
});

mainReg.register(['range', 'r'], class extends Filter {
  eval(env) {
    this.check([[0,0],[1,2]]);
    const s = new Stream(this, env);
    const [min, max] = this.args[0] && this.args[1]
      ? [asnum(this.args[0]), asnum(this.args[1])]
      : [1n, asnum(this.args[0])];
    let i = min;
    s.next = () => i <= max
        ? { value: new Atom(i++), done: false }
        : { done: true };
    s.len = () => max >= min ? max - min + 1n : 0
    s.last = () => max >= min ? new Atom(max) : null;
    s.skip = c => i += c;
    return s;
  }
});

mainReg.register(['length', 'len'], class extends Filter {
  eval(env) {
    this.check([[1,1],[0,0]]);
    return new Atom(this.src.eval(env).len());
  }
});

mainReg.register('first', class extends Filter {
  eval(env) {
    this.check([[1,1],[0,0]]);
    const {value, done} = this.src.eval(env).next();
    if(done)
      throw 'first of empty';
    else
      return value.eval(env);
  }
});

mainReg.register('last', class extends Filter {
  eval(env) {
    this.check([[1,1],[0,0]]);
    const l = this.src.eval(env).last();
    if(l === null)
      throw 'last of empty';
    else
      return l;
  }
});
