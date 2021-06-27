import {StreamError} from '../errors.js';
import {Node, Atom, Block, Stream, mainReg} from '../base.js';

mainReg.register(['iota', 'seq'], {
  reqSource: false,
  numArg: 0,
  eval() {
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
  reqSource: false,
  minArg: 1,
  maxArg: 3,
  eval() {
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
  reqSource: true,
  numArg: 0,
  eval() {
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
  reqSource: true,
  maxArg: 1,
  eval() {
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
        throw new StreamError('empty stream');
      else
        return value.eval();
    }
  }
});

mainReg.register('last', {
  reqSource: true,
  maxArg: 1,
  eval() {
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
        throw new StreamError('empty stream');
      else
        return l.eval();
    }
  }
});

mainReg.register('array', {
  reqSource: false,
  eval() {
    return new Stream(this,
      this.args.values(),
      {len: BigInt(this.args.length)}
    );
  },
  toString() {
    let ret = '';
    if(this.src)
      ret = this.src.toString() + '.';
    ret += '[';
    ret += this.args.map(n => n.toString()).join(',');
    ret += ']';
    return ret;
  }
});

mainReg.register('foreach', {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = (scope.args || this.args).map(arg => arg.prepare({...scope, src: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const sIn = this.src.evalStream();
    const body = this.args[0];
    return new Stream(this,
      (function*() {
        for(;;) {
          const {value, done} = sIn.next();
          if(done)
            return;
          else
            yield body.prepare({src: value});
        }
      })(),
      {
        skip: sIn.skip,
        len: sIn.len
      }
    );
  },
  toString() {
    let ret = '';
    if(this.src)
      ret = this.src.toString() + ':';
    else
      ret = 'foreach';
    ret += '(' + this.args.map(a => a.toString()).join(',') + ')';
    return ret;
  }
});

mainReg.register('id', {
  reqSource: true,
  numArg: 0,
  prepare(scope) {
    const pnode = this.prepareAll(scope);
    return scope.partial ? pnode : pnode.src;
  },
  eval() {
    throw new StreamError('out of scope');
  },
  toString() {
    let ret = '';
    if(this.src)
      ret = this.src.toString() + '.';
    ret += '#';
    return ret;
  }
});

mainReg.register(['repeat', 'rep'], {
  reqSource: true,
  maxArg: 1,
  eval() {
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
  reqSource: true,
  maxArg: 1,
  eval() {
    const src = this.src;
    if(this.args[0]) {
      const num = this.args[0].evalNum({min: 0n});
      const ev = src.evalStream();
      return new Stream(this,
        (function*() {
          for(let i = 0n; i < num; i++)
            yield* src.evalStream();
        })(),
        {
          len: ev.len === null ? null
            : ev.len === undefined ? undefined
            : ev.len * num
        }
      );
    } else {
      return new Stream(this,
        (function*() {
          for(;;)
            yield* src.evalStream();
        })(),
        {
          len: ev.len === undefined ? undefined
            : ev.len === 0n ? 0n : null
        }
      );
    }
  }
});

mainReg.register(['group', 'g'], {
  reqSource: true,
  minArg: 1,
  eval() {
    const sIn = this.src.evalStream();
    let lFun;
    let len;
    const ins = this.args.map(arg => arg.eval());
    if(ins.every(i => i.isAtom)) {
      if(this.args.length === 1) {
        const l = ins[0].numValue({min: 0n});
        lFun = (function*() { for(;;) yield l; })();
        len = sIn.len === null ? null
          : sIn.len === undefined ? undefined
          : l === 0n ? null
          : (sIn.len + l - 1n) / l;
      } else
        lFun = ins.map(i => i.numValue({min: 0n}));
    } else {
      if(this.args.length > 1)
        throw new StreamError('required list of values or a single stream');
      else {
        lFun = (function*() {
          for(const s of ins[0])
            yield s.evalNum({min: 0n});
        })();
      }
    }
    const token = this.token;
    return new Stream(this,
      (function*() {
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
            yield new Node('array', token, null, r, {});
          if(r.length < len)
            break;
        }
      })(),
      {len}
    );
  }
});

mainReg.register(['flatten', 'fl'], {
  reqSource: true,
  maxArg: 1,
  eval() {
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
  reqSource: false,
  eval() {
    const args = this.args.map(arg => arg.eval());
    const lens = args.map(arg => arg.isAtom ? 1n : arg.len);
    const len = lens.some(len => len === undefined) ? undefined
      : lens.some(len => len === null) ? null
      : lens.reduce((a,b) => a+b);
    return new Stream(this,
      (function*() {
        for(const arg of args) {
          if(arg.isAtom)
            yield arg;
          else
            yield* arg;
        }
      })(),
      {len}
    );
  },
  toString() {
    let ret = '';
    if(this.src)
      ret = this.src.toString() + '.';
    if(this.args.length > 0) {
      ret += '(';
      ret += this.args.map(n => n.toString()).join('~');
      ret += ')';
    } else
      ret += 'join()';
    return ret;
  }
});

mainReg.register('zip', {
  reqSource: false,
  eval() {
    const args = this.args.map(arg => arg.evalStream());
    const lens = args.map(arg => arg.len);
    const len = lens.some(len => len === undefined) ? undefined
      : lens.every(len => len === null) ? null
      : lens.filter(len => len !== undefined && len !== null).reduce((a,b) => a < b ? a : b);
    const node = this;
    return new Stream(this,
      (function*() {
        for(;;) {
          const rs = args.map(arg => arg.next());
          if(rs.some(r => r.done))
            break;
          const vs = rs.map(r => r.value);
          yield new Node('array', node.token, null, vs);
        }
      })(),
      {len}
    );
  },
  toString() {
    let ret = '';
    if(this.src)
      ret = this.src.toString() + '.';
    if(this.args.length > 0) {
      ret += '(';
      ret += this.args.map(n => n.toString()).join('%');
      ret += ')';
    } else
      ret += 'zip()';
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
            throw new StreamError(`requested part ${ix} beyond end`);
          mem.push(value);
        }
      yield mem[Number(ix) - 1];
    }
  })();
}

mainReg.register('part', {
  reqSource: true,
  minArg: 1,
  eval() {
    const sIn = this.src.evalStream();
    const ins = this.args.map(arg => arg.eval());
    if(ins.every(i => i.isAtom)) {
      if(this.args.length === 1) {
        const ix = ins[0].numValue({min: 1n});
        sIn.skip(ix - 1n);
        const {value, done} = sIn.next();
        if(done)
          throw new StreamError(`requested part ${ix} beyond end`);
        return value.eval();
      } else
        return new Stream(this,
          part(sIn, ins.map(i => i.numValue({min: 1n}))),
          {len: BigInt(ins.length)});
    } else if(this.args.length > 1)
      throw new StreamError('required list of values or a single stream');
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
  toString() {
    let ret = '';
    if(this.src) {
      ret = this.src.toString();
      ret += '[' + this.args.map(a => a.toString()).join(',') + ']';
    } else {
      ret = 'part';
      ret += '(' + this.args.map(a => a.toString()).join(',') + ')';
    }
    return ret;
  }
});

mainReg.register('in', {
  maxArg: 1,
  prepare(scope) {
    this.check(scope.partial)
    if(scope.outer) {
      if(this.args[0]) {
        const ix = this.args[0].evalNum({min: 1n, max: scope.partial ? undefined : scope.outer.args.length});
        return ix <= scope.outer.args.length ? scope.outer.args[Number(ix) - 1] : this;
      } else {
        if(scope.outer.src)
          return scope.outer.src;
        else
          return this;
      }
    } else
      return this;
  },
  eval() {
    throw new StreamError('out of scope');
  },
  toString() {
    let ret = '';
    if(this.src)
      ret = this.src.toString() + '.';
    if(this.args.length === 0)
      ret += '##';
    else if(this.args.length === 1
        && this.args[0].isAtom
        && this.args[0].type === 'number'
        && this.args[0].value > 0n)
      ret += '#' + this.args[0].value;
    else {
      ret = 'in';
      ret += '(' + this.args.map(a => a.toString()).join(',') + ')';
    }
    return ret;
  }
});

mainReg.register('nest', {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = (scope.args || this.args).map(arg => arg.prepare({...scope, src: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    let curr = this.src;
    const body = this.args[0];
    return new Stream(this,
      (function*() {
        for(;;) {
          yield curr;
          curr = body.prepare({src: curr});
        }
      })(),
      {len: null}
    );
  }
});

mainReg.register('reduce', {
  reqSource: true,
  minArg: 1,
  maxArg: 3,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = (scope.args || this.args).map(arg => arg.prepare({...scope, src: undefined, outer: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const sIn = this.src.evalStream();
    const bodyMem = this.args[0];
    const bodyOut = this.args.length === 3 ? this.args[1] : bodyMem;
    let curr;
    if(this.args.length > 1)
      curr = this.args[this.args.length - 1].prepare({src: this.src});
    else {
      let done;
      ({value: curr, done} = sIn.next());
      if(done)
        return;
    }
    return new Stream(this,
      (function*() {
        for(const next of sIn) {
          const val = bodyOut.apply([curr, next]);
          curr = bodyMem === bodyOut ? val : bodyMem.apply([curr, next]);
          yield val;
        }
      })(),
      {
        len: sIn.len === undefined ? undefined
          : sIn.len === null ? null
          : sIn.len === 0n ? 0n
          : this.args.length > 1 ? sIn.len
          : sIn.len - 1n
      }
    );
  }
});

mainReg.register('recur', {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = (scope.args || this.args).map(arg => arg.prepare({...scope, src: undefined, outer: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const sIn = this.src.evalStream({finite: true});
    const body = this.args[0].checkType('stream');
    return new Stream(this,
      (function*() {
        let prev = [...sIn].reverse();
        for(;;) {
          const next = body.apply(prev);
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
  reqSource: true,
  numArg: 0,
  eval() {
    const sIn = this.src.evalStream({finite: true});
    const vals = [...sIn].reverse();
    return new Stream(this,
      vals.values(),
      {len: BigInt(vals.length)}
    );
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
  reqSource: true,
  minArg: 1,
  eval() {
    const sIn = this.src.evalStream();
    const ins = this.args.map(arg => arg.eval());
    if(ins.every(i => i.isAtom))
      return new Stream(this,
        takedrop(sIn, ins.map(i => i.numValue({min: 0n}))));
    else if(this.args.length > 1)
      throw new StreamError('required list of values or a single stream');
    return new Stream(this,
      takedrop(sIn, (function*() {
        for(const s of ins[0])
          yield s.evalNum({min: 0n});
      })())
    );
  }
});

mainReg.register(['drop', 'droptake', 'dt'], {
  reqSource: true,
  minArg: 1,
  eval() {
    const sIn = this.src.evalStream();
    const ins = this.args.map(arg => arg.eval());
    if(ins.every(i => i.isAtom))
      return new Stream(this,
        takedrop(sIn, [0n, ...ins.map(i => i.numValue({min: 0n}))]));
    else if(this.args.length > 1)
      throw new StreamError('required list of values or a single stream');
    return new Stream(this,
      takedrop(sIn, (function*() {
        yield 0n;
        for(const s of ins[0])
          yield s.evalNum({min: 0n});
      })())
    );
  }
});

mainReg.register('over', {
  reqSource: true,
  minArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare({...scope, partial: true}) : scope.src;
    const args = (scope.args || this.args).map(arg => arg.prepare({...scope, src}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const body = this.src;
    const args = this.args.map(arg => arg.evalStream());
    const lens = args.map(arg => arg.len);
    const len = lens.some(len => len === undefined) ? undefined
      : lens.every(len => len === null) ? null
      : lens.filter(len => len !== undefined && len !== null).reduce((a,b) => a < b ? a : b);
    return new Stream(this,
      (function*() {
        for(;;) {
          const rs = args.map(arg => arg.next());
          if(rs.some(r => r.done))
            break;
          const vs = rs.map(r => r.value);
          yield body.apply(vs);
        }
      })(),
      {len}
    );
  },
  toString() {
    let ret = '';
    if(this.src && this.args.length === 1)
      ret = this.src.toString() + '@'
    else {
      if(this.src)
        ret = this.src.toString() + '.';
      ret += this.ident;
    }
    ret += '(';
    ret += this.args.map(n => n.toString()).join(',');
    ret += ')';
    return ret;
  }
});

mainReg.register('if', {
  numArg: 3,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = (scope.args || this.args).map(arg => arg.prepare({...scope, src: undefined, partial: true}));
    const pnode = this.modify({src, args}).check(scope.partial);
    if(scope.partial)
      return pnode;
    else {
      const val = pnode.args[0].prepare({...scope, src}).evalAtom('boolean');
      return pnode.args[val ? 1 : 2].prepare({...scope, src});
    }
  },
});

mainReg.register(['select', 'sel'], {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = (scope.args || this.args).map(arg => arg.prepare({...scope, src: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const sIn = this.src.evalStream();
    const cond = this.args[0];
    return new Stream(this,
      (function*() {
        for(const value of sIn) {
          if(cond.prepare({src: value}).evalAtom('boolean'))
            yield value;
        }
      })()
    );
  }
});

mainReg.register('while', {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = (scope.args || this.args).map(arg => arg.prepare({...scope, src: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const sIn = this.src.evalStream();
    const cond = this.args[0];
    return new Stream(this,
      (function*() {
        for(const value of sIn) {
          if(cond.prepare({src: value}).evalAtom('boolean'))
            yield value;
          else
            return;
        }
      })()
    );
  }
});

function eq(args) {
  const ins = args.map(arg => arg.eval());
  if(ins.every(i => i.isAtom)) {
    const vals = args.map(arg => arg.value);
    return vals.every(val => val === vals[0]);
  } else if(ins.some(i => i.isAtom))
    return false;
  // else
  /* all ins confirmed streams now */
  const lens = ins.map(i => i.len).filter(i => i !== undefined);
  if(lens.length > 1 && lens.some(l => l !== lens[0]))
    return false;
  if(lens.some(l => l === null))
    throw new StreamError('can\'t determine equality');
  for(;;) {
    const rs = ins.map(i => i.next());
    if(rs.every(r => r.done))
      return true;
    else if(rs.some(r => r.done))
      return false;
    if(!eq(rs.map(r => r.value)))
      return false;
  }
}

mainReg.register('equal', {
  reqSource: false,
  minArg: 2,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(nnode.args.every(arg => arg.isAtom))
      return new Atom(eq(nnode.args));
    else
      return nnode;
  },
  eval() {
    return new Atom(eq(this.args));
  },
  toString() {
    let ret = '';
    if(this.src)
      ret = this.src.toString() + '.';
    if(this.args.length > 0) {
      ret += '(';
      ret += this.args.map(n => n.toString()).join('=');
      ret += ')';
    } else
      ret += this.ident;
    return ret;
  },
  toAssign() {
    return new Node('assign', this.token, this.src, this.args, this.meta);
  }
});

mainReg.register('assign', {
  reqSource: false,
  minArg: 2,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.slice();
    if(args.length) {
      const body = args.pop().prepare({...scope, partial: true, expand: true});
      args.forEach(arg => arg.checkType('symbol'));
      args.forEach(arg => console.log(arg.desc()));
      args.push(body);
    }
    const mod = {src: null, args};
    if(scope.register)
      mod.meta = {...this.meta, _register: scope.register};
    return this.modify(mod).check(scope.partial);
  },
  eval() {
    const args = this.args.slice();
    const body = args.pop();
    const idents = args.map(arg => arg.ident);
    const reg = this.meta._register;
    if(!reg)
      throw new StreamError('out of scope');
    for(const ident of idents)
      reg.register(ident, {body});
    return new Stream(this,
      idents.map(ident => new Atom(ident)).values(),
      {len: BigInt(idents.length)}
    );
  },
  toString() {
    let ret = '';
    if(this.src)
      ret = this.src.toString() + '.';
    if(this.args.length > 0) {
      ret += '(';
      ret += this.args.map(n => n.toString()).join('=');
      ret += ')';
    } else
      ret += this.ident;
    return ret;
  }
});

function numCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

const strCompare = Intl.Collator().compare;

function usort(arr, fn = x => x) {
  if(arr.length === 0)
    return arr;
  const first = fn(arr[0]).checkType(['number', 'string']);
  if(first.type === 'number') {
    arr.forEach(a => fn(a).checkType('number'));
    arr.sort((a, b) => numCompare(fn(a).value, fn(b).value));
  } else if(first.type === 'string') {
    arr.forEach(a => fn(a).checkType('string'));
    arr.sort((a, b) => strCompare(fn(a).value, fn(b).value));
  }
}

mainReg.register('sort', {
  reqSource: true,
  maxArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = (scope.args || this.args).map(arg => arg.prepare({...scope, src: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const sIn = this.src.evalStream({finite: true});
    if(this.args[0]) {
      const temp = [...sIn].map(s => [s, this.args[0].prepare({src: s}).eval()]);
      usort(temp, x => x[1]);
      const vals = temp.map(x => x[0]);
      return new Stream(this,
        vals.values(),
        {len: BigInt(vals.length)}
      );
    } else {
      const vals = [...sIn].map(s => s.eval());
      usort(vals);
      return new Stream(this,
        vals.values(),
        {len: BigInt(vals.length)}
      );
    }
  }
});

mainReg.register('history', {
  reqSource: false,
  maxArg: 1,
  prepare(scope) {
    if(scope.history) {
      if(this.args[0]) {
        const ix = this.args[0].evalNum({min: 1n});
        const ret = scope.history.at(Number(ix));
        if(!ret)
          throw new StreamError(`history element ${ix} not found`);
        else
          return ret;
      } else {
        const ret = scope.history.last();
        if(!ret)
          throw new StreamError(`history is empty`);
        else
          return ret;
      }
    } else
      throw new StreamError('out of scope');
  },
  toString() {
    let ret = '';
    if(this.src)
      ret = this.src.toString() + '.';
    if(this.args.length === 0)
      ret += '$';
    else if(this.args.length === 1
        && this.args[0].isAtom
        && this.args[0].type === 'number'
        && this.args[0].value > 0n)
      ret += '$' + this.args[0].value;
    else {
      ret = this.ident;
      ret += '(' + this.args.map(a => a.toString()).join(',') + ')';
    }
    return ret;
  }
});
