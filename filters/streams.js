import {StreamError} from '../errors.js';
import {Node, Atom, Block, Stream, types, mainReg, compareStreams} from '../base.js';

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

mainReg.register(['droplast', 'dl'], {
  reqSource: true,
  maxArg: 1,
  eval() {
    const sIn = this.src.evalStream({finite: true});
    const num = this.args[0] ? this.args[0].evalNum({min: 1n}) : 0n;
    let l = [];
    return new Stream(this,
      (function*() {
        for(const v of sIn) {
          l.push(v);
          if(l.length > num)
            yield l.shift();
        }
      })(),
      {
        len: sIn.len === undefined ? undefined
          : sIn.len === null ? null
          : sIn.len >= num ? sIn.len - num
          : 0n
      });
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
      let ev = src.evalStream();
      return new Stream(this,
        (function*() {
          for(;;) {
            yield* ev;
            ev = src.evalStream();
          }
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

mainReg.register(['padleft', 'pl'], {
  reqSource: true,
  numArg: 2,
  eval() {
    const sIn = this.src.evalStream();
    const len = this.args[0].evalNum({min: 0n});
    const arr = [];
    let i = 0n;
    for(const r of sIn) {
      arr.push(r);
      if(++i == len)
        break;
    }
    const fill = this.args[1];
    return new Stream(this,
      (function*() {
        for(; i < len; i++)
          yield fill;
        yield* arr;
        yield* sIn;
      })(),
      {
        len: typeof sIn.len === 'bigint' && sIn.len < len ? len : sIn.len
      }
    );
  }
});

mainReg.register(['padright', 'pr'], {
  reqSource: true,
  numArg: 2,
  eval() {
    const sIn = this.src.evalStream();
    const len = this.args[0].evalNum({min: 0n});
    const fill = this.args[1];
    return new Stream(this,
      (function*() {
        let i = 0n;
        for(const r of sIn) {
          yield r;
          i++;
        }
        for(; i < len; i++)
          yield fill;
      })(),
      {
        len: (typeof sIn.len === 'bigint' && sIn.len < len) ? len : sIn.len
      }
    );
  }
});

mainReg.register('nest', {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    let curr = this.src;
    const body = this.args[0].checkType([types.symbol, types.expr]);
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
    const args = this.args.map(arg => arg.prepare({...scope, src: undefined, outer: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const sIn = this.src.evalStream();
    const bodyMem = this.args[0].checkType([types.symbol, types.expr]);;
    const bodyOut = this.args.length === 3
      ? this.args[1].checkType([types.symbol, types.expr])
      : bodyMem;
    let curr;
    if(this.args.length > 1)
      curr = this.args[this.args.length - 1].prepare({src: this.src});
    return new Stream(this,
      (function*() {
        for(const next of sIn) {
          const val = curr ? bodyOut.apply([curr, next]) : next;
          curr = bodyMem === bodyOut ? val : bodyMem.apply([curr, next]);
          yield val;
        }
      })(),
      {len: sIn.len}
    );
  }
});

mainReg.register('recur', {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src: undefined, outer: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const sIn = this.src.evalStream({finite: true});
    const body = this.args[0].checkType([types.symbol, types.expr]);
    return new Stream(this,
      (function*() {
        let prev = [...sIn];
        yield* prev;
        prev = prev.reverse();
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

mainReg.register('map2', {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src: undefined, outer: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const sIn = this.src.evalStream();
    const body = this.args[0].checkType([types.symbol, types.expr]);
    return new Stream(this,
      (function*() {
        let prev;
        for(const curr of sIn) {
          if(!prev) {
            prev = curr;
            continue;
          }
          const val = body.apply([prev, curr]);
          prev = curr;
          yield val;
        }
      })(),
      {
        len: typeof sIn.len === 'bigint' && sIn.len > 0n ? sIn.len - 1n : sIn.len
      }
    );
  }
});

mainReg.register('if', {
  numArg: 3,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src: undefined, partial: true}));
    const pnode = this.modify({src, args}).check(scope.partial);
    if(scope.partial)
      return pnode;
    else {
      const val = pnode.args[0].prepare({...scope, src}).evalAtom('boolean');
      return pnode.args[val ? 1 : 2].prepare({...scope, src});
    }
  },
});

mainReg.register(['select', 'sel', 'where'], {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src: undefined, partial: true}));
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
    const args = this.args.map(arg => arg.prepare({...scope, src: undefined, partial: true}));
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

function numCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

const strCompare = Intl.Collator().compare;

function usort(arr, fn = x => x) {
  if(arr.length === 0)
    return arr;
  const first = fn(arr[0]).checkType([types.N, types.S]);
  if(first.type === types.N) {
    arr.forEach(a => fn(a).checkType(types.N));
    arr.sort((a, b) => numCompare(fn(a).value, fn(b).value));
  } else if(first.type === types.S) {
    arr.forEach(a => fn(a).checkType(types.S));
    arr.sort((a, b) => strCompare(fn(a).value, fn(b).value));
  }
}

mainReg.register('sort', {
  reqSource: true,
  maxArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src: undefined, partial: true}));
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

mainReg.register('uniq', {
  reqSource: true,
  numArg: 0,
  eval() {
    const sIn = this.src.evalStream();
    return new Stream(this,
      (function*() {
        let prev;
        for(const curr of sIn) {
          if(!prev || !compareStreams(curr, prev))
            yield curr;
          prev = curr;
        }
      })()
    );
  }
});

mainReg.register('fixed', {
  reqSource: true,
  numArg: 0,
  eval() {
    const sIn = this.src.evalStream();
    let prev;
    for(const curr of sIn) {
      if(prev && compareStreams(curr, prev))
        return curr.eval();
      prev = curr;
    }
    // not found
    throw new StreamError('no repeated element found');
  }
});

mainReg.register('index', {
  reqSource: true,
  numArg: 1,
  eval() {
    const sIn = this.src.evalStream();
    const ref = this.args[0];
    let i = 0;
    for(const r of sIn) {
      i++;
      if(compareStreams(r, ref))
        return new Atom(i);
    }
    // not found
    return new Atom(0);
  }
});

mainReg.register('includes', {
  reqSource: true,
  numArg: 1,
  eval() {
    const sIn = this.src.evalStream();
    const ref = this.args[0];
    let i = 0;
    for(const r of sIn) {
      i++;
      if(compareStreams(r, ref))
        return new Atom(true);
    }
    // not found
    return new Atom(false);
  }
});

mainReg.register('element', {
  reqSource: true,
  numArg: 1,
  eval() {
    const ref = this.src;
    const sArg = this.args[0].evalStream();
    let i = 0;
    for(const r of sArg) {
      i++;
      if(compareStreams(r, ref))
        return new Atom(true);
    }
    // not found
    return new Atom(false);
  }
});

mainReg.register('count', {
  reqSource: true,
  numArg: 1,
  eval() {
    const sIn = this.src.evalStream({finite: true});
    const ref = this.args[0];
    let count = 0;
    for(const r of sIn) {
      if(compareStreams(r, ref))
        count++;
    }
    return new Atom(count);
  }
});

mainReg.register('rle', {
  reqSource: true,
  numArg: 0,
  eval() {
    const sIn = this.src.evalStream();
    const token = this.token;
    return new Stream(this,
      (function*() {
        let prev;
        let count;
        for(const curr of sIn) {
          if(!prev) {
            count = 1;
          } else if(!compareStreams(curr, prev)) {
            yield new Node('array', token, null, [prev, new Atom(count)]);
            count = 1;
          } else
            count++;
          prev = curr;
        }
        yield new Node('array', token, null, [prev, new Atom(count)]);
      })()
    );
  }
});

mainReg.register('unrle', {
  reqSource: true,
  numArg: 0,
  eval() {
    const sIn = this.src.evalStream();
    return new Stream(this,
      (function*() {
        for(const r of sIn) {
          const sInner = r.evalStream();
          const elm = sInner.next().value;
          const count = sInner.next().value.evalNum({min: 0n});
          const test = sInner.next().done;
          if(!test || !elm || count === undefined)
            throw new StreamError(`${r.toString}: not in RLE format`);
          for(let i = 0n; i < count; i++)
            yield elm;
        }
      })()
    );
  }
});

mainReg.register('isstream', {
  reqSource: true,
  numArg: 0,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const c = nnode.src.eval();
    return new Atom(c.type === types.stream);
  }
});
