import {Node, Atom, Block, StreamError, checks, mainReg} from '../base.js';

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
      ? [node.args[0].prepend(node.src).evalNum(env), node.args[1].prepend(node.src).evalNum(env)]
      : [1n, node.args[0].prepend(node.src).evalNum(env)];
    const step = node.args[2] ? node.args[2].prepend(node.src).evalNum(env) : 1n;
    let i = min;
    const iter = (function*() {
      while(step >= 0n ? i <= max : i >= max) {
        yield new Atom(i);
        i += step;
      }
    })();
    iter.skip = c => i += c * step;
    if(step !== 0n)
      iter.len = (a => a >= 0n ? a : 0n)((max - min) / step + 1n);
    else
      iter.len = null;
    return iter;
  }
});

mainReg.register(['length', 'len'], {
  source: true,
  numArg: 0,
  eval: function(node, env) {
    const st = node.src.evalStream(env, {finite: true});
    let len = 0n;
    if(st.len === undefined) {
      for(const i of st)
        len++;
    } else if(st.len !== null)
      len = st.len;
    else
      throw new Error('assertion failed');
    return new Atom(len);
  }
});

mainReg.register('first', {
  source: true,
  numArg: 0,
  eval: function(node, env) {
    const st = node.src.evalStream(env);
    const {value, done} = st.next();
    if(done)
      throw new StreamError(null, 'empty stream');
    else
      return value.eval(env);
  }
});

mainReg.register('last', {
  source: true,
  numArg: 0,
  eval: function(node, env) {
    const st = node.src.evalStream(env, {finite: true});
    let l;
    if(st.len === undefined) {
      for(const v of st)
        l = v;
    } else if(st.len === null) {
      throw new Error('assertion failed');
    } else if(st.len !== null && st.len !== 0n) {
      st.skip(st.len - 1n);
      ({value: l} = st.next());
    }
    if(!l)
      throw new StreamError(null, 'empty stream');
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
    const sIn = node.src.evalStream(env);
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
      const num = node.args[0].prepend(node.src).evalNum(env, {min: 0n});
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
      const num = node.args[0].prepend(node.src).evalNum(env, {min: 0n});
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
    const sIn = node.src.evalStream(env);
    const sArg = node.args[0].prepend(node.src).eval(env);
    const lFun = sArg instanceof Atom
      ? (() => {
        const len = sArg.numValue;
        return (function*() { for(;;) yield len; })();
      })()
      : (function*() {
        for(const s of sArg)
          yield s.evalNum(env);
      })();
    const iter = (function*() {
      for(const len of lFun) {
        checks.num(len, {min: 0n});
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
      const len = sArg.numValue;
      iter.skip = c => sIn.skip(c * len);
    }
    return iter;
  }
});

mainReg.register(['flatten', 'fl'], {
  source: true,
  maxArg: 1,
  eval: function(node, env) {
    const depth = node.args[0] ? node.args[0].prepend(node.src).evalNum(env) : null;
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
    const is = node.args.map(arg => arg.prepend(node.src).evalStream(env));
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
    const sIn = node.src.evalStream(env);
    const sArg = node.args[0].prepend(node.src).eval(env);
    if(sArg instanceof Atom) {
      const ix = sArg.evalNum(env, {min: 1n});
      sIn.skip(ix - 1n);
      const {value, done} = sIn.next();
      if(done)
        throw new StreamError(null, `requested part ${ix} beyond end`);
      return value.eval(env);
    } else {
      const iter = (function*() {
        const mem = [];
        for(const s of sArg) {
          const ix = Number(s.evalNum(env, {min: 1n}));
          if(ix > mem.length)
            for(let i = mem.length; i < ix; i++) {
              const {value, done} = sIn.next();
              if(done)
                throw new StreamError(null, `requested part ${ix} beyond end`);
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
      throw new StreamError(null, 'no surrounding block');
    const ix = node.args[0].prepend(node.src).evalNum(env, {min: 0n, max: env.ins.length - 1});
    if(ix === 0n && !env.ins[0])
      throw new StreamError(null, 'block has empty source');
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
    const sIn = node.src.evalStream(env);
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
    const sIn = node.src.evalStream(env, {finite: true});
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
    const sIn = node.src.evalStream(env);
    const sArg = node.args[0].prepend(node.src).eval(env);
    if(sArg instanceof Atom) {
      const num = sArg.evalNum(env, {min: 0n});
      return takedrop(sIn, [num]);
    } else {
      return takedrop(sIn, (function*() {
        for(const s of sArg)
          yield s.evalNum(env, {min: 0n});
      })());
    }
  }
});

mainReg.register(['drop', 'droptake', 'dt'], {
  source: true,
  numArg: 1,
  eval: function(node, env) {
    const sIn = node.src.evalStream(env);
    const sArg = node.args[0].prepend(node.src).eval(env);
    if(sArg instanceof Atom) {
      const num = sArg.evalNum(env, {min: 0n});
      return takedrop(sIn, [0n, num]);
    } else {
      return takedrop(sIn, (function*() {
        yield 0n;
        for(const s of sArg)
          yield s.evalNum(env, {min: 0n});
      })());
    }
  }
});
