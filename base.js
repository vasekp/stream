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
      return new Node(this.ident, this.token, src, this.args, this.meta);
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
    if(this.evalIn) {
      const iter = this.evalIn();
      if(!iter.skip)
        iter.skip = defaultSkip;
      return iter;
    } else
      throw new StreamError(this, `symbol ${this.ident} undefined`);
  }

  evalNum(opts = {}) {
    const ev = this.eval();
    if(!(ev instanceof Atom))
      throw new StreamError(null, `expected number, got stream ${this.desc()}`);
    return checks.num(ev.numValue, opts);
  }

  evalStream(opts = {}) {
    const ev = this.eval();
    if(ev instanceof Atom)
      throw new StreamError(null, `expected stream, got ${ev.type} ${ev.desc()}`);
    if(opts.finite && ev.len === null)
      throw new StreamError(null, 'infinite stream');
    return ev;
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
    if(str instanceof Atom)
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

// injection for iterator instrumentation
function defaultSkip(c) {
  for(let i = 0n; i < c; i++)
    this.next();
}

export class Atom extends Node {
  constructor(val, meta = {}) {
    super(null, null, null, [], meta);
    if(typeof val === 'number')
      val = BigInt(val);
    Object.defineProperty(this, 'value', { value: val, enumerable: true });
    const type = typeof val === 'bigint' ? 'number' : 'string'; // displayed to user
    Object.defineProperty(this, 'type', { value: type, enumerable: true });
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

export const mainEnv = {register: mainReg};

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
  stream(node) {
    if(node instanceof Atom)
      throw new StreamError(null, `expected stream, got ${node.type} ${node.desc()}`);
    return node;
  }
};
