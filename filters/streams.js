import {StreamError} from '../errors.js';
import {Node, Atom, Block, Stream, types, debug, compareStreams} from '../base.js';
import {ord} from './string.js';
import R from '../register.js';

R.register(['iota', 'seq'], {
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

R.register(['range', 'ran', 'rng', 'r'], {
  reqSource: false,
  minArg: 1,
  maxArg: 3,
  eval() {
    const [min, max] = this.args[0] && this.args[1]
      ? [this.args[0].evalAtom([types.N, types.S]), this.args[1].evalAtom([types.N, types.S])]
      : [1n, this.args[0].evalNum()];
    const step = this.args[2] ? this.args[2].evalNum() : 1n;
    if(typeof min !== typeof max)
      throw new StreamError(`min ${Atom.format(min)}, max ${Atom.format(max)} of different types`);
    if(typeof min === 'bigint') {
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
    } else {
      const minCP = BigInt(ord(min));
      const maxCP = BigInt(ord(max));
      let i = minCP;
      return new Stream(this,
        (function*() {
          while(step >= 0n ? i <= maxCP : i >= maxCP) {
            yield new Atom(String.fromCodePoint(Number(i)));
            i += step;
          }
        })(),
        {
          skip: c => i += c * step,
          len: step !== 0n
            ? (a => a >= 0n ? a : 0n)((maxCP - minCP) / step + 1n)
            : null
        }
      );
    }
  }
});

R.register(['length', 'len'], {
  reqSource: true,
  numArg: 0,
  eval() {
    const sIn = this.src.eval().checkType([types.stream, types.S]);
    if(sIn.type === types.stream) {
      sIn.checkFinite();
      let len = 0n;
      if(typeof sIn.len === 'bigint')
        len = sIn.len;
      else {
        for(const i of sIn)
          len++;
      }
      return new Atom(len);
    } else if(sIn.type === types.S) {
      return new Atom(sIn.value.length);
    }
  }
});

R.register('first', {
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
            const r = sIn.next().value;
            if(!r)
              return;
            yield r;
          }
        })(),
        { len: sIn.len === undefined ? undefined
            : sIn.len === null ? l
            : sIn.len >= l ? l
            : sIn.len }
      );
    } else {
      const r = sIn.next().value;
      if(!r)
        throw new StreamError('empty stream');
      else
        return r.eval();
    }
  }
});

R.register('last', {
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
          const r = sIn.next().value;
          if(!r)
            return;
          yield r;
        }
      } else
        sIn.skip(num);
      take = !take;
    }
    if(take)
      yield* sIn;
  })();
}

R.register(['take', 'takedrop', 'td'], {
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

R.register(['drop', 'droptake', 'dt'], {
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

R.register(['droplast', 'dl'], {
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

R.register(['reverse', 'rev'], {
  reqSource: true,
  numArg: 0,
  eval() {
    const sIn = this.src.eval().checkType([types.stream, types.S]);
    if(sIn.type === types.stream) {
      sIn.checkFinite();
      const vals = [...sIn].reverse();
      return new Stream(this,
        vals.values(),
        {len: BigInt(vals.length)}
      );
    } else if(sIn.type === types.S) {
      return new Atom([...sIn.value].reverse().join(''));
    }
  }
});

R.register(['repeat', 'rep'], {
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

R.register(['cycle', 'cc'], {
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

R.register(['group', 'g'], {
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
          const arr = [];
          for(let i = 0n; i < len; i++) {
            const r = sIn.next().value;
            if(!r)
              break;
            arr.push(r);
          }
          // Yield empty group if asked to, but don't output trailing [] on EOI
          if(arr.length > 0n || len === 0n)
            yield new Node('array', token, null, arr, {});
          if(arr.length < len)
            break;
        }
      })(),
      {len}
    );
  }
});

R.register(['flatten', 'fl'], {
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

R.register(['padleft', 'pl'], {
  reqSource: true,
  numArg: 2,
  eval() {
    const sIn = this.src.eval().checkType([types.stream, types.S]);
    const len = this.args[0].evalNum({min: 0n});
    if(sIn.type === types.stream) {
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
    } else {
      const fill = this.args[1].evalAtom(types.S);
      return new Atom(sIn.value.padStart(Number(len), fill));
    }
  }
});

R.register(['padright', 'pr'], {
  reqSource: true,
  numArg: 2,
  eval() {
    const sIn = this.src.eval().checkType([types.stream, types.S]);
    const len = this.args[0].evalNum({min: 0n});
    const fill = this.args[1];
    if(sIn.type === types.stream) {
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
    } else {
      const fillStr = fill.evalAtom(types.S);
      return new Atom(sIn.value.padEnd(Number(len), fillStr));
    }
  }
});

R.register(['prepend', 'prep'], {
  reqSource: true,
  minArg: 1,
  eval() {
    const args = this.args.map(arg => arg.eval());
    args.push(this.src.eval());
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
  }
});

R.register('nest', {
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

R.register('fold', {
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

R.register('xfold', {
  reqSource: true,
  numArg: 2,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src: undefined, outer: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const sIn = this.src.evalStream();
    const body = this.args[0].checkType([types.symbol, types.expr]);;
    let curr = this.args[1].prepare({src: this.src});
    return new Stream(this,
      (function*() {
        for(const next of sIn) {
          const ret = body.apply([curr, next]).evalStream();
          const add = ret.next().value?.evalStream();
          curr = ret.next().value;
          if(!add || !curr || !ret.next().done)
            throw new StreamError('body must return in the format [[add...], mem]');
          yield* add;
        }
        yield curr;
      })()
    );
  }
});

R.register('xlate', {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src: undefined, outer: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const sIn = this.src.evalStream();
    const body = this.args[0].checkType([types.symbol, types.expr]);;
    return new Stream(this,
      (function*() {
        for(const value of sIn) {
          const add = body.prepare({src: value}).evalStream();
          yield* add;
        }
      })()
    );
  }
});

R.register('reduce', {
  reqSource: true,
  minArg: 1,
  maxArg: 2,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src: undefined, outer: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const sIn = this.src.evalStream({finite: true});
    const body = this.args[0].checkType([types.symbol, types.expr]);;
    let curr;
    if(this.args.length > 1)
      curr = this.args[this.args.length - 1].prepare({src: this.src});
    for(const next of sIn)
      curr = curr ? body.apply([curr, next]) : next;
    if(!curr)
      throw new StreamError('empty stream');
    return curr.eval();
  }
});

R.register('recur', {
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

R.register('map2', {
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

R.register('if', {
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

R.register(['select', 'sel', 'where'], {
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

R.register(['iwhere', 'ixwhere'], {
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
        let i = 1;
        for(const value of sIn) {
          if(cond.prepare({src: value}).evalAtom('boolean'))
            yield new Atom(i);
          ++i;
        }
      })()
    );
  }
});

R.register('while', {
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

R.register('sort', {
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

R.register(['ddup', 'drep', 'dd'], {
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

R.register('fixed', {
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

R.register('index', {
  reqSource: true,
  numArg: 1,
  eval() {
    const sIn = this.src.eval().checkType([types.stream, types.S]);
    if(sIn.type === types.stream) {
      const ref = this.args[0];
      let i = 0;
      for(const r of sIn) {
        i++;
        if(compareStreams(r, ref))
          return new Atom(i);
      }
      // not found
      return new Atom(0);
    } else {
      const haystack = sIn.value;
      const needle = this.args[0].evalAtom(types.S);
      return new Atom(haystack.indexOf(needle) + 1);
    }
  }
});

R.register('indexes', {
  reqSource: true,
  numArg: 1,
  eval() {
    const sIn = this.src.eval().checkType([types.stream, types.S]);
    if(sIn.type === types.stream) {
      const ref = this.args[0];
      return new Stream(this,
        (function*() {
          let i = 0;
          for(const r of sIn) {
            i++;
            if(compareStreams(r, ref))
              yield new Atom(i);
          }
        })()
      );
    } else {
      const haystack = sIn.value;
      const needle = this.args[0].evalAtom(types.S);
      return new Stream(this,
        (function*() {
          let start = 0;
          for(;;) {
            let curr = haystack.indexOf(needle, start);
            if(curr < 0)
              break;
            // else
            yield new Atom(curr + 1);
            start = curr + 1;
          }
        })()
      );
    }
  }
});

R.register('includes', {
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

R.register('element', {
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

R.register('count', {
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

R.register(['counts', 'tally', 'freq'], {
  reqSource: true,
  maxArg: 1,
  eval() {
    const sIn = this.src.evalStream({finite: true});
    const map = new Map();
    const fixed = (this.args.length !== 0);
    const vals = fixed ? [...this.args[0].evalStream({finite: true})] : [];
    const cnts = vals.map(_ => 0n);
    A: for(const r of sIn) {
      for(const ix of vals.keys())
        if(compareStreams(r, vals[ix])) {
          cnts[ix]++;
          continue A;
        }
      // not found
      if(!fixed) {
        vals.push(r);
        cnts.push(1n);
      }
    }
    const token = this.token;
    return new Stream(this,
      (function*() {
        for(const ix of vals.keys())
          yield new Node('array', token, null, [vals[ix], new Atom(cnts[ix])]);
      })(),
      {len: BigInt(vals.length)}
    );
  }
});

R.register('uniq', {
  reqSource: true,
  numArg: 0,
  eval() {
    const sIn = this.src.evalStream({finite: true});
    const set = new Set();
    return new Stream(this,
      (function*() {
        A: for(const r of sIn) {
          for(const s of set)
            if(compareStreams(r, s))
              continue A;
          // else
          set.add(r);
          yield r;
        }
      })()
    );
  }
});

R.register('rle', {
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

R.register(['unrle', 'unfreq', 'untally'], {
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

R.register('isstream', {
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

R.register('with', {
  minArg: 2,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.slice();
    if(args.length) {
      const body = args.pop().prepare({...scope, src, register: undefined, partial: true});
      args.forEach((arg, ix) => {
        if(arg.token.value !== '=')
          throw new StreamError(`expected assignment, found ${arg.desc()}`);
        args[ix] = arg.toAssign().prepare({...scope, src, partial: true, expand: !scope.partial});
      });
      args.push(body);
    }
    const mod = {src: null, args};
    if(scope.register)
      mod.meta = {...this.meta, _register: scope.register};
    const pnode = this.modify(mod).check(scope.partial);
    if(debug)
      console.log(`prepare ${this.toString()} stage 1 => ${pnode.toString()}`);
    if(scope.partial)
      return pnode;
    else {
      const outerReg = pnode.meta._register;
      if(!outerReg)
        throw new Error('register not defined');
      const innerReg = outerReg.child();
      const args = pnode.args.slice();
      const body = args.pop();
      for(const arg of args)
        arg.prepare({register: innerReg}).eval();
      return body.prepare({...scope, register: innerReg});
    }
  }
});

R.register('longest', {
  reqSource: true,
  numArg: 0,
  eval() {
    const sIn = this.src.evalStream({finite: true});
    let maxS = null, maxL = -1n;
    for(const read of sIn) {
      const sRead = read.evalStream();
      let len = 0n;
      if(sRead.len === null) // infinite, auto winner
        return read.eval();
      else if(typeof sRead.len === 'bigint')
        len = sRead.len;
      else {
        for(const i of sRead)
          len++;
      }
      if(len > maxL) {
        maxL = len;
        maxS = read;
      }
    }
    if(maxS === null)
      throw new StreamError('empty stream');
    else
      return maxS.eval();
  }
});

R.register('shortest', {
  reqSource: true,
  numArg: 0,
  eval() {
    const sIn = this.src.evalStream({finite: true});
    let minS = null, minL = null;
    for(const read of sIn) {
      const sRead = read.evalStream();
      let len = 0n;
      if(sRead.len === null)
        continue;
      else if(sRead.len === 0n) // can't be shorter
        return read.eval();
      else if(typeof sRead.len === 'bigint')
        len = sRead.len;
      else {
        for(const i of sRead)
          len++;
      }
      if(minL === null || len < minL) {
        minL = len;
        minS = read;
      }
    }
    if(minS === null)
      throw new StreamError('empty stream');
    else
      return minS.eval();
  }
});

R.register(['subs', 'subst', 'replace', 'repl'], {
  reqSource: true,
  numArg: 1,
  eval() {
    const sIn = this.src.evalStream();
    const sSubs = this.args[0].evalStream({finite: true});
    const map = new Map();
    for(const r of sSubs) {
      const sTemp = r.evalStream();
      const key = sTemp.next().value;
      const val = sTemp.next().value;
      if(!key || !val || !(sTemp.next().done))
        throw new StreamError('substitutions not in the format [[a,b], ...]');
      if([...map.keys()].some(k => compareStreams(k, key)))
        throw new StreamError(`duplicate key ${key.toString()}`);
      map.set(key, val);
    }
    return new Stream(this,
      (function*() {
        A: for(const r of sIn) {
          for(const [key, val] of map)
            if(compareStreams(r, key)) {
              yield val;
              continue A;
            }
          // else
          yield r;
        }
      })(),
      {
        len: sIn.len,
        skip: sIn.skip
      }
    );
  }
});
