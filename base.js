const MAXLEN = 100;

export class Node {
  constructor(ident) {
    this.ident = ident;
    this.src = null;
    this.args = [];
  }

  construct(reg) {
    const cls = reg.map(this.ident);
    if(!cls)
      throw `ident ${this.ident} not assigned`;
    return cls.construct(this.src, this.args, reg);
  }

  toString() {
    let ret = '';
    if(this.src)
      ret = this.src.toString() + '.';
    ret += this.ident;
    if(this.args.length)
      ret += '(' + this.args.map(a => a.toString()).join(',') + ')';
    return ret;
  }
};

export class Filter {
  constructor(src = null, args = [], meta = {}) {
    this.src = src;
    this.args = args;
    this.meta = meta;
  }

  static construct(src, nargs, reg) {
    return new this(src ? src.construct(reg) : null,
      nargs.map(n => n.construct(reg)),
      {});
  }

  eval(env) {
    throw 'eval undefined';
  }

  desc() {
    throw 'desc undefined';
  }

  check(patt) {
    const c1 = this.src ? 1 : 0;
    const c2 = this.args.length;
    if(c1 < patt[0][0] || c1 > patt[0][1] || c2 < patt[1][0] || c2 > patt[1][1])
      throw `input pattern mismatch: (${c1} ${c2}) not within ${patt}`;
  }

  writeout(env) {
    let d = '';
    for(const s of this.writeout_gen(env)) {
      d += s;
      if(d.length > MAXLEN) {
        d = d.substring(0, MAXLEN - 3) + '...';
        break;
      }
    }
    return d;
  }

  *writeout_gen(env) {
    const str = this.eval(env);
    if(str instanceof Atom)
      yield str.desc();
    else {
      yield '[';
      let first = true;
      for(const value of str) {
        if(!first)
          yield ',';
        first = false;
        yield* value.writeout_gen(env);
      }
      yield ']';
    }
  }
};

export class Atom extends Filter {
  constructor(val, meta = {}) {
    super([], meta);
    if(typeof val === 'number')
      val = BigInt(val);
    Object.defineProperty(this, 'value', { value: val, enumerable: true });
  }

  construct() {
    return this;
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
        return `"${this.value.replace(/"|"|\\/g, '\\$&')}"`; // " included once confuses Vim
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

export class Register {
  constructor(parent) {
    this.parent = parent;
    this.base = parent ? parent.base : this;
    this._map = {};
  }

  register(ident, filter) {
    if(this.base.includes(ident))
      throw `trying to overwrite base symbol ${ident}`;
    else if(this.includes(ident))
      throw `duplicate definition of ${ident}`;
    else
      this._map[ident] = filter;
  }

  map(ident) {
    return this._map[ident] || (this.parent ? this.parent._map[ident] : null);
  }

  includes(ident) {
    return this._map.hasOwnProperty(ident);
  }
};

export const mainReg = new Register();
