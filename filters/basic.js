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

mainReg.register(['range', 'ran', 'r'], {
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
  maxArg: 1,
  eval: function(node, env) {
    const st = node.src.evalStream(env, {finite: true});
    if(node.args[0]) {
      const len = node.args[0].prepend(node.src).evalNum(env, {min: 1n});
      let l = [];
      if(st.len === undefined) {
        for(const v of st) {
          l.push(v);
          if(l.length > len)
            l.shift();
        }
        const iter = l.values();
        iter.len = BigInt(l.length);
        return iter;
      } else if(st.len !== null) {
        if(st.len > len) {
          st.skip(st.len - len);
          st.len = len;
        }
        return st;
      } else if(st.len === null) {
        throw new Error('assertion failed');
      }
    } else {
      let l;
      if(st.len === undefined) {
        for(const v of st)
          l = v;
      } else if(st.len === null) {
        throw new Error('assertion failed');
      } else if(st.len !== 0n) {
        st.skip(st.len - 1n);
        ({value: l} = st.next());
      }
      if(!l)
        throw new StreamError(null, 'empty stream');
      else
        return l.eval(env);
    }
  }
});

mainReg.register('array', {
  eval: function(node) {
    const iter = node.args.map(arg => arg.prepend(node.src)).values();
    iter.len = BigInt(node.args.length);
    return iter;
  },
  desc: function(node) {
    let ret = '';
    if(node.src)
      ret = node.src.desc() + '.';
    ret += '[';
    ret += node.args.map(n => n.desc()).join(',');
    ret += ']';
    return ret;
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
  },
  desc: function(node) {
    let ret = '';
    if(node.src)
      ret = node.src.desc() + ':';
    else
      ret = 'foreach';
    ret += '(' + node.args.map(a => a.desc()).join(',') + ')';
    return ret;
  }
});

mainReg.register('id', {
  source: true,
  numArg: 0,
  eval: function(node, env) {
    return node.src.eval(env);
  },
  desc: function(node) {
    let ret = '';
    if(this.src)
      ret = this.src.desc() + '.';
    ret += '#';
    return ret;
  }
});

mainReg.register(['repeat', 'rep'], {
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
          yield* node.src.evalStream(env);
      })();
    } else
      return (function*() {
        for(;;)
          yield* node.src.evalStream(env);
      })();
  }
});

mainReg.register(['group', 'g'], {
  source: true,
  minArg: 1,
  eval: function(node, env) {
    const sIn = node.src.evalStream(env);
    let lFun;
    const ins = node.args.map(arg => arg.prepend(node.src).eval(env));
    if(ins.every(i => i instanceof Atom)) {
      if(node.args.length === 1) {
        const len = checks.num(ins[0].numValue, {min: 0n});
        lFun = (function*() { for(;;) yield len; })();
      } else {
        lFun = ins.map(i => checks.num(i.numValue, {min: 0n}));
      }
    } else {
      if(node.args.length > 1)
        throw new StreamError(null, 'required list of values or a single stream');
      else
        lFun = (function*() {
          for(const s of ins[0])
            yield s.evalNum(env, {min: 0n});
        })();
    }
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
          yield new Node('array', node.token, null, r, {});
        if(r.length < len)
          break;
      }
    })();
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
            ? new Node('flatten', node.token, s, [new Atom(depth - 1n)])
            : new Node('flatten', node.token, s);
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
  },
  desc: function(node) {
    let ret = '';
    if(node.src)
      ret = node.src.desc() + '.';
    ret += '(';
    ret += node.args.map(n => n.desc()).join('~');
    ret += ')';
    return ret;
  }
});

mainReg.register('zip', {
  eval: function(node, env) {
    const is = node.args.map(arg => arg.prepend(node.src).evalStream(env));
    return (function*() {
      for(;;) {
        const rs = is.map(i => i.next());
        if(rs.some(r => r.done))
          break;
        const vs = rs.map(r => r.value);
        yield new Node('array', node.token, null, vs);
      }
    })();
  },
  desc: function(node) {
    let ret = '';
    if(node.src)
      ret = node.src.desc() + '.';
    ret += '(';
    ret += node.args.map(n => n.desc()).join('%');
    ret += ')';
    return ret;
  }
});

function part(sIn, iter) {
  return (function*() {
    const mem = [];
    for(const ix of iter) {
      if(ix > mem.length)
        for(let i = mem.length; i < ix; i++) {
          const {value, done} = sIn.next();
          if(done)
            throw new StreamError(null, `requested part ${ix} beyond end`);
          mem.push(value);
        }
      yield mem[Number(ix) - 1];
    }
  })();
}

mainReg.register('part', {
  source: true,
  minArg: 1,
  eval: function(node, env) {
    const sIn = node.src.evalStream(env);
    const ins = node.args.map(arg => arg.prepend(node.src).eval(env));
    if(ins.every(i => i instanceof Atom)) {
      if(node.args.length === 1) {
        const ix = checks.num(ins[0].numValue, {min: 1n});
        sIn.skip(ix - 1n);
        const {value, done} = sIn.next();
        if(done)
          throw new StreamError(null, `requested part ${ix} beyond end`);
        return value.eval(env);
      } else
        return part(sIn, ins.map(i => checks.num(i.numValue, {min: 1n})));
    } else if(node.args.length > 1)
      throw new StreamError(null, 'required list of values or a single stream');
    const iter = part(sIn, (function*() {
      for(const s of ins[0])
        yield s.evalNum(env, {min: 1n});
    })());
    iter.len = sIn.len;
    iter.skip = sIn.skip;
    return iter;
  },
  desc: function(node) {
    let ret = '';
    if(node.src) {
      ret = node.src.desc();
      ret += '[' + node.args.map(a => a.desc()).join(',') + ']';
    } else {
      ret = 'part';
      ret += '(' + node.args.map(a => a.desc()).join(',') + ')';
    }
    return ret;
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
  },
  desc: function(node) {
    let ret = '';
    if(node.src)
      ret = node.src.desc() + '.';
    if(node.args.length === 1
        && node.args[0] instanceof Atom
        && typeof node.args[0].value === 'bigint'
        && node.args[0].value >= 0n)
      ret += '#' + (node.args[0].value > 0n ? node.args[0].value : '#');
    else {
      ret = 'in';
      ret += '(' + node.args.map(a => a.desc()).join(',') + ')';
    }
    return ret;
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
  maxArg: 3,
  eval: function(node, env) {
    const sIn = node.src.evalStream(env);
    const bodyMem = node.args[0].bare ? node.args[0] : new Block(node.args[0], node.token);
    const bodyOut = node.args.length === 3
      ? node.args[1].bare ? node.args[1] : new Block(node.args[1], node.token)
      : bodyMem;
    const iter = (function*() {
      let curr;
      if(node.args.length > 1)
        curr = node.args[node.args.length - 1].prepend(node.src);
      else {
        let done;
        ({value: curr, done} = sIn.next());
        if(done)
          return;
      }
      for(const next of sIn) {
        yield bodyOut.apply([curr, next]);
        curr = bodyMem.apply([curr, next]);
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
        iter.len = node.args.length > 1 ? sIn.len : sIn.len - 1n;
        break;
    }
    return iter;
  }
});

mainReg.register('recur', {
  source: true,
  numArg: 1,
  eval: function(node, env) {
    const sIn = node.src.evalStream(env, {finite: true});
    const body = node.args[0].bare ? checks.stream(node.args[0]) : new Block(node.args[0], node.token);
    const iter = (function*() {
      let prev = [...sIn].reverse();
      for(;;) {
        const next = body.apply(prev);
        yield next;
        prev = prev.slice(0, -1);
        prev.unshift(next);
      }
    })();
    iter.len = null;
    return iter;
  }
});

mainReg.register(['reverse', 'rev'], {
  source: true,
  numArg: 0,
  eval: function(node, env) {
    const sIn = node.src.evalStream(env, {finite: true});
    const iter = [...sIn].reverse().values();
    iter.len = sIn.len;
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
  minArg: 1,
  eval: function(node, env) {
    const sIn = node.src.evalStream(env);
    const ins = node.args.map(arg => arg.prepend(node.src).eval(env));
    if(ins.every(i => i instanceof Atom))
      return takedrop(sIn, ins.map(i => checks.num(i.numValue, {min: 0n})));
    else if(node.args.length > 1)
      throw new StreamError(null, 'required list of values or a single stream');
    return takedrop(sIn, (function*() {
      for(const s of ins[0])
        yield s.evalNum(env, {min: 0n});
    })());
  }
});

mainReg.register(['drop', 'droptake', 'dt'], {
  source: true,
  minArg: 1,
  eval: function(node, env) {
    const sIn = node.src.evalStream(env);
    const ins = node.args.map(arg => arg.prepend(node.src).eval(env));
    if(ins.every(i => i instanceof Atom))
      return takedrop(sIn, [0n, ...ins.map(i => checks.num(i.numValue, {min: 0n}))]);
    else if(node.args.length > 1)
      throw new StreamError(null, 'required list of values or a single stream');
    return takedrop(sIn, (function*() {
      yield 0n;
      for(const s of ins[0])
        yield s.evalNum(env, {min: 0n});
    })());
  }
});
