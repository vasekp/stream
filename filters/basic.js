import {Node, Atom, Stream, InfStream, mainReg} from '../base.js';

function asnum(s) {
  if(!(s instanceof Atom))
    throw 'not atom';
  const v = s.value;
  if(typeof v !== 'bigint')
    throw 'not number';
  return v;
}

mainReg.register('iota', {
  source: false,
  numArg: 0,
  eval: function() {
    const s = new InfStream();
    let i = 1n;
    s.nextv = () => new Atom(i++);
    s.skip = c => i += c;
    return s;
  }
});

mainReg.register(['range', 'r'], {
  source: false,
  minArg: 1,
  maxArg: 2,
  eval: function(src, args) {
    const s = new Stream();
    const [min, max] = args[0] && args[1]
      ? [asnum(args[0]), asnum(args[1])]
      : [1n, asnum(args[0])];
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

mainReg.register(['length', 'len'], {
  source: true,
  numArg: 0,
  eval: function(src, args, env) {
    return new Atom(src.eval(env).len());
  }
});

mainReg.register('first', {
  source: true,
  numArg: 0,
  eval: function(src, args, env) {
    const {value, done} = src.eval(env).next();
    if(done)
      throw 'first of empty';
    else
      return value.eval(env);
  }
});

mainReg.register('last', {
  source: true,
  numArg: 0,
  eval: function(src, args, env) {
    const l = src.eval(env).last();
    if(l === null)
      throw 'last of empty';
    else
      return l;
  }
});
