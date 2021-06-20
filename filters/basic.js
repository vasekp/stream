import {Node, Atom, Block, Stream, StreamError, checks, mainReg} from '../base.js';

mainReg.register(['iota', 'seq', 'I'], {
  source: false,
  numArg: 0,
  eval: function() {
    let i = 1n;
    return new Stream(this,
      (function*() { for(;;) yield new Atom(i++); })(),
      {
        skip: c => i += c,
        len: null
      }
    );
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
    return new Stream(this,
      (function*() {
        while(step >= 0n ? i <= max : i >= max) {
          yield new Atom(i);
          i += step;
        }
      })(),
      {
        skip: c => i += c * step,
        len: step !== 0n
          ? (a => a >= 0n ? a : 0n)((max - min) / step + 1n)
          : null
      }
    );
  }
});

mainReg.register(['length', 'len'], {
  source: true,
  numArg: 0,
  eval: function() {
    const sIn = this.src.evalStream({finite: true});
    let len = 0n;
    if(sIn.len === undefined) {
      for(const i of sIn)
        len++;
    } else if(sIn.len !== null)
      len = sIn.len;
    else
      throw new Error('assertion failed');
    return new Atom(len);
  }
});

mainReg.register('first', {
  source: true,
  maxArg: 1,
  eval: function() {
    const sIn = this.src.evalStream();
    if(this.args[0]) {
      const l = this.args[0].evalNum({min: 1n});
      let i = 0n;
      return new Stream(this,
        (function*() {
          while(i++ < l) {
            const {value, done} = sIn.next();
            if(done)
              return;
            yield value;
          }
        })(),
        { len: sIn.len === undefined ? undefined
            : sIn.len === null ? l
            : sIn.len >= l ? l
            : sIn.len }
      );
    } else {
      const {value, done} = sIn.next();
      if(done)
        throw new StreamError(this, 'empty stream');
      else
        return value.eval();
    }
  }
});

mainReg.register('last', {
  source: true,
  maxArg: 1,
  eval: function() {
    const sIn = this.src.evalStream({finite: true});
    if(this.args[0]) {
      const len = this.args[0].evalNum({min: 1n});
      let l = [];
      if(sIn.len === undefined) {
        for(const v of sIn) {
          l.push(v);
          if(l.length > len)
            l.shift();
        }
        return new Stream(this, l.values(), {len: BigInt(l.length)});
      } else if(sIn.len !== null) {
        if(sIn.len > len) {
          sIn.skip(sIn.len - len);
          sIn.len = len;
        }
        return sIn;
      } else if(sIn.len === null) {
        throw new Error('assertion failed');
      }
    } else {
      let l;
      if(sIn.len === undefined) {
        for(const v of sIn)
          l = v;
      } else if(sIn.len === null) {
        throw new Error('assertion failed');
      } else if(sIn.len !== 0n) {
        sIn.skip(sIn.len - 1n);
        ({value: l} = sIn.next());
      }
      if(!l)
        throw new StreamError(this, 'empty stream');
      else
        return l.eval();
    }
  }
});

mainReg.register('array', {
  source: false,
  eval: function() {
    return new Stream(this, this.args.values());
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
    return new Stream(this,
      (function*() {
        for(;;) {
          const {value, done} = sIn.next();
          if(done)
            return;
          else
            yield body.withSrc(value).prepare();
        }
      })(),
      {
        skip: sIn.skip,
        len: sIn.len
      }
    );
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
      return new Stream(this,
        (function*() { while(i++ < num) yield src; })(),
        {
          skip: c => i += c,
          len: num
        }
      );
    } else {
      return new Stream(this,
        (function*() { for(;;) yield src; })(),
        {
          skip: () => {},
          len: null
        }
      );
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
      return new Stream(this,
        (function*() {
          for(let i = 0n; i < num; i++)
            yield* src.evalStream();
        })());
    } else {
      return new Stream(this,
        (function*() {
          for(;;)
            yield* src.evalStream();
        })()
      );
    }
  }
});

mainReg.register(['group', 'g'], {
  source: true,
  minArg: 1,
  eval: function() {
    const sIn = this.src.evalStream();
    let lFun;
    const ins = this.args.map(arg => arg.eval());
    if(ins.every(i => i.isAtom)) {
      if(this.args.length === 1) {
        const len = checks.num(ins[0].numValue, {min: 0n});
        lFun = (function*() { for(;;) yield len; })();
      } else {
        lFun = ins.map(i => checks.num(i.numValue, {min: 0n}));
      }
    } else {
      if(this.args.length > 1)
        throw new StreamError(this, 'required list of values or a single stream');
      else
        lFun = (function*() {
          for(const s of ins[0])
            yield s.evalNum({min: 0n});
        })();
    }
    const token = this.token;
    return new Stream(this,
      (function*() {
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
      })()
    );
  }
});

mainReg.register(['flatten', 'fl'], {
  source: true,
  maxArg: 1,
  eval: function() {
    const depth = this.args[0] ? this.args[0].evalNum() : null;
    const node = this;
    return new Stream(this,
      (function*() {
        const r = node.src.eval();
        if(r.isAtom)
          yield r;
        else for(const s of node.src.eval()) {
          if(s.isAtom || depth === 0n)
            yield s;
          else {
            const tmp = depth !== null
              ? new Node('flatten', node.token, s, [new Atom(depth - 1n)])
              : new Node('flatten', node.token, s);
            yield* tmp.eval();
          }
        }
      })()
    );
  }
});

mainReg.register('join', {
  source: false,
  eval: function() {
    const args = this.args;
    return new Stream(this,
      (function*() {
        for(const arg of args) {
          const r = arg.eval();
          if(r.isAtom)
            yield r;
          else
            yield* r;
        }
      })()
    );
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
    return new Stream(this,
      (function*() {
        for(;;) {
          const rs = is.map(i => i.next());
          if(rs.some(r => r.done))
            break;
          const vs = rs.map(r => r.value);
          yield new Node('array', node.token, null, vs);
        }
      })()
    );
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
            throw new StreamError(this, `requested part ${ix} beyond end`);
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
    if(ins.every(i => i.isAtom)) {
      if(this.args.length === 1) {
        const ix = checks.num(ins[0].numValue, {min: 1n});
        sIn.skip(ix - 1n);
        const {value, done} = sIn.next();
        if(done)
          throw new StreamError(this, `requested part ${ix} beyond end`);
        return value.eval();
      } else
        return new Stream(this,
          part(sIn, ins.map(i => checks.num(i.numValue, {min: 1n}))));
    } else if(this.args.length > 1)
      throw new StreamError(this, 'required list of values or a single stream');
    return new Stream(this,
      part(sIn, (function*() {
        for(const s of ins[0])
          yield s.evalNum({min: 1n});
      })()),
      {
        len: sIn.len,
        skip: sIn.skip
      }
    );
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
        && this.args[0].isAtom
        && this.args[0].type === 'number'
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
    return new Stream(this,
      (function*() {
        for(;;) {
          yield curr;
          curr = body.withSrc(curr).prepare();
        }
      })(),
      {len: null}
    );
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
    const ret = new Stream(this,
      (function*() {
        for(const next of sIn) {
          yield bodyOut.withArgs([curr, next]).prepare();
          curr = bodyMem.withArgs([curr, next]).prepare();
        }
      })()
    );
    switch(sIn.len) {
      case undefined:
        break;
      case null:
        ret.len = null;
        break;
      case 0n:
        ret.len = 0n;
        break;
      default:
        ret.len = this.args.length > 1 ? sIn.len : sIn.len - 1n;
        break;
    }
    return ret;
  }
});

mainReg.register('recur', {
  source: true,
  numArg: 1,
  prepare: Node.prototype.prepareSrc,
  eval: function() {
    const sIn = this.src.evalStream({finite: true});
    const body = this.args[0].bare ? checks.stream(this.args[0]) : new Block(this.args[0], this.token);
    return new Stream(this,
      (function*() {
        let prev = [...sIn].reverse();
        for(;;) {
          const next = body.withArgs(prev).prepare();
          yield next;
          prev = prev.slice(0, -1);
          prev.unshift(next);
        }
      })(),
      {len: null}
    );
  }
});

mainReg.register(['reverse', 'rev'], {
  source: true,
  numArg: 0,
  eval: function() {
    const sIn = this.src.evalStream({finite: true});
    return new Stream(this, [...sIn].reverse().values());
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
    if(ins.every(i => i.isAtom))
      return new Stream(this,
        takedrop(sIn, ins.map(i => checks.num(i.numValue, {min: 0n}))));
    else if(this.args.length > 1)
      throw new StreamError(this, 'required list of values or a single stream');
    return new Stream(this,
      takedrop(sIn, (function*() {
        for(const s of ins[0])
          yield s.evalNum({min: 0n});
      })())
    );
  }
});

mainReg.register(['drop', 'droptake', 'dt'], {
  source: true,
  minArg: 1,
  eval: function() {
    const sIn = this.src.evalStream();
    const ins = this.args.map(arg => arg.eval());
    if(ins.every(i => i.isAtom))
      return new Stream(this,
        takedrop(sIn, [0n, ...ins.map(i => checks.num(i.numValue, {min: 0n}))]));
    else if(this.args.length > 1)
      throw new StreamError(this, 'required list of values or a single stream');
    return new Stream(this,
      takedrop(sIn, (function*() {
        yield 0n;
        for(const s of ins[0])
          yield s.evalNum({min: 0n});
      })())
    );
  }
});
