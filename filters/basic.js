import {Node, Atom, Block, mainReg} from '../base.js';

function asnum(st, env) {
  const ev = st.eval(env);
  if(!(ev instanceof Atom))
    throw 'not atom';
  const v = ev.value;
  if(typeof v !== 'bigint')
    throw 'not number';
  return v;
}

mainReg.register(['iota', 'seq', 'I'], {
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
  eval: function(node, env) {
    const [min, max] = node.args[0] && node.args[1]
      ? [asnum(node.args[0].prepend(node.src), env), asnum(node.args[1].prepend(node.src), env)]
      : [1n, asnum(node.args[0].prepend(node.src), env)];
    const step = node.args[2] ? asnum(node.args[2].prepend(node.src), env) : 1n;
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
  eval: function(node, env) {
    const st = node.src.eval(env);
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
  eval: function(node, env) {
    const st = node.src.eval(env);
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
  eval: function(node, env) {
    const st = node.src.eval(env);
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
  eval: function(node) {
    const len = BigInt(node.args.length);
    let i = 0n;
    const iter = (function*() { while(i < len) yield node.args[i++].prepend(node.src); })();
    iter.len = len;
    iter.skip = c => i += c;
    return iter;
  }
});

mainReg.register('foreach', {
  source: true,
  numArg: 1,
  eval: function(node, env) {
    const sIn = node.src.eval(env);
    if(sIn instanceof Atom)
      throw 'foreach called on atom';
    const sOut = (function*() {
      for(;;) {
        const {value, done} = sIn.next();
        if(done)
          return;
        else
          yield node.args[0].prepend(value);
      }
    })();
    sOut.len = sIn.len;
    sOut.skip = sIn.skip;
    return sOut;
  }
});

mainReg.register('id', {
  source: true,
  numArg: 0,
  eval: function(node, env) {
    return node.src.eval(env);
  }
});

mainReg.register(['repeat', 're'], {
  source: true,
  maxArg: 1,
  eval: function(node, env) {
    if(node.args[0]) {
      const num = asnum(node.args[0].prepend(node.src), env);
      if(num < 0n)
        throw 'repeat neg';
      let i = 0n;
      const iter = (function*() { while(i++ < num) yield node.src; })();
      iter.skip = c => i += c;
      iter.len = num;
      return iter;
    } else {
      const iter = (function*() { for(;;) yield node.src; })();
      iter.skip = () => null;
      iter.len = null;
      return iter;
    }
  }
});

mainReg.register(['cycle', 'cc'], {
  source: true,
  maxArg: 1,
  eval: function(node, env) {
    if(node.args[0]) {
      const num = asnum(node.args[0].prepend(node.src), env);
      if(num < 0n)
        throw 'cycle neg';
      return (function*() {
        for(let i = 0n; i < num; i++)
          yield* node.src.eval(env);
      })();
    } else
      return (function*() {
        for(;;)
          yield* node.src.eval(env);
      })();
  }
});

mainReg.register(['group', 'g'], {
  source: true,
  numArg: 1,
  eval: function(node, env) {
    const sIn = node.src.eval(env);
    if(sIn instanceof Atom)
      throw 'group called on atom';
    const sArg = node.args[0].prepend(node.src).eval(env);
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
        if(len < 0n)
          throw 'group neg';
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
  eval: function(node, env) {
    const depth = node.args[0] ? asnum(node.args[0].prepend(node.src), env) : null;
    return (function*() {
      const it = node.src.eval(env);
      if(it instanceof Atom)
        yield it;
      else for(const s of node.src.eval(env)) {
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
  eval: function(node, env) {
    return (function*() {
      for(const arg of node.args) {
        const ev = arg.prepend(node.src).eval(env);
        if(ev instanceof Atom)
          yield ev;
        else
          yield* ev;
      }
    })();
  }
});

mainReg.register('zip', {
  eval: function(node, env) {
    const is = node.args.map(arg => arg.prepend(node.src).eval(env));
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
  source: true,
  numArg: 1,
  eval: function(node, env) {
    const sIn = node.src.eval(env);
    if(sIn instanceof Atom)
      throw 'part called on atom';
    const sArg = node.args[0].prepend(node.src).eval(env);
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
          if(ix <= 0)
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

mainReg.register('in', {
  numArg: 1,
  eval: function(node, env) {
    if(!env.ins)
      throw '# outside block';
    const ix = asnum(node.args[0].prepend(node.src), env);
    if(ix < 0n || ix >= env.ins.length)
      throw `index ${ix} outside [0,${env.ins.length - 1}]`;
    if(ix === 0n && !env.ins[0])
      throw '#0 with no source';
    return env.ins[ix].eval(env.pEnv);
  }
});

mainReg.register('nest', {
  source: true,
  numArg: 1,
  eval: function(node, env) {
    const iter = (function*() {
      let curr = node.src;
      for(;;) {
        yield curr;
        curr = node.args[0].prepend(curr);
      }
    })();
    iter.len = null;
    return iter;
  }
});

mainReg.register('reduce', {
  source: true,
  minArg: 1,
  maxArg: 2,
  eval: function(node, env) {
    const sIn = node.src.eval(env);
    if(sIn instanceof Atom)
      throw 'reduce called on atom';
    const body = node.args[0].bare ? node.args[0] : new Block(node.args[0]);
    const iter = (function*() {
      let curr;
      if(node.args[1])
        curr = node.args[1].prepend(node.src);
      else {
        let done;
        ({value: curr, done} = sIn.next());
        if(done)
          return;
      }
      for(const next of sIn) {
        curr = body.apply([curr, next]);
        yield curr;
      }
    })();
    switch(sIn.len) {
      case undefined:
        break;
      case null:
        iter.len = null;
        break;
      case 0n:
        iter.len = 0n;
        break;
      default:
        iter.len = node.args[1] ? sIn.len : sIn.len - 1n;
        break;
    }
    return iter;
  }
});

mainReg.register(['reverse', 'rev'], {
  source: true,
  numArg: 0,
  eval: function(node, env) {
    const sIn = node.src.eval(env);
    if(sIn instanceof Atom)
      throw 'reverse called on atom';
    if(sIn.len === null)
      throw 'reverse called on infinite';
    const cont = [...sIn].reverse();
    let i = 0;
    const iter = (function*() {
      while(i < cont.length)
        yield cont[i++];
    })();
    iter.len = sIn.len;
    iter.skip = c => i += Number(c);
    return iter;
  }
});

function takedrop(sIn, iter) {
  return (function*() {
    let take = true;
    for(const num of iter) {
      if(num < 0n)
        throw `requested negative ${take?'take':'drop'}`;
      if(take) {
        for(let i = 0n; i < num; i++) {
          const {value, done} = sIn.next();
          if(done)
            return;
          yield value;
        }
      } else
        sIn.skip(num);
      take = !take;
    }
    if(take)
      yield* sIn;
  })();
}

mainReg.register(['take', 'takedrop', 'td'], {
  source: true,
  numArg: 1,
  eval: function(node, env) {
    const sIn = node.src.eval(env);
    if(sIn instanceof Atom)
      throw 'take called on atom';
    const sArg = node.args[0].prepend(node.src).eval(env);
    if(sArg instanceof Atom) {
      const num = asnum(sArg, env);
      return takedrop(sIn, [num]);
    } else {
      return takedrop(sIn, (function*() {
        for(const s of sArg)
          yield asnum(s, env);
      })());
    }
  }
});

mainReg.register(['drop', 'droptake', 'dt'], {
  source: true,
  numArg: 1,
  eval: function(node, env) {
    const sIn = node.src.eval(env);
    if(sIn instanceof Atom)
      throw 'take called on atom';
    const sArg = node.args[0].prepend(node.src).eval(env);
    if(sArg instanceof Atom) {
      const num = asnum(sArg, env);
      return takedrop(sIn, [0n, num]);
    } else {
      return takedrop(sIn, (function*() {
        yield 0n;
        for(const s of sArg)
          yield asnum(s, env);
      })());
    }
  }
});
