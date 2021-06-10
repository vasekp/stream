export class Op {
  constructor(ins = [], meta = {}) {
    this.ins = ins;
    this.meta = meta;
  }

  plug(e, pos = 0) {
    if(this.ins[pos])
      throw 'already set';
    const ins = this.ins.slice();
    ins[pos] = e;
    return new (Object.getPrototypeOf(this).constructor)(ins, this.meta);
  }

  eval(env) {
    throw 'eval undefined';
  }

  desc() {
    throw 'desc undefined';
  }
};

export class Atom extends Op {
  constructor(val, meta = {}) {
    super([], meta);
    if(typeof val === 'number')
      val = BigInt(val);
    Object.defineProperty(this, 'value', { value: val, enumerable: true });
  }

  eval(env) {
    return this;
  }

  desc() {
    switch(typeof this.value) {
      case 'bigint':
      case 'boolean':
        return this.value.toString();
      case 'string':
        return `"${this.value}"`; // TODO: escape "s
      default:
        throw 'desc object';
    }
  }

  toString() {
    return this.desc();
  }
};

export class Stream {
  constructor(src, sink) {
    Object.defineProperty(this, 'src', { get: () => src });
    Object.defineProperty(this, 'sink', { get: () => sink });
  }

  next() {
    throw 'next undefined';
  }

  [Symbol.iterator]() {
    return this;
  }

  len() {
    let l = 0;
    while(!this.next().done)
      len++;
    return len;
  }

  last() {
    let l;
    for(;;) {
      const {value, done} = this.next();
      if(done)
        break;
      l = value;
    }
    if(l === undefined)
      throw 'last called on empty stream';
    else
      return l;
  }

  skip(c) {
    for(const i = 0; i < c; i++)
      this.next();
  }
};

export class InfStream extends Stream {
  next() {
    return { value: this.nextv(), done: false };
  }

  last() {
    throw 'last of infinite';
  }

  len() {
    throw 'len of infinite';
  }
};
