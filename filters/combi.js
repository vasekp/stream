import {StreamError} from '../errors.js';
import {Node, Atom, Stream, types, debug, compareStreams} from '../base.js';
import watchdog from '../watchdog.js';
import R from '../register.js';
import {catg} from '../help.js';

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
  },
  help: {
    en: ['Factorial of `_n`.'],
    cz: ['Faktoriál čísla `_n`.'],
    cat: catg.numbers,
    src: 'n',
    ex: [['`iota`:factorial', '[1,2,6,24,120,720,...]'],
      ['100.factorial', '9332621544394415268169...']],
    see: 'dfactorial'
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
  },
  help: {
    en: ['Double factorial of `_n`, i.e., `n*(n-2)*...`.'],
    cz: ['Dvojitý faktoriál čísla `_n`, tj. `n*(n-2)*...`.'],
    cat: catg.numbers,
    src: 'n',
    ex: [['`iota`:dfactorial', '[1,2,3,8,15,48,105,...]'],
      ['7*5*3*1', '105']],
    see: 'factorial'
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
  },
  help: {
    en: ['Binomial coefficient `_n` choose `_k`.',
      'If `_k` is not given, lists the entire `_n`-th row.'],
    cz: ['Binomický koeficient `_n` nad `_k`.',
      'Jestliže `_k` není dáno, vypíše celý `_n`-tý řádek.'],
    cat: catg.numbers,
    args: 'n,k?',
    ex: [['binom(6,3)', '20'],
      ['`range`(6).`subsets`(3).`length`', '20'],
      ['binom(6)', '[1,6,15,20,15,6,1]']],
    see: 'comb'
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
  },
  help: {
    en: ['Multinomial coefficient `_k1+_k2+...` choose `_k1`, `_k2`, ...'],
    cz: ['Multinomický koeficient `_k1+_k2+...` nad `_k1`, `_k2`, ...'],
    cat: catg.numbers,
    args: 'k1,k2,...',
    ex: [['comb(2,2,1)', '30'],
      ['`range`(5).`subsets`(2,2).`length`', '30']],
    see: ['binom', 'rcomb']
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
  },
  help: {
    en: ['Similar as `comb(k1,k2,...)` but further divided by factorials of numbers of repetitions between the `_k` values.'],
    cz: ['Podobné `comb(k1,k2,...)`, ale dále vydělené faktoriály počtů opakování mezi hodnotami `_k`.'],
    cat: catg.numbers,
    args: 'k1,k2,...',
    ex: [['rcomb(2,2,1)', '15'],
      ['`range`(5).`subsets`(2,2):`sort`(`first`).`uniq`.`length`', '15']],
    see: 'comb'
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
  },
  help: {
    en: ['1-argument form: `_n`-tuples of values taken from `_source`.',
      'Multi-argument form: tuples where `_i`-th value is taken from the `_i`-th argument.'],
    cz: ['Forma s jedním argumentem: `_n`-tice prvků z proudu `_source`.',
      'Forma s několika argumenty: `_n`-tice, kde `_i`-tý prvek je braný z `_i`-tého argumentu.'],
    cat: catg.streams,
    src: 'source?',
    ex: [['[1,2,3].tuples(2)', '[[1,1],[1,2],[1,3],[2,1],...]'],
      ['tuples([1,2],["a","b"])', '[[1,"a"],[1,"b"],[2,"a"],[2,"b"]]']]
  }
});

function permHelper(src) {
  const ixs = [];
  const counts = [];
  let length = 0;
  let pIx = 0n;
  let product = 1n;
  let curMax = -1;
  let curSeen = undefined;
  let done = false;

  const expand = _ => {
    const next = src.next().value;
    if(next === undefined) {
      done = true;
      return false;
    }
    ixs.push(next);
    length++;
    if(next >= curMax) {
      for(let i = curMax + 1; i <= next; i++)
        counts[i] = 0n;
      curMax = next;
    }
    counts[next]++;
    product = product * BigInt(length) / counts[next];
    curSeen = next;
    return true;
  };

  const advance = _ => {
    let iRev;
    for(iRev = 0; iRev < length - 1; iRev++)
      if(ixs[iRev + 1] > ixs[iRev])
        break;
    iRev++;
    // 0 ... iRev-1 is nonincreasing,
    //   iRev < length: ixs[iRev] > ixs[iRev - 1]
    //   iRev == length: need more input
    if(iRev === length)
      return false; // whole sequence nonincreasing: need more data
    // Now we have: a ≥ b ≥ c ≥ ... ≥ d < (rev)
    // so this always finds swap (breaks loop)
    let iSwap;
    for(iSwap = 0; iSwap < iRev; iSwap++)
      if(ixs[iSwap] < ixs[iRev])
        break;
    // Replace ixs[iRev] by next smaller,
    // sort the prefix
    [ixs[iRev], ixs[iSwap]] = [ixs[iSwap], ixs[iRev]];
    ixs.unshift(...ixs.splice(0, iRev).sort(defSort));
    return true;
  }

  // Load indexes until we have two different values in the array.
  do
    expand();
  while(product === 1n && !done);
  done = false; // Reset done so that the trivial permutation is listed.

  const iter = (function*() {
    for(;;) {
      if(done)
        return;
      watchdog.tick();
      yield ixs;
      if(ixs.length === 0) {
        done = true;
        return;
      }
      let needMore = false;
      // Try advance
      if(!advance())
        needMore = true;
      else if(ixs[length - 1] === curSeen) {
        // advance() was successful, but resulted in a permutation we have already listed
        // (before the newest element was known). This skips all of them.
        ixs.unshift(...ixs.splice(0, length - 1).sort(revSort));
        if(!advance())
          needMore = true;
      }
      if(needMore) {
        // At this point ixs is guaranteed to be nonincreasing.
        // Try expand()
        if(!expand()) {
          return;
        }
        // curSeen, curMax set by expand()
        if(curSeen < curMax) {
          // This means that the permutations we have listed so far are ones whose last index is less
          // than the maximum. As this would put us into a middle of an enumeration, we need to restart
          // with curMax in this position and skip curSeen when we reach it again.
          ixs.sort(defSort);
        } else
          // If the new number matches or exceeds the current maximum, we still need to advance() once.
          // This always succeeds because a nonincreasing sequence followed by a higher number is exactly
          // what advance() expects.
          advance();
      }
      pIx++;
    }
  })();

  iter.skip = c => {
    pIx += c;
    while(pIx >= product)
      if(!expand())
        return;

    const cnts = counts.slice();
    let cnt = BigInt(length);
    let ix = pIx;
    let tot = product;
    for(let i = 0; i < length; i++) {
      let j;
      // The last index is special in case of curSeen < curMax (after the last expand()):
      // permutations ending in curSeen are listed before the rest (and skipped later), e.g.
      //        3 3 7 7 5 4 2 1
      // curSeen↑   ↑curMax
      // "Inner" indices follow an unaltered reverse order.
      // Because we build the new ixs[] from back, the last index is i = 0.
      const order = [...cnts.keys()].reverse();
      if(i === 0)
        order.splice(0, 0, ...order.splice(-(curSeen + 1), 1));
      for(j of order) {
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
        const counts = [];
        let total = 0n;
        len = 1n;
        for(const ix of helperSrc()) {
          total++;
          counts[ix] = (counts[ix] || 0n) + 1n;
          len = len * total / counts[ix];
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
  },
  help: {
    en: ['Lists all distinct permutations of `_source`.',
      '-Also works with infinite streams.'],
    cz: ['Všechny různé permutace proudu `_source.',
      '-Funguje i pro nekonečné proudy.'],
    cat: catg.streams,
    src: 'source',
    ex: [['"abba".`split`.perm:`cat`', '["abba","baba","bbaa","aabb","abab","baab"]'],
      ['`iota`.perm[10^10]', '[14,7,10,9,12,5,1,3,11,4,...]'],
      ['`range`(10).perm.`rnd`', '[3,2,9,6,5,8,1,4,10,7]']]
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

R.register(['subsets', 'ss', 'choose'], {
  reqSource: true,
  eval() {
    if(!this.args[0]) {
      let ix = 0n;
      const src = this.src;
      const token = this.token;
      let sIn = src.evalStream();
      return new Stream(this,
        (function*() {
          for(;;) {
            const ret = [];
            let i = ix;
            for(const r of sIn) {
              if(i & 1n)
                ret.push(r);
              i /= 2n;
              if(i === 0n)
                break;
            }
            if(i !== 0n)
              return;
            yield new Node('array', token, null, ret);
            ix++;
            sIn = src.evalStream();
          }
        })(),
        {
          len: sIn.len === null ? null
            : sIn.len === undefined ? undefined
            : 2n ** sIn.len,
          skip: c => ix += c
        }
      );
    } else {
      const sizes = this.args.map(arg => arg.evalNum({min: 0n}));
      const patt = sizes.flatMap((sz, ix) => Array.from({length: Number(sz)}, _ => ix));
      const out = sizes.length;
      const total = BigInt(patt.length);
      const helperSrc = total
        ? function*() {
            yield* patt;
            for(;;)
              yield out;
          }
        : Array.prototype.values.bind([]);
      const helper = permHelper(helperSrc());
      const src = this.src;
      const token = this.token;
      let sIn = src.evalStream();
      return new Stream(this,
        (function*() {
          for(const arr of helper) {
            const a2 = arr.slice();
            if(a2.length < total)
              a2.push(...patt.slice(a2.length));
            const rets = Array.from({length: out}, _ => []);
            for(const ix of a2) {
              const r = sIn.next().value;
              if(ix === out)
                continue;
              if(!r)
                return;
              rets[ix].push(r);
            }
            yield sizes.length > 1
              ? new Node('array', token, null,
                  rets.map(ret => new Node('array', token, null, ret)))
              : new Node('array', token, null, rets[0]);
            sIn = src.evalStream();
          }
        })(),
        {
          len: sIn.len === null ? null
            : sIn.len === undefined ? undefined
            : sIn.len < total ? 0n
            : comb([...sizes, sIn.len - total]),
          skip: helper.skip
        }
      );
    }
  },
  help: {
    en: ['0-argument form: all possible subsets of `_source`.',
      'One- or multi-argument form: subsets of fixed size(s).',
      '!If the elements of `_source` are not distinct, the listed sets can repeat.'],
    cz: ['Forma bez argumentů: všechny možné podmnožiny `_source`.',
      'Forma s jedním nebo více argumenty: podmnožiny pevné velikosti (či pevných velikostí).',
      '!Pokud prvky `_source` nejsou rozdílné, vypsané množiny se mohou opakovat.'],
    cat: catg.streams,
    src: 'source',
    ex: [['range(3).subsets', '[[],[1],[2],[1,2],[3],[1,3],[2,3],[1,2,3]]'],
      ['range(3).subsets(2)', '[[1,2],[1,3],[2,3]]'],
      ['range(3).subsets(2,1)', '[[[1,2],[3]],[[1,3],[2]],[[2,3],[1]]]']]
  }
});
