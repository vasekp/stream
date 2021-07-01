import {StreamError} from '../errors.js';
import {Node, Atom, Stream, types, debug, compareStreams} from '../base.js';
import watchdog from '../watchdog.js';
import R from '../register.js';

const defSort = (a, b) => a < b ? -1 : a > b ? +1 : 0;
const revSort = (a, b) => a < b ? +1 : a > b ? -1 : 0;

function fact(n) {
  let ret = 1n;
  for(let i = 1n; i <= n; i++)
    ret *= i;
  return ret;
}

R.register(['factorial', 'fact', 'fac'], {
  reqSource: true,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const inp = nnode.src.evalNum({min: 0n});
    return new Atom(fact(inp));
  }
});

function dfact(n) {
  let ret = 1n;
  for(let i = n; i >= 1n; i -= 2n)
    ret *= i;
  return ret;
}

R.register(['dfactorial', 'dfact', 'dfac'], {
  reqSource: true,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const inp = nnode.src.evalNum({min: -1n});
    return new Atom(dfact(inp));
  }
});

function binom(n, k) {
  if(k > n)
    return 0;
  if(k > n - k)
    k = n - k;
  let ret = 1n;
  for(let i = 0n; i < k; i++)
    ret = ret * (n - i) / (i + 1n);
  return ret;
}

function* binomRow(n) {
  let ret = 1n;
  for(let k = 0n; k <= n; k++) {
    yield ret;
    ret = ret * (n - k) / (k + 1n);
  }
}

R.register('binom', {
  minArg: 1,
  maxArg: 2,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    if(nnode.args.length === 2) {
      const n = nnode.args[0].evalNum({min: 0n});
      const k = nnode.args[1].evalNum({min: 0n});
      return new Atom(binom(n, k));
    } else
      return nnode;
  },
  eval() {
    const n = this.args[0].evalNum({min: 0n});
    return new Stream(this,
      (function*() {
        for(const r of binomRow(n))
          yield new Atom(r);
      })(),
      {len: n}
    );
  }
});

function comb(ks, r = false) {
  ks = ks.slice().sort(revSort);
  const firstK = ks.shift();
  let n = firstK;
  let ret = 1n;
  for(const k of ks)
    for(let i = 1n; i <= k; i++)
      ret = ret * (++n) / i;
  if(!r)
    return ret;
  let lastK = firstK;
  let cnt = 1n;
  for(const k of ks) {
    if(k === 0n)
      break;
    else if(k === lastK)
      ret /= ++cnt;
    else {
      lastK = k;
      cnt = 1n;
    }
  }
  return ret;
}

R.register('comb', {
  minArg: 1,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const ks = nnode.args.map(arg => arg.evalNum({min: 0n}));
    return new Atom(comb(ks));
  }
});

R.register('rcomb', {
  minArg: 1,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const ks = nnode.args.map(arg => arg.evalNum({min: 0n}));
    return new Atom(comb(ks, true));
  }
});

R.register('tuples', {
  minArg: 1,
  sourceOrArgs: 2,
  eval() {
    const args = this.args.length === 1
      ? Array.from(
          {length: Number(this.args[0].evalNum({min: 1n}))},
          _ => this.src
        ).reverse()
      : this.args.slice().reverse();
    const streams = args.map(arg => arg.evalStream());
    const lens = streams.map(s => s.len);
    const ixs = streams.map(_ => 0n);
    const curr = streams.map(s => s.next().value);
    if(curr.some(c => !c))
      return new Stream(this, [].values(), {len: 0n});
    const token = this.token;
    const len = lens.some(len => len === undefined) ? undefined
      : lens.some(len => len === null) ? null
      : lens.reduce((a, b) => a * b);
    let done = false;
    return new Stream(this,
      (function*() {
        for(;;) {
          if(done)
            return;
          yield new Node('array', token, null, curr.slice().reverse());
          let ix;
          for(ix = 0; ix < streams.length; ix++) {
            curr[ix] = streams[ix].next().value;
            ixs[ix]++;
            if(curr[ix])
              break;
          }
          if(ix === streams.length)
            return;
          for(--ix; ix >= 0; ix--) {
            if(lens[ix] === undefined)
              lens[ix] = ixs[ix];
            streams[ix] = args[ix].evalStream();
            curr[ix] = streams[ix].next().value;
            ixs[ix] = 0n;
          }
        }
      })(),
      {
        len,
        skip(c) {
          let ix;
          let inLen = 1n;
          A: for(ix = 0; ix < streams.length; ix++) {
            if(ix > 0) { // carry
              curr[ix] = streams[ix].next().value;
              ixs[ix]++;
              if(!curr[ix]) {
                lens[ix] = ixs[ix];
                inLen *= lens[ix];
                continue A;
              }
            }
            if(lens[ix] !== undefined) {
              if(lens[ix] !== null && c >= (lens[ix] - ixs[ix]) * inLen) {
                c -= (lens[ix] - ixs[ix]) * inLen;
                inLen *= lens[ix];
                continue A;
              } else if(c >= inLen) {
                streams[ix].skip(c / inLen - 1n);
                curr[ix] = streams[ix].next().value;
                ixs[ix] += c / inLen;
                c %= inLen;
              }
              break A;
            } else {
              while(c >= inLen) {
                curr[ix] = streams[ix].next().value;
                ixs[ix]++;
                c -= inLen;
                if(!curr[ix]) {
                  lens[ix] = ixs[ix];
                  inLen *= lens[ix];
                  continue A;
                }
              }
              break A;
            }
          }
          if(ix === streams.length) {
            done = true;
            return;
          }
          // streams[ix] now the last one read, < ix should be reset
          // c < inLen so stream[ix] is at its final index
          for(--ix; ix >= 0; ix--) {
            inLen /= lens[ix];
            streams[ix] = args[ix].evalStream();
            streams[ix].skip(c / inLen);
            ixs[ix] = c / inLen;
            curr[ix] = streams[ix].next().value;
            c %= inLen;
          }
        }
      }
    );
  }
});

function permHelper(src) {
  const ixs = [];
  const lens = [];
  let lenTot = 0n;
  let pIx = 0n;
  let curMax = 1n;
  let done = false;

  const expand = _ => {
    const next = src.next().value;
    if(next === undefined) {
      done = true;
      return false;
    }
    ixs.push(next);
    lenTot++;
    lens[next] = (lens[next] || 0n) + 1n;
    curMax = curMax * lenTot / lens[next];
    return true;
  };

  do
    expand();
  while(curMax === 1n && !done);
  done = false;

  const iter = (function*() {
    for(;;) {
      if(done)
        return;
      watchdog.tick();
      yield ixs;
      if(ixs.length === 0) {
        expand();
        continue;
      }
      let iRev, iSwap;
      for(iRev = 0; iRev < ixs.length - 1; iRev++)
        if(ixs[iRev + 1] > ixs[iRev])
          break;
      if(iRev === ixs.length - 1)
        if(!expand())
          return;
      iRev++;
      for(iSwap = iRev - 1; iSwap >= 0; iSwap--)
        if(ixs[iSwap] >= ixs[iRev])
          break;
      iSwap++;
      [ixs[iRev], ixs[iSwap]] = [ixs[iSwap], ixs[iRev]];
      const a2 = ixs.splice(0, iRev);
      ixs.unshift(...a2.sort(defSort));
      pIx++;
    }
  })();

  iter.skip = c => {
    pIx += c;
    while(pIx >= curMax)
      if(!expand())
        return;

    const cnts = lens.slice();
    let cnt = lenTot;
    let ix = pIx;
    let tot = curMax;
    for(let i = 0; i < ixs.length; i++) {
      let j;
      for(j of [...cnts.keys()].reverse()) {
        if(ix < tot * cnts[j] / cnt)
          break;
        else
          ix -= tot * cnts[j] / cnt;
      }
      tot = tot * cnts[j] / cnt;
      ixs[i] = j;
      cnts[j]--;
      cnt--;
    }
    ixs.reverse();
  };

  return iter;
}

R.register(['perm', 'perms', 'permute'], {
  reqSource: true,
  maxArg: 1,
  eval() {
    if(this.args[0]) {
      const sIn = this.src.evalStream();
      const sArg = this.args[0].evalStream({finite: true});
      const arr = [...sArg].map(arg => Number(arg.evalNum({min: 1n}) - 1n));
      const vals = [];
      for(let i = 0; i < arr.length; i++) {
        vals[i] = sIn.next().value;
        if(!vals[i])
          throw new StreamError(`requested part ${i+1} beyond end`);
        if(!arr.includes(i))
          throw new StreamError('malformed argument list');
      }
      return new Stream(this,
        (function*() {
          for(const ix of arr)
            yield vals[ix];
          yield* sIn;
        })(),
        {
          len: sIn.len
        }
      );
    } else {
      let sIn = this.src.evalStream();
      const vals = [];
      const helperSrc = function*() {
        A: for(const r of sIn) {
          for(const ix of vals.keys())
            if(compareStreams(r, vals[ix])) {
              yield ix;
              continue A;
            }
          // else
          vals.push(r);
          yield vals.length - 1;
        }
      };
      let len;
      if(sIn.len === null)
        len = null;
      else if(sIn.len !== undefined) {
        const lens = [];
        let lenTot = 0n;
        len = 1n;
        for(const ix of helperSrc()) {
          lenTot++;
          lens[ix] = (lens[ix] || 0n) + 1n;
          len = len * lenTot / lens[ix];
        }
        // sIn is consumed, need to reset
        sIn = this.src.evalStream();
      }
      const helper = permHelper(helperSrc());
      const thisSrc = this.src;
      const thisToken = this.token;
      return new Stream(this,
        (function*() {
          for(const arr of helper)
            yield new Node('#permute', thisToken, thisSrc, [],
              {_vals: vals, _arr: arr});
        })(),
        {
          len,
          skip: helper.skip
        }
      );
    }
  }
});

R.register('#permute', {
  reqSource: true,
  eval() {
    const sIn = this.src.evalStream();
    const meta = this.meta;
    return new Stream(this,
      (function*() {
        for(const ix of meta._arr)
          yield meta._vals[ix];
        sIn.skip(BigInt(meta._arr.length));
        yield* sIn;
      })(),
      {
        len: sIn.len
      }
    );
  },
  toString() {
    return this.src
      + '.permute(['
      + this.meta._arr.map(i => i + 1).join(',')
      + '])';
  }
});
