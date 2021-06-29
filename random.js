import {StreamError} from './errors.js';
import {Atom} from './base.js';
import mainReg from './register.js';

const modInner = 0x7FFFFFFF;
const modOuter = 1<<24;

export class RNG {
  constructor(seed) {
    this.s = (modInner - seed) || Math.floor(Math.random() * modInner);
  }

  advance() {
    this.s = (this.s * 48271) % modInner;
    return this.s;
  }

  get(ceil = modOuter) {
    return BigInt(this.advance()) % ceil;
  }

  random(min, max) {
    if(max < min)
      throw new StreamError(`maximum ${max} less than minimum ${min}`);
    const diff = max - min;
    if(diff < modOuter)
      return min + this.get(diff + 1n);
    // else
    let order = 0n;
    let last = diff;
    for(let c = diff; c > 0n; c >>= 24n) {
      order++;
      last = c;
    }
    for(;;) {
      let v = this.get(last + 1n);
      for(let i = 1; i < order; i++)
        v = (v << 24n) + this.get(1n << 24n);
      if(v <= diff)
        return min + v;
    }
  }

  fork() {
    return new RNG(this.s);
  }
};

mainReg.register(['random', 'rnd'], {
  minArg: 0,
  maxArg: 2,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src}));
    const nnode = this.modify({src, args,
      meta: scope.rng ? {...this.meta, _rng: scope.rng.fork()} : this.meta
    }).check(scope.partial);
    if(scope.partial)
      return nnode;
    if(!nnode.meta._rng)
      throw new Error('RNG unitialized');
    if(nnode.args.length === 2) {
      const min = nnode.args[0].evalNum();
      const max = nnode.args[1].evalNum();
      return new Atom(nnode.meta._rng.random(min, max));
    } else
      return nnode;
  },
  eval() {
    const arg = this.args[0] || this.src;
    if(!arg)
      throw new StreamError('requires source');
    const sIn = arg.evalStream({finite: true});
    if(typeof sIn.len === 'bigint' && sIn.len !== 0n) {
      const rnd = this.meta._rng.random(0n, sIn.len - 1n);
      sIn.skip(rnd);
      return sIn.next().value.eval();
    } else {
      const vals = [...sIn];
      if(vals.length === 0)
        throw new StreamError('empty stream');
      const ix = random0(BigInt(vals.length));
      return vals[ix].eval();
    }
  }
});
