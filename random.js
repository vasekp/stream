const modInner = 0x7FFFFFFF;
const modOuter = 1<<24;

export default class RNG {
  constructor(seed) {
    this.s = seed;
  }

  static seed() {
    return Math.floor(Math.random() * modInner);
  }

  advance() {
    this.s = (this.s * 48271) % modInner;
    return this.s;
  }

  get(ceil = modOuter) {
    return BigInt(this.advance()) % ceil;
  }

  random(min, max) {
    const diff = max - min;
    if(diff < 0)
      throw new Error('max < min');
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
};
