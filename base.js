const MAXLEN = 100;

export class StreamError extends Error {
  constructor(node, msg) {
    super();
    this.node = node;
    this.msg = msg;
  }
}

export class Node {
  constructor(ident, token, src = null, args = [], meta = {}) {
    this.ident = ident;
    this.token = token;
    this.src = src;
    this.args = args;
    this.meta = meta;
    const rec = mainReg.find(this.ident);
    if(rec)
      Object.assign(this, rec);
    const pEval = this.eval;
    this.eval = () => {
      try {
        return pEval.call(this);
      } catch(e) {
        if(e instanceof StreamError && !e.node)
          e.node = this;
        throw e;
      }
    };
    /* Debug: */
    /*for(const fn of ['withSrc', 'withArgs', 'withEnv', 'prepare']) {
      const pFn = this[fn];
      this[fn] = (...args) => {
        const nnode = pFn.apply(this, args);
        if(nnode !== this)
          console.log(`${fn}: ${this.desc()} => ${nnode.desc()}`);
        return nnode;
      };
    }*/
  }

  withSrc(src) {
    const src2 = this.src ? this.src.withSrc(src) : src;
    if(src2 === this.src)
      return this;
    else
      return new Node(this.ident, this.token, src2, this.args, this.meta);
  }

  withArgs(args) {
    if(this.args.length !== 0)
      throw new Error('already have arguments');
    return new Node(this.ident, this.token, this.src, args, this.meta);
  }

  withEnv(env) {
    const src2 = this.src ? this.src.withEnv(env) : null;
    const args2 = this.args.map(arg => arg.withEnv(env));
    if(src2 === this.src && [...this.args.keys()].every(key => args2[key] === this.args[key]))
      return this;
    else
      return new Node(this.ident, this.token, src2, args2, this.meta);
  }

  prepare() {
    const srcTemp = this.src ? this.src.prepare() : null;
    const args2 = this.args.map(arg => arg.withSrc(srcTemp).prepare());
    const src2 = this.source !== false ? srcTemp : null;
    this.checkArgs(src2, args2);
    if(src2 === this.src && [...this.args.keys()].every(key => args2[key] === this.args[key]))
      return this;
    else
      return new Node(this.ident, this.token, src2, args2, this.meta);
  }

  /* never called directly, convenience for register */
  prepareSrc() {
    const src2 = this.src ? this.src.prepare() : null;
    this.checkArgs(src2, this.args);
    if(src2 === this.src)
      return this;
    else
      return new Node(this.ident, this.token, src2, this.args, this.meta);
  }

  checkArgs(src, args) {
    if(this.source && !src)
      throw new StreamError(this, `requires source`);
    if(this.numArg === 0 && args.length > 0)
      throw new StreamError(this, `does not allow arguments`);
    if(this.numArg !== undefined && args.length !== this.numArg)
      throw new StreamError(this, `exactly ${this.numArg} arguments required`);
    if(this.minArg !== undefined && args.length < this.minArg)
      throw new StreamError(this, `at least ${this.minArg} arguments required`);
    if(this.maxArg !== undefined && args.length > this.maxArg)
      throw new StreamError(this, `at most ${this.maxArg} arguments required`);
  }

  eval() {
    throw new StreamError(this, `symbol ${this.ident} undefined`);
  }

  evalStream(opts = {}) {
    const r = this.eval();
    if(r.isAtom)
      throw new StreamError(null, `expected stream, got ${r.type} ${r.desc()}`);
    if(opts.finite && r.len === null)
      throw new StreamError(null, 'infinite stream');
    return r;
  }

  evalAtom(type) {
    return this.eval().asAtom(type);
  }

  evalNum(opts = {}) {
    return checks.num(this.evalAtom('number'), opts);
  }

  desc() {
    let ret = '';
    if(this.src)
      ret = this.src.desc() + '.';
    ret += this.ident;
    if(this.args.length)
      ret += '(' + this.args.map(a => a.desc()).join(',') + ')';
    return ret;
  }

  get bare() {
    return this.src === null && this.args.length === 0;
  }

  writeout() {
    let d = '';
    for(const s of this.writeout_gen()) {
      d += s;
      if(d.length > MAXLEN) {
        d = d.substring(0, MAXLEN - 3) + '...';
        break;
      }
    }
    return d;
  }

  *writeout_gen() {
    const str = this.eval();
    if(str.isAtom)
      yield str.desc();
    else {
      yield '[';
      let first = true;
      for(const value of str) {
        if(!first)
          yield ',';
        first = false;
        yield* value.writeout_gen();
      }
      yield ']';
    }
  }
}

export class Atom extends Node {
  constructor(val, meta = {}) {
    super(null, null, null, [], meta);
    this.isAtom = true;
    this.value = val = typeof val === 'number' ? BigInt(val) : val;
    this.type = typeof val === 'bigint' ? 'number' : 'string'; // displayed to user
  }

  withSrc() {
    return this;
  }

  withArgs() {
    return this;
  }

  withEnv() {
    return this;
  }

  prepare() {
    return this;
  }

  eval() {
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
        throw new Error(`unknown atom type ${typeof this.value}`);
    }
  }

  asAtom(type) {
    return this.getTyped(type);
  }

  getTyped(type) {
    if(this.type === type)
      return this.value;
    else
      throw new StreamError(null, `expected ${type}, got ${this.type} ${this.desc()}`);
  }

  get numValue() {
    return this.getTyped('number');
  }

  get strValue() {
    return this.getTyped('string');
  }
}

export class Block extends Node {
  constructor(body, token, src = null, args = [], meta = {}) {
    super(`{${body.desc()}}`, token, src, args, meta);
    this.body = body;
  }

  prepare() {
    return this.body.withEnv(this).prepare();
  }

  withSrc(src) {
    const src2 = this.src ? this.src.withSrc(src) : src;
    if(src2 === this.src)
      return this;
    else
      return new Block(this.body, this.token, src, this.args, this.meta);
  }

  withArgs(args) {
    if(this.args.length !== 0)
      throw new Error('already have arguments');
    return new Block(this.body, this.token, this.src, args, this.meta);
  }

  withEnv(env) {
    const src2 = this.src ? this.src.withEnv(env) : null;
    const args2 = this.args.map(arg => arg.withEnv(env));
    if(src2 === this.src && [...this.args.keys()].every(key => args2[key] === this.args[key]))
      return this;
    else
      return new Block(this.body, this.token, src2, args2, this.meta);
  }
}

export class Stream {
  constructor(node, iter, opts) {
    this.isAtom = false;
    this.node = node;
    this.iter = iter;
    Object.assign(this, opts);
  }

  next() {
    try {
      return this.iter.next();
    } catch(e) {
      if(e instanceof StreamError && !e.node)
        e.node = this.node;
      throw e;
    }
  }

  [Symbol.iterator]() {
    return this;
  }

  skip(c) {
    for(let i = 0n; i < c; i++)
      this.next();
  }

  asAtom(type) {
    throw new StreamError(null, `expected ${type}, got stream ${this.node.desc()}`);
  }
}

export class Register {
  constructor(parent) {
    this.parent = parent;
    this.base = parent ? parent.base : this;
    this._map = {};
  }

  register(ident, filter) {
    if(ident instanceof Array) {
      ident.forEach(e => this.register(e, filter));
      return;
    }
    if(this.base.includes(ident))
      throw new StreamError(null, `trying to overwrite base symbol ${ident}`);
    else if(this.includes(ident))
      throw new StreamError(null, `duplicate definition of ${ident}`);
    else
      this._map[ident] = filter;
  }

  find(ident) {
    return this._map[ident] || (this.parent ? this.parent._map[ident] : null);
  }

  includes(ident) {
    return this._map.hasOwnProperty(ident);
  }
}

export const mainReg = new Register();

export const checks = {
  num(value, opts = {}) {
    if(opts.min !== undefined && value < opts.min)
      throw new StreamError(null, `expected ${
        opts.min === 0n ? 'nonnegative'
        : opts.min === 1n ? 'positive'
        : `≥ ${opts.min}`}, got ${value}`);
    if(opts.max !== undefined && value > opts.max)
      throw new StreamError(null, `value ${value} exceeds maximum ${opts.max}`);
    return value;
  },
  stream(r) {
    if(r.isAtom)
      throw new StreamError(null, `expected stream, got ${r.type} ${r.desc()}`);
    return r;
  }
};
