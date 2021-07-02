import {StreamError} from '../errors.js';
import {Node, Atom, Stream, types, MAXMEM} from '../base.js';
import watchdog from '../watchdog.js';
import R from '../register.js';
import RNG from '../random.js';

function regReducer(name, sign, fun, type = types.N) {
  R.register(name, {
    reqSource: false,
    minArg: 2,
    prepare(scope) {
      const nnode = this.prepareAll(scope);
      if(!scope.partial && nnode.args.every(arg => arg.isAtom))
        return new Atom(nnode.args.map(arg => arg.checkType(type).value).reduce(fun));
      else
        return nnode;
    },
    eval() {
      const is = this.args
        .map(arg => arg.eval());
      if(is.every(i => i.isAtom))
        return new Atom(is.map(a => a.checkType(type).value).reduce(fun));
      else {
        const lens = is.filter(i => !i.isAtom).map(i => i.len);
        const len = lens.some(len => len === undefined) ? undefined
          : lens.every(len => len === null) ? null
          : lens.filter(len => len !== undefined && len !== null).reduce((a,b) => a < b ? a : b);
        return new Stream(this,
          (function*() {
            for(;;) {
              const vs = [];
              for(const i of is)
                if(i.isAtom)
                  vs.push(i.value);
                else {
                  const {value: r, done} = i.next();
                  if(done)
                    return;
                  vs.push(r.evalAtom(type));
                }
              yield new Atom(vs.reduce(fun));
            }
          }()),
          {
            len,
            skip: c => {
              for(const i of is)
                if(!i.isAtom)
                  i.skip(c);
            }
          }
        );
      }
    },
    toString() {
      let ret = '';
      if(this.src)
        ret = this.src.toString() + '.';
      if(this.args.length > 0) {
        ret += '(';
        ret += this.args.map(n => n.toString()).join(sign);
        ret += ')';
      } else
        ret += name;
      return ret;
    }
  });
}

regReducer('plus', '+', (a, b) => {
  if(typeof a !== typeof b)
    throw new StreamError(`${Atom.format(a)} and ${Atom.format(b)} have different types`);
  else
    return a + b;
}, [types.N, types.S]);

regReducer('minus', '-', (a, b) => a - b);
regReducer('times', '*', (a, b) => a * b);
regReducer('div', '/', (a, b) => {
  if(b === 0n)
    throw new StreamError('division by zero');
  else
    return a / b
});

regReducer('and', '&', (a, b) => a && b, types.B);
regReducer('or', '|', (a, b) => a || b, types.B);

function regReducerS(name, fun, numOpts) {
  R.register(name, {
    sourceOrArgs: 1,
    prepare(scope) {
      const nnode = this.prepareAll(scope);
      if(scope.partial)
        return nnode;
      if(nnode.args.length > 0) {
        const ins = nnode.args.map(arg => arg.evalNum());
        const res = ins.reduce(fun);
        return new Atom(res);
      } else {
        const sIn = nnode.src.evalStream({finite: true});
        let res = null;
        for(const s of sIn) {
          const curr = s.evalNum(numOpts);
          res = res === null ? curr : fun(res, curr);
        }
        if(res === null)
          throw new StreamError('empty stream');
        return new Atom(res);
      }
    }
  });
}

function gcd(a, b) {
  for(;;) {
    a %= b;
    if(a === 0n)
      return b;
    b %= a;
    if(b === 0n)
      return a;
  }
}

regReducerS('min', (a, b) => b < a ? b : a);
regReducerS('max', (a, b) => b > a ? b : a);
regReducerS('gcd', gcd, {min: 1n});
regReducerS('lcm', (a, b) => a * (b / gcd(a, b)), {min: 1n});

R.register(['acc', 'ac'], {
  reqSource: true,
  numArg: 0,
  eval() {
    const sIn = this.src.evalStream();
    return new Stream(this,
      (function*() {
        let sum = 0n;
        for(const next of sIn) {
          sum += next.evalNum();
          yield new Atom(sum);
        }
      })(),
      {len: sIn.len}
    );
  }
});

R.register(['total', 'tot', 'sum'], {
  reqSource: true,
  numArg: 0,
  eval() {
    const str = this.src.evalStream({finite: true});
    let tot = 0n;
    for(const s of str)
      tot += s.evalNum();
    return new Atom(tot);
  }
});

R.register('diff', {
  reqSource: true,
  numArg: 0,
  eval() {
    const sIn = this.src.evalStream();
    return new Stream(this,
      (function*() {
        let prev = null;
        for(const next of sIn) {
          const curr = next.evalNum();
          if(prev === null) {
            prev = curr;
            continue;
          }
          yield new Atom(curr - prev);
          prev = curr;
        }
      })(),
      {
        len: sIn.len === undefined ? undefined
          : sIn.len === null ? null
          : sIn.len === 0n ? 0n
          : sIn.len - 1n
      }
    );
  }
});

R.register(['product', 'prod'], {
  reqSource: true,
  numArg: 0,
  eval() {
    const str = this.src.evalStream({finite: true});
    let prod = 1n;
    for(const s of str) {
      prod *= s.evalNum();
      if(prod === 0n)
        break;
    }
    return new Atom(prod);
  }
});

R.register('pow', {
  minArg: 1,
  maxArg: 2,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    if(nnode.args.length === 1) {
      if(!nnode.src)
        throw new StreamError('needs source');
      const base = nnode.src.evalNum();
      const pow = nnode.args[0].evalNum({min: 0n});
      return new Atom(base ** pow);
    } else {
      const base = nnode.args[0].evalNum();
      const pow = nnode.args[1].evalNum({min: 0n});
      return new Atom(base ** pow);
    }
  },
  toString() {
    let ret = '';
    if(this.src)
      ret = this.src.toString() + '.';
    if(this.args.length === 2) {
      ret += '(';
      ret += this.args.map(n => n.toString()).join('^');
      ret += ')';
    } else {
      ret += this.ident;
      ret += '(';
      ret += this.args.map(n => n.toString()).join(',');
      ret += ')';
    }
    return ret;
  }
});

R.register('mod', {
  reqSource: true,
  minArg: 1,
  maxArg: 2,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const inp = nnode.src.evalNum();
    const mod = nnode.args[0].evalNum({min: 1n});
    const base = nnode.args[1] ? nnode.args[1].evalNum() : 0n;
    const res0 = (inp - base) % mod;
    const res = (res0 >= 0n ? res0 : res0 + mod) + base;
    return new Atom(res);
  }
});

R.register('modinv', {
  minArg: 1,
  maxArg: 2,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const [val, mod] = [...
      (nnode.args[1] ? [nnode.args[0], nnode.args[1]] : [nnode.src, nnode.args[0]])
      .map(arg => arg.evalNum({min: 1n}))
    ];
    let [a, b, c, d] = [1n, 0n, 0n, 1n];
    let [x, y] = [val, mod];
    for(;;) {
      if(y === 1n) {
        c %= mod;
        return new Atom(c >= 0n ? c : c + mod);
      } else if(y === 0n)
        throw new StreamError(`${val} and ${mod} are not coprime`);
      let [q, r] = [x / y, x % y]; // Working with BigInt, no need for floor
      [a, b] = [a - q*c, b - q*d];
      [a, b, c, d, x, y] = [c, d, a, b, y, r];
    }
  }
});

R.register('add', {
  reqSource: true,
  minArg: 1,
  maxArg: 3,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const inp = nnode.src.evalNum();
    const add = nnode.args[0].evalNum();
    if(nnode.args.length > 1) {
      const mod = nnode.args[1].evalNum({min: 1n});
      const base = nnode.args[2] ? nnode.args[2].evalNum() : 0n;
      const res0 = (inp + add - base) % mod;
      const res = (res0 >= 0n ? res0 : res0 + mod) + base;
      return new Atom(res);
    } else
      return new Atom(inp + add);
  }
});

R.register('abs', {
  reqSource: true,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const inp = nnode.src.evalNum();
    return new Atom(inp >= 0n ? inp : -inp);
  }
});

R.register(['sign', 'sgn'], {
  reqSource: true,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const inp = nnode.src.evalNum();
    return new Atom(inp > 0n ? 1 : inp < 0n ? -1 : 0);
  }
});

R.register('odd', {
  reqSource: true,
  numArg: 0,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const val = nnode.src.evalNum();
    return new Atom((val & 1n) === 1n);
  }
});

R.register('even', {
  reqSource: true,
  numArg: 0,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const val = nnode.src.evalNum();
    return new Atom((val & 1n) === 0n);
  }
});

R.register('not', {
  maxArg: 1,
  sourceOrArgs: 1,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    if(nnode.args[0]) {
      const val = nnode.args[0].evalAtom(types.B);
      return new Atom(!val);
    } else {
      const val = nnode.src.evalAtom(types.B);
      return new Atom(!val);
    }
  }
});

R.register(['every', 'each', 'all'], {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const sIn = this.src.evalStream({finite: true});
    const cond = this.args[0];
    for(const value of sIn)
      if(!cond.prepare({src: value}).evalAtom('boolean'))
        return new Atom(false);
    return new Atom(true);
  }
});

R.register('some', {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const sIn = this.src.evalStream({finite: true});
    const cond = this.args[0];
    for(const value of sIn)
      if(cond.prepare({src: value}).evalAtom('boolean'))
        return new Atom(true);
    return new Atom(false);
  }
});

function regComparer(name, sign, fun) {
  R.register(name, {
    reqSource: false,
    minArg: 2,
    prepare(scope) {
      const nnode = this.prepareAll(scope);
      if(scope.partial)
        return nnode;
      if(nnode.args.every(arg => arg.isAtom)) {
        const vals = nnode.args.map(arg => arg.numValue());
        let res = true;
        for(let i = 1; i < vals.length; i++)
          res = res && fun(vals[i-1], vals[i]);
        return new Atom(res);
      } else
        return nnode;
    },
    eval() {
      const vals = this.args.map(arg => arg.evalNum());
      let res = true;
      for(let i = 1; i < vals.length; i++)
        res = res && fun(vals[i-1], vals[i]);
      return new Atom(res);
    },
    toString() {
      let ret = '';
      if(this.src)
        ret = this.src.toString() + '.';
      if(this.args.length > 0) {
        ret += '(';
        ret += this.args.map(n => n.toString()).join(sign);
        ret += ')';
      } else
        ret += name;
      return ret;
    }
  });
}

regComparer('lt', '<', (a, b) => a < b);
regComparer('gt', '>', (a, b) => a > b);
regComparer('le', '<=', (a, b) => a <= b);
regComparer('ge', '>=', (a, b) => a >= b);

R.register(['tobase', 'tbase', 'tb', 'str'], {
  reqSource: true,
  maxArg: 2,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    let val = nnode.src.evalNum();
    const base = nnode.args[0] ? nnode.args[0].evalNum({min: 2n, max: 36n}) : 10n;
    const minl = nnode.args[1] ? Number(nnode.args[1].evalNum({min: 1n})) : 0;
    const digit = c => c < 10 ? String.fromCharCode(c + 48) : String.fromCharCode(c + 97 - 10);
    let ret = val < 0 ? '-' : val > 0 ? '' : '0';
    if(val < 0)
      val = -val;
    const digits = [];
    while(val) {
      digits.push(val % base);
      val /= base;
    }
    ret += digits.reverse().map(d => digit(Number(d))).join('');
    return new Atom(ret.padStart(minl, '0'));
  }
});

R.register(['frombase', 'fbase', 'fb', 'num'], {
  reqSource: true,
  maxArg: 2,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const str = nnode.src.evalAtom('string');
    const base = nnode.args[0] ? nnode.args[0].evalNum({min: 2n, max: 36n}) : 10n;
    if(!/^-?[0-9a-zA-Z]+$/.test(str))
      throw new StreamError(`invalid input "${str}"`);
    const digit = c => {
      const d = c >= '0' && c <= '9' ? c.charCodeAt('0') - 48
        : c >= 'a' && c <= 'z' ? c.charCodeAt('a') - 97 + 10
        : c.charCodeAt('a') - 65 + 10;
      if(d >= base)
        throw new StreamError(`invalid digit "${c}" for base ${base}`);
      else
        return d;
    };
    const val = str[0] === '-'
      ? -[...str.substring(1)].map(digit).reduce((v, d) => v * base + BigInt(d), 0n)
      : [...str].map(digit).reduce((v, d) => v * base + BigInt(d), 0n);
    return new Atom(val);
  }
});

R.register(['todigits', 'tdig'], {
  reqSource: true,
  maxArg: 2,
  eval() {
    let val = this.src.evalNum({min: 0n});
    const base = this.args[0] ? this.args[0].evalNum({min: 2n, max: 36n}) : 10n;
    const minl = this.args[1] ? Number(this.args[1].evalNum({min: 1n})) : 0;
    const digits = [];
    while(val) {
      digits.push(val % base);
      val /= base;
    }
    while(digits.length < minl)
      digits.push(0);
    return new Stream(this,
      digits.reverse().map(d => new Atom(d)).values(),
      {len: BigInt(digits.length)}
    );
  }
});

R.register(['fromdigits', 'fdig'], {
  reqSource: true,
  maxArg: 1,
  eval() {
    const sIn = this.src.evalStream({finite: true});
    const base = this.args[0] ? this.args[0].evalNum({min: 2n, max: 36n}) : 10n;
    let val = 0n;
    for(const r of sIn) {
      const digit = r.evalNum({min: 0n, max: base - 1n});
      val = val * base + digit;
    }
    return new Atom(val);
  }
});

const primes = (() => {
  const cache = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n, 53n, 59n, 61n, 67n, 71n, 73n, 79n, 83n, 89n, 97n, 101n, 103n, 107n, 109n, 113n, 127n, 131n, 137n, 139n, 149n, 151n, 157n, 163n, 167n, 173n, 179n, 181n, 191n, 193n, 197n, 199n, 211n, 223n, 227n, 229n, 233n, 239n, 241n, 251n, 257n, 263n, 269n, 271n, 277n, 281n, 283n, 293n, 307n, 311n, 313n, 317n, 331n, 337n, 347n, 349n, 353n, 359n, 367n, 373n, 379n, 383n, 389n, 397n, 401n, 409n, 419n, 421n, 431n, 433n, 439n, 443n, 449n, 457n, 461n, 463n, 467n, 479n, 487n, 491n, 499n, 503n, 509n, 521n, 523n, 541n];
  return function*() {
    yield* cache;
    for(let i = cache[cache.length - 1] + 2n; ; i += 2n) {
      let prime = true;
      for(const p of cache) {
        if(i % p === 0n) {
          prime = false;
          break;
        } else if(p*p > i)
          break;
      }
      if(prime) {
        cache.push(i);
        yield i;
        watchdog.tick();
      }
    }
  };
})();

R.register('primes', {
  reqSource: false,
  numArg: 0,
  eval() {
    return new Stream(this,
      (function*() {
        for(const p of primes())
          yield new Atom(p);
      })(),
      {len: null}
    );
  }
});

R.register('isprime', {
  reqSource: true,
  numArg: 0,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const val = nnode.src.evalNum();
    if(val <= 1n)
      return new Atom(false);
    for(const p of primes()) {
      if(p === val)
        return new Atom(true);
      else if(p * p < val && (val % p) === 0n)
        return new Atom(false);
      else if(p > val)
        return new Atom(false);
    }
  }
});

R.register('factor', {
  reqSource: true,
  numArg: 0,
  eval() {
    let val = this.src.evalNum({min: 1n});
    return new Stream(this,
      (function*() {
        for(const p of primes()) {
          while((val % p) === 0n) {
            yield new Atom(p);
            val /= p;
          }
          if(val === 1n)
            return;
        }
      })()
    );
  }
});

R.register(['isnumber', 'isnum'], {
  reqSource: true,
  numArg: 0,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const c = nnode.src.eval();
    return new Atom(c.type === types.N);
  }
});

R.register('pi', {
  reqSource: false,
  numArg: 0,
  eval() {
    const normalize = v => {
      let carry = 0;
      for(let i = v.length - 1; i > 0; i--) {
        let x = v[i] + carry * (i + 1);
        v[i] = x % (2*i + 1);
        carry = Math.floor(x / (2*i + 1));
      }
      return carry;
    };
    return new Stream(this,
      (function*() {
        const v = [];
        let wait = [];
        for(let j = 0; ; j++) {
          watchdog.utick();
          const w = v.map(() => 0);
          const add = 196;
          for(let i = 0; i < add; i++) {
            v.push(0);
            w.push(2);
          }
          for(let k = 0; k < j * 59; k++) {
            w.forEach((el, ix) => w[ix] *= 10);
            normalize(w);
          }
          v.forEach((el, ix) => v[ix] += w[ix]);
          for(let k = 0; k < 59; k++) {
            v.forEach((el, ix) => v[ix] *= 10);
            v[0] += normalize(v);
            const pre = Math.floor(v[0] / 10);
            v[0] %= 10;
            if(pre < 9) {
              yield* wait.map(x => new Atom(x));
              wait = [pre];
            } else if(pre === 10) {
              yield* wait.map(x => new Atom(x + 1));
              wait = [0];
            } else {
              // pre === 9
              wait.push(pre);
            }
          }
        }
      })(),
      {len: null}
    );
  }
});

function* rnds(seed, min, max) {
  if(max < min)
    throw new StreamError(`maximum ${max} less than minimum ${min}`);
  if(seed === undefined)
    throw new Error('RNG unitialized');
  const rng = new RNG(seed);
  for(;;)
    yield rng.random(min, max);
}

function rnd1(seed, min, max) {
  return rnds(seed, min, max).next().value;
}

R.register(['random', 'rnd', 'sample'], {
  minArg: 0,
  maxArg: 3,
  sourceOrArgs: 2,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src}));
    const nnode = this.modify({src, args,
      meta: scope.seed ? {...this.meta, _seed: scope.seed} : this.meta
    }).check(scope.partial);
    if(scope.partial)
      return nnode;
    if(nnode.args.length === 2) {
      /*** 2-arg: min, max - resolve in prepare() ***/
      const min = nnode.args[0].evalNum();
      const max = nnode.args[1].evalNum();
      return new Atom(rnd1(nnode.meta._seed, min, max));
    } else
      return nnode;
  },
  eval() {
    if(this.args.length === 3) {
      /*** 3-arg: min, max, count ***/
      const min = this.args[0].evalNum();
      const max = this.args[1].evalNum();
      const count = this.args[2].evalNum({min: 1n});
      const gen = rnds(this.meta._seed, min, max);
      return new Stream(this,
        (function*() {
          for(let i = 0n; i < count; i++)
            yield new Atom(gen.next().value);
        })(),
        {count}
      );
    } else {
      let sIn = this.src.evalStream({finite: true});
      let sLen;
      if(typeof sIn.len === 'bigint')
        sLen = sIn.len;
      else {
        sLen = 0n;
        for(const _ of sIn)
          sLen++;
        sIn = this.src.evalStream();
      }
      if(sLen === 0n)
        throw new StreamError('empty stream');
      const gen = rnds(this.meta._seed, 0n, sLen - 1n);
      if(!this.args[0]) {
        /*** 0-arg: one sample from source ***/
        sIn.skip(gen.next().value);
        return sIn.next().value.eval();
      } else {
        /*** 1-arg: source + count ***/
        const count = this.args[0].evalNum({min: 1n});
        if(sLen < MAXMEM) {
          // Memoize
          const data = [...sIn];
          return new Stream(this,
            (function*() {
              for(let i = 0n; i < count; i++)
                yield data[gen.next().value];
            })(),
            {len: count}
          );
        } else {
          // Skip + reinit
          return new Stream(this,
            (function*(self) {
              for(let i = 0n; i < count; i++) {
                const ix = gen.next().value;
                sIn.skip(ix);
                yield sIn.next().value;
                sIn = self.src.evalStream();
              }
            })(this),
            {len: count}
          );
        }
      }
    }
  }
});

R.register(['rndstream', 'rnds'], {
  minArg: 0,
  maxArg: 2,
  sourceOrArgs: 2,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src}));
    const nnode = this.modify({src, args,
      meta: scope.seed ? {...this.meta, _seed: scope.seed} : this.meta
    }).check(scope.partial);
    if(!scope.partial && nnode.args.length === 1)
      throw new StreamError('zero or two arguments required');
    return nnode;
  },
  eval() {
    if(this.args.length === 2) {
      /*** 2-arg: min, max ***/
      const min = this.args[0].evalNum();
      const max = this.args[1].evalNum();
      const gen = rnds(this.meta._seed, min, max);
      return new Stream(this,
        (function*() {
          for(const ix of gen)
            yield new Atom(ix);
        })(),
        {len: null}
      );
    } else {
      /*** 0-arg: source */
      let sIn = this.src.evalStream({finite: true});
      let sLen;
      if(typeof sIn.len === 'bigint')
        sLen = sIn.len;
      else {
        sLen = 0n;
        for(const _ of sIn)
          sLen++;
        sIn = this.src.evalStream();
      }
      if(sLen === 0n)
        throw new StreamError('empty stream');
      const gen = rnds(this.meta._seed, 0n, sLen - 1n);
      if(sLen < MAXMEM) {
        // Memoize
        const data = [...sIn];
        return new Stream(this,
          (function*() {
            for(const ix of gen)
              yield data[ix];
          })(),
          {len: null}
        );
      } else {
        // Skip + reinit
        return new Stream(this,
          (function*(self) {
            for(const ix of gen) {
              sIn.skip(ix);
              yield sIn.next().value;
              sIn = self.src.evalStream();
            }
          })(this),
          {len: null}
        );
      }
    }
  }
});
