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
      while(step >= 0n ? i <= max : i >= max) {
        yield new Atom(i);
        i += step;
      }
    })();
    iter.skip = c => i += c * step;
    if(step !== 0n)
      iter.len = (a => a >= 0n ? a : 0)((max - min) / step + 1n);
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
    if(sIn instanceof Atom)
      throw 'foreach called on atom';
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

mainReg.register(['group', 'g'], {
  source: true,
  numArg: 1,
  eval: function(src, args, env) {
    const sIn = src.eval(env);
    if(sIn instanceof Atom)
      throw 'group called on atom';
    const sArg = args[0].prepend(src).eval(env);
    const lFun = sArg instanceof Atom
      ? (() => {
        const len = asnum(sArg);
        return (function*() { for(;;) yield len; })();
      })()
      : (function*() {
        for(const s of sArg)
          yield asnum(s, env);
      })();
    const iter = (function*() {
      for(const len of lFun) {
        const r = [];
        for(let i = 0n; i < len; i++) {
          const {value, done} = sIn.next();
          if(done)
            break;
          r.push(value);
        }
        // Yield empty group if asked to, but don't output trailing [] on EOI
        if(r.length > 0n || len === 0n)
          yield new Node('array', null, r, {});
        if(r.length < len)
          break;
      }
    })();
    if(sArg instanceof Atom) {
      const len = asnum(sArg);
      iter.skip = c => sIn.skip(c * len);
    }
    return iter;
  }
});

mainReg.register(['flatten', 'fl'], {
  source: true,
  maxArg: 1,
  eval: function(src, args, env) {
    const depth = args[0] ? asnum(args[0].prepend(src), env) : null;
    return (function*() {
      for(const s of src.eval(env)) {
        if(s instanceof Atom || depth === 0n)
          yield s;
        else {
          const tmp = depth !== null
            ? new Node('flatten', s, [new Atom(depth - 1n)])
            : new Node('flatten', s);
          yield* tmp.eval(env);
        }
      }
    })();
  }
});

mainReg.register('join', {
  eval: function(src, args, env) {
    return (function*() {
      for(const arg of args) {
        const ev = arg.prepend(src).eval(env);
        if(ev instanceof Atom)
          yield ev;
        else
          yield* ev;
      }
    })();
  }
});

mainReg.register('zip', {
  eval: function(src, args, env) {
    const is = args.map(arg => arg.prepend(src).eval(env));
    if(is.map(i => i instanceof Atom).includes(true))
      throw 'zip called with atom';
    return (function*() {
      for(;;) {
        const rs = is.map(i => i.next());
        if(rs.map(r => r.done).includes(true))
          break;
        const vs = rs.map(r => r.value);
        yield new Node('array', null, vs);
      }
    })();
  }
});

mainReg.register('part', {
  numArg: 1,
  eval: function(src, args, env) {
    const sIn = src.eval(env);
    if(sIn instanceof Atom)
      throw 'part called on atom';
    const sArg = args[0].prepend(src).eval(env);
    if(sArg instanceof Atom) {
      const ix = asnum(sArg, env);
      if(ix <= 0n)
        throw 'requested negative part';
      sIn.skip(ix - 1n);
      const {value, done} = sIn.next();
      if(done)
        throw 'requested part > length';
      return value.eval(env);
    } else {
      const iter = (function*() {
        const mem = [];
        for(const s of sArg) {
          const ix = Number(asnum(s, env));
          if(ix <= 0n)
            throw 'requested negative part';
          if(ix > mem.length)
            for(let i = mem.length; i < ix; i++) {
              const {value, done} = sIn.next();
              if(done)
                throw 'requested part > length';
              mem.push(value);
            }
          yield mem[ix - 1];
        }
      })();
      iter.len = sIn.len;
      iter.skip = sIn.skip;
      return iter;
    }
  }
});

mainReg.register('nest', {
  source: true,
  numArg: 1,
  eval: function(src, args, env) {
    const iter = (function*() {
      let curr = src;
      for(;;) {
        yield curr;
        curr = args[0].prepend(curr);
      }
    })();
    iter.len = null;
    return iter;
  }
});
