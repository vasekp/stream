import {Node, Atom, mainReg} from '../base.js';

function asnum(s) {
  if(!(s instanceof Atom))
    throw 'not atom';
  const v = s.value;
  if(typeof v !== 'bigint')
    throw 'not number';
  return v;
}

mainReg.register('iota', {
  numArg: 0,
  eval: function() {
    let i = 1n;
    const iter = (function*() { for(;;) yield new Atom(i++); })();
    iter.skip = c => i += c;
    iter.inf = true;
    return iter;
  }
});

mainReg.register(['range', 'r'], {
  minArg: 1,
  maxArg: 2,
  eval: function(src, args) {
    const [min, max] = args[0] && args[1]
      ? [asnum(args[0]), asnum(args[1])]
      : [1n, asnum(args[0])];
    let i = min;
    const iter = (function*() { while(i <= max) yield new Atom(i++); })();
    iter.skip = c => i += c;
    iter.len = max >= min ? max - min + 1n : 0;
    iter.last = max >= min ? new Atom(max) : null;
    return iter;
  }
});

mainReg.register(['length', 'len'], {
  source: true,
  numArg: 0,
  eval: function(src, args, env) {
    const st = src.eval(env);
    if(st instanceof Atom)
      throw 'length of atom';
    let len = 0n;
    if(st.len !== undefined)
      len = st.len;
    else {
      for(const i of st)
        len++;
    }
    return new Atom(len);
  }
});

mainReg.register('first', {
  source: true,
  numArg: 0,
  eval: function(src, args, env) {
    const st = src.eval(env);
    if(st instanceof Atom)
      throw 'length of atom';
    const {value, done} = st.next();
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
    const st = src.eval(env);
    if(st instanceof Atom)
      throw 'length of atom';
    let l;
    if(st.last !== undefined)
      l = st.last;
    else
      for(const v of st)
        l = v;
    if(!l)
      throw 'last of empty';
    else
      return l;
  }
});

mainReg.register('array', {
  eval: function(src, args) {
    const len = args.length;
    let i = 0;
    const iter = (function*() { while(i < len) yield args[i++].prepend(src); })();
    iter.len = len;
    iter.last = len === 0 ? null : args[len - 1].prepend(src);
    iter.skip = c => i += c;
    return iter;
  }
});

mainReg.register('foreach', {
  source: true,
  numArg: 1,
  eval: function(src, args, env) {
    const sIn = src.eval(env);
    const sOut = (function*() {
      for(;;) {
        const {value, done} = sIn.next();
        if(done)
          return;
        else
          yield args[0].prepend(value);
      }
    })();
    sOut.len = sIn.len;
    sOut.skip = sIn.skip;
    return sOut;
  }
});
