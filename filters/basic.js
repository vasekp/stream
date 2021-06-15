import {Node, Atom, mainReg} from '../base.js';

function asnum(st, env) {
  const ev = st.eval(env);
  if(!(ev instanceof Atom))
    throw 'not atom';
  const v = ev.value;
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
    iter.len = null;
    return iter;
  }
});

mainReg.register(['range', 'ra'], {
  minArg: 1,
  maxArg: 3,
  eval: function(src, args, env) {
    const [min, max] = args[0] && args[1]
      ? [asnum(args[0].prepend(src), env), asnum(args[1].prepend(src), env)]
      : [1n, asnum(args[0].prepend(src), env)];
    const step = args[2] ? asnum(args[2].prepend(src), env) : 1n;
    let i = min;
    const iter = (function*() {
      while(i <= max) {
        yield new Atom(i);
        i += step;
      }
    })();
    iter.skip = c => i += c * step;
    if(step !== 0n)
      iter.len = max >= min ? (max - min) / step + 1n : 0n;
    else
      iter.len = null;
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
    if(st.len === undefined) {
      for(const i of st)
        len++;
    } else if(st.len !== null)
      len = st.len;
    else
      throw 'length of infinite';
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
    if(st.len === undefined) {
      for(const v of st)
        l = v;
    } else if(st.len !== null && st.len !== 0n) {
      st.skip(st.len - 1n);
      ({value: l} = st.next());
    } else if(st.len === 0)
      throw 'last of empty';
    else if(st.len === null)
      throw 'last of infinite';
    if(!l)
      throw 'last of empty';
    else
      return l.eval(env);
  }
});

mainReg.register('array', {
  eval: function(src, args) {
    const len = BigInt(args.length);
    let i = 0n;
    const iter = (function*() { while(i < len) yield args[i++].prepend(src); })();
    iter.len = len;
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

mainReg.register('in', {
  source: true,
  numArg: 0,
  eval: function(src, args, env) {
    return src.eval(env);
  }
});

mainReg.register(['repeat', 're'], {
  source: true,
  minArg: 0,
  maxArg: 1,
  eval: function(src, args, env) {
    if(args[0]) {
      const num = asnum(args[0].prepend(src), env);
      let i = 0n;
      const iter = (function*() { while(i++ < num) yield src; })();
      iter.skip = c => i += c;
      iter.len = num;
      return iter;
    } else {
      const iter = (function*() { for(;;) yield src; })();
      iter.skip = () => null;
      iter.len = null;
      return iter;
    }
  }
});
