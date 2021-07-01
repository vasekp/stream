import {StreamError} from '../errors.js';
import {Node, Atom, Stream, types, compareStreams} from '../base.js';
//import watchdog from '../watchdog.js';
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

function permStream(vals, lens, token) {
  const ixs = lens.flatMap((len, ix) => Array.from({length: Number(len)}, _ => ix));
  let pIx = 0n;
  const pMax = comb(lens);
  return new Stream(this,
    (function*() {
      for(;;) {
        if(pIx >= pMax)
          return;
        yield new Node('array', token, null, ixs.map(i => vals[i]));
        let iRev, iSwap;
        for(iRev = ixs.length - 1; iRev > 0; iRev--)
          if(ixs[iRev - 1] < ixs[iRev])
            break;
        if(iRev === 0)
          return;
        iRev--;
        for(iSwap = iRev + 1; iSwap < ixs.length; iSwap++)
          if(ixs[iSwap] <= ixs[iRev])
            break;
        iSwap--;
        [ixs[iRev], ixs[iSwap]] = [ixs[iSwap], ixs[iRev]];
        const a2 = ixs.splice(iRev + 1);
        ixs.push(...a2.sort(defSort));
        pIx++;
      }
    })(),
    {
      skip(c) {
        pIx += c;
        if(pIx >= pMax)
          return;
        const cnts = lens.slice();
        let cnt = cnts.reduce((a, b) => a + b);
        let ix = pIx;
        let tot = pMax;
        for(let i = 0; i < ixs.length; i++) {
          let j;
          for(j of cnts.keys()) {
            if(ix < tot * cnts[j] / cnt)
              break;
            else
              ix -= tot * cnts[j] / cnt;
          }
          //console.log(j, cnts, cnt, ix, tot);
          tot = tot * cnts[j] / cnt;
          ixs[i] = j;
          cnts[j]--;
          cnt--;
        }
      },
      len: pMax
    }
  );
}

R.register(['perm', 'perms'], {
  maxArg: 1,
  eval() {
    const token = this.token;
    if(this.args[0]) {
      const max = this.args[0].evalNum({min: 0n});
      const vals = Array.from({length: Number(max)}, (_, ix) => new Atom(ix + 1));
      const lens = vals.map(_ => 1n);
      return permStream(vals, lens, this.token);
    } else {
      const sIn = this.src.evalStream({finite: true});
      const vals = [];
      const lens = [];
      const map = new Map();
      A: for(const r of sIn) {
        for(const ix of vals.keys())
          if(compareStreams(r, vals[ix])) {
            lens[ix]++;
            continue A;
          }
        // else
        vals.push(r);
        lens.push(1n);
      }
      return permStream(vals, lens, this.token);
    }
  }
});
