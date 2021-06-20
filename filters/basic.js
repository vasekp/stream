import {Node, Atom, Block, StreamError, checks, mainReg} from '../base.js';

mainReg.register(['iota', 'seq', 'I'], {
  source: false,
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
  source: false,
  minArg: 1,
  maxArg: 3,
  eval: function() {
    const [min, max] = this.args[0] && this.args[1]
      ? [this.args[0].evalNum(), this.args[1].evalNum()]
      : [1n, this.args[0].evalNum()];
    const step = this.args[2] ? this.args[2].evalNum() : 1n;
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
  eval: function() {
    const st = this.src.evalStream({finite: true});
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
  eval: function() {
    const st = this.src.evalStream();
    const {value, done} = st.next();
    if(done)
      throw new StreamError(null, 'empty stream');
    else
      return value.eval();
  }
});

mainReg.register('last', {
  source: true,
  maxArg: 1,
  eval: function() {
    const st = this.src.evalStream({finite: true});
    if(this.args[0]) {
      const len = this.args[0].evalNum({min: 1n});
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
        return l.eval();
    }
  }
});

mainReg.register('array', {
  source: false,
  eval: function() {
    return this.args.values();
  },
  desc: function() {
    let ret = '';
    if(this.src)
      ret = this.src.desc() + '.';
    ret += '[';
    ret += this.args.map(n => n.desc()).join(',');
    ret += ']';
    return ret;
  }
});

mainReg.register('foreach', {
  source: true,
  numArg: 1,
  prepare: Node.prototype.prepareSrc,
  eval: function() {
    const sIn = this.src.evalStream();
    const body = this.args[0];
    const sOut = (function*() {
      for(;;) {
        const {value, done} = sIn.next();
        if(done)
          return;
        else
          yield body.withSrc(value).prepare();
      }
    })();
    sOut.len = sIn.len;
    sOut.skip = sIn.skip;
    return sOut;
  },
  desc: function() {
    let ret = '';
    if(this.src)
      ret = this.src.desc() + ':';
    else
      ret = 'foreach';
    ret += '(' + this.args.map(a => a.desc()).join(',') + ')';
    return ret;
  }
});

mainReg.register('id', {
  source: true,
  numArg: 0,
  prepare: function() {
    this.checkArgs(this.src, this.args);
    return this.src.prepare();
  },
  eval: function() {
    throw new StreamError(this, 'out of scope');
  },
  desc: function() {
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
  eval: function() {
    const src = this.src;
    if(this.args[0]) {
      const num = this.args[0].evalNum({min: 0n});
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

mainReg.register(['cycle', 'cc'], {
  source: true,
  maxArg: 1,
  eval: function() {
    const src = this.src;
    if(this.args[0]) {
      const num = this.args[0].evalNum({min: 0n});
      return (function*() {
        for(let i = 0n; i < num; i++)
          yield* src.evalStream();
      })();
    } else
      return (function*() {
        for(;;)
          yield* src.evalStream();
      })();
  }
});

mainReg.register(['group', 'g'], {
  source: true,
  minArg: 1,
  eval: function() {
    const sIn = this.src.evalStream();
    let lFun;
    const ins = this.args.map(arg => arg.eval());
    if(ins.every(i => i instanceof Atom)) {
      if(this.args.length === 1) {
        const len = checks.num(ins[0].numValue, {min: 0n});
        lFun = (function*() { for(;;) yield len; })();
      } else {
        lFun = ins.map(i => checks.num(i.numValue, {min: 0n}));
      }
    } else {
      if(this.args.length > 1)
        throw new StreamError(null, 'required list of values or a single stream');
      else
        lFun = (function*() {
          for(const s of ins[0])
            yield s.evalNum({min: 0n});
        })();
    }
    const token = this.token;
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
          yield new Node('array', token, null, r, {});
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
  eval: function() {
    const depth = this.args[0] ? this.args[0].evalNum() : null;
    const node = this;
    return (function*() {
      const it = node.src.eval();
      if(it instanceof Atom)
        yield it;
      else for(const s of node.src.eval()) {
        if(s instanceof Atom || depth === 0n)
          yield s;
        else {
          const tmp = depth !== null
            ? new Node('flatten', node.token, s, [new Atom(depth - 1n)])
            : new Node('flatten', node.token, s);
          yield* tmp.eval();
        }
      }
    })();
  }
});

mainReg.register('join', {
  source: false,
  eval: function() {
    const args = this.args;
    return (function*() {
      for(const arg of args) {
        const ev = arg.eval();
        if(ev instanceof Atom)
          yield ev;
        else
          yield* ev;
      }
    })();
  },
  desc: function() {
    let ret = '';
    if(this.src)
      ret = this.src.desc() + '.';
    ret += '(';
    ret += this.args.map(n => n.desc()).join('~');
    ret += ')';
    return ret;
  }
});

mainReg.register('zip', {
  source: false,
  eval: function() {
    const is = this.args.map(arg => arg.evalStream());
    const node = this;
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
  desc: function() {
    let ret = '';
    if(this.src)
      ret = this.src.desc() + '.';
    ret += '(';
    ret += this.args.map(n => n.desc()).join('%');
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
  eval: function() {
    const sIn = this.src.evalStream();
    const ins = this.args.map(arg => arg.eval());
    if(ins.every(i => i instanceof Atom)) {
      if(this.args.length === 1) {
        const ix = checks.num(ins[0].numValue, {min: 1n});
        sIn.skip(ix - 1n);
        const {value, done} = sIn.next();
        if(done)
          throw new StreamError(null, `requested part ${ix} beyond end`);
        return value.eval();
      } else
        return part(sIn, ins.map(i => checks.num(i.numValue, {min: 1n})));
    } else if(this.args.length > 1)
      throw new StreamError(null, 'required list of values or a single stream');
    const iter = part(sIn, (function*() {
      for(const s of ins[0])
        yield s.evalNum({min: 1n});
    })());
    iter.len = sIn.len;
    iter.skip = sIn.skip;
    return iter;
  },
  desc: function() {
    let ret = '';
    if(this.src) {
      ret = this.src.desc();
      ret += '[' + this.args.map(a => a.desc()).join(',') + ']';
    } else {
      ret = 'part';
      ret += '(' + this.args.map(a => a.desc()).join(',') + ')';
    }
    return ret;
  }
});

mainReg.register('in', {
  maxArg: 1,
  withEnv(env) {
    if(this.args[0]) {
      const ix = this.args[0].evalNum(env, {min: 1n, max: env.args.length});
      return env.args[Number(ix) - 1];
    } else {
      if(env.src)
        return env.src;
      else
        throw new StreamError(this, 'outer scope has empty source');
    }
  },
  eval: function() {
    throw new StreamError(this, 'out of scope');
  },
  desc: function() {
    let ret = '';
    if(this.src)
      ret = this.src.desc() + '.';
    if(this.args.length === 0)
      ret += '##';
    else if(this.args.length === 1
        && this.args[0] instanceof Atom
        && typeof this.args[0].value === 'bigint'
        && this.args[0].value > 0n)
      ret += '#' + this.args[0].value;
    else {
      ret = 'in';
      ret += '(' + this.args.map(a => a.desc()).join(',') + ')';
    }
    return ret;
  }
});

mainReg.register('nest', {
  source: true,
  numArg: 1,
  prepare: Node.prototype.prepareSrc,
  eval: function() {
    let curr = this.src;
    const body = this.args[0];
    const iter = (function*() {
      for(;;) {
        yield curr;
        curr = body.withSrc(curr).prepare();
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
  prepare: Node.prototype.prepareSrc,
  eval: function() {
    const sIn = this.src.evalStream();
    const bodyMem = this.args[0].bare ? this.args[0] : new Block(this.args[0], this.token);
    const bodyOut = this.args.length === 3
      ? this.args[1].bare ? this.args[1] : new Block(this.args[1], this.token)
      : bodyMem;
    let curr;
    if(this.args.length > 1)
      curr = this.args[this.args.length - 1].withSrc(this.src).prepare();
    else {
      let done;
      ({value: curr, done} = sIn.next());
      if(done)
        return;
    }
    const iter = (function*() {
      for(const next of sIn) {
        yield bodyOut.withArgs([curr, next]).prepare();
        curr = bodyMem.withArgs([curr, next]).prepare();
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
        iter.len = this.args.length > 1 ? sIn.len : sIn.len - 1n;
        break;
    }
    return iter;
  }
});

mainReg.register('recur', {
  source: true,
  numArg: 1,
  prepare: Node.prototype.prepareSrc,
  eval: function() {
    const sIn = this.src.evalStream({finite: true});
    const body = this.args[0].bare ? checks.stream(this.args[0]) : new Block(this.args[0], this.token);
    const iter = (function*() {
      let prev = [...sIn].reverse();
      for(;;) {
        const next = body.withArgs(prev).prepare();
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
  eval: function() {
    const sIn = this.src.evalStream({finite: true});
    return [...sIn].reverse().values();
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
  eval: function() {
    const sIn = this.src.evalStream();
    const ins = this.args.map(arg => arg.eval());
    if(ins.every(i => i instanceof Atom))
      return takedrop(sIn, ins.map(i => checks.num(i.numValue, {min: 0n})));
    else if(this.args.length > 1)
      throw new StreamError(null, 'required list of values or a single stream');
    return takedrop(sIn, (function*() {
      for(const s of ins[0])
        yield s.evalNum({min: 0n});
    })());
  }
});

mainReg.register(['drop', 'droptake', 'dt'], {
  source: true,
  minArg: 1,
  eval: function() {
    const sIn = this.src.evalStream();
    const ins = this.args.map(arg => arg.eval());
    if(ins.every(i => i instanceof Atom))
      return takedrop(sIn, [0n, ...ins.map(i => checks.num(i.numValue, {min: 0n}))]);
    else if(this.args.length > 1)
      throw new StreamError(null, 'required list of values or a single stream');
    return takedrop(sIn, (function*() {
      yield 0n;
      for(const s of ins[0])
        yield s.evalNum({min: 0n});
    })());
  }
});
