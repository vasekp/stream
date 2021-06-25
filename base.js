const DEFLEN = 100;
const DEFTIME = 1000;

export class StreamError extends Error {
  constructor(msg) {
    super();
    this.msg = msg;
  }
}

export class TimeoutError extends Error {
  constructor(count) {
    super();
    this.count = count;
  }
}

export const watchdog = (function() {
  let timeEnd;
  let counter = 0;

  return {
    start: function(limit) {
      if(!timeEnd) {
        timeEnd = Date.now() + limit;
        counter = 0;
      } else
        throw new Error('Watchdog restarted without stopping');
    },

    stop: function() {
      timeEnd = null;
    },

    tick: function() {
      if((counter++ & 0xFFF) === 0) {
        if(!timeEnd)
          throw new Error('Watchdog tick() called without start()');
        if(Date.now() > timeEnd) {
          throw new TimeoutError(counter);
        }
      }
    }
  };
})();

export class Node {
  constructor(ident, token, src = null, args = [], meta = {}) {
    this.ident = ident;
    this.token = token;
    this.src = src;
    this.args = args;
    this.meta = meta;
    const rec = mainReg.find(this.ident);
    if(rec) {
      this.known = true;
      Object.assign(this, rec);
    }
    for(const fn of ['eval', 'prepare']) {
      const pFn = this[fn];
      this[fn] = function() {
        try {
          watchdog.tick();
          return pFn.call(this);
        } catch(e) {
          if(e instanceof StreamError && !e.node)
            e.node = this;
          throw e;
        }
      };
    }
    /* Debug: */
    /*for(const fn of ['withSrc', 'withArgs', 'withScope', 'prepare']) {
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

  withScope(scope) {
    const src2 = this.src ? this.src.withScope(scope) : null;
    const args2 = this.args.map(arg => arg.withScope(scope));
    if(src2 === this.src && [...this.args.keys()].every(key => args2[key] === this.args[key]))
      return this;
    else
      return new Node(this.ident, this.token, src2, args2, this.meta);
  }

  prepare() {
    if(!this.known)
      throw new StreamError(`symbol ${this.ident} undefined`);
    return this.prepareAll();
  }

  prepareAll() {
    const srcTemp = this.src ? this.src.prepare() : null;
    const args2 = this.args.map(arg => arg.withSrc(srcTemp).prepare());
    const src2 = this.source !== false ? srcTemp : null;
    this.checkArgs(src2, args2);
    if(src2 === this.src && [...this.args.keys()].every(key => args2[key] === this.args[key]))
      return this;
    else
      return new Node(this.ident, this.token, src2, args2, this.meta);
  }

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
      throw new StreamError(`requires source`);
    if(this.numArg === 0 && args.length > 0)
      throw new StreamError(`does not allow arguments`);
    if(this.numArg !== undefined && args.length !== this.numArg)
      throw new StreamError(`exactly ${this.numArg} argument(s) required`);
    if(this.minArg !== undefined && args.length < this.minArg)
      throw new StreamError(`at least ${this.minArg} argument(s) required`);
    if(this.maxArg !== undefined && args.length > this.maxArg)
      throw new StreamError(`at most ${this.maxArg} argument(s) required`);
  }

  eval() {
    throw new Error(`Node.prototype.eval()`);
  }

  evalStream(opts = {}) {
    const r = this.eval();
    if(r.isAtom)
      throw new StreamError(`expected stream, got ${r.type} ${r.desc()}`);
    if(opts.finite && r.len === null)
      throw new StreamError('infinite stream');
    return r;
  }

  evalAtom(type) {
    return this.eval().asAtom(type);
  }

  evalNum(opts = {}) {
    return checks.bounds(this.evalAtom('number'), opts);
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

  writeout(maxLen = DEFLEN) {
    let d = '';
    for(const s of this.writeout_gen()) {
      d += s;
      if(d.length > maxLen) {
        d = d.substring(0, maxLen - 3) + '...';
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

  timeConstr(limit = DEFTIME) {
    const ret = {};
    for(const fn of ['eval', 'prepare', 'writeout']) {
      ret[fn] = (...args) => {
        try {
          watchdog.start(limit);
          return this[fn](...args);
        } finally {
          watchdog.stop();
        }
      }
    }
    return ret;
  }
}

export class Atom extends Node {
  constructor(val, meta = {}) {
    super(null, null, null, [], meta);
    this.isAtom = true;
    this.value = val = typeof val === 'number' ? BigInt(val) : val;
    this.type = typeof val === 'bigint' ? 'number' : typeof val; // displayed to user
  }

  withSrc() {
    return this;
  }

  withArgs() {
    return this;
  }

  withScope() {
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
      throw new StreamError(`expected ${type}, got ${this.type} ${this.desc()}`);
  }

  numValue(opts = {}) {
    return checks.bounds(this.getTyped('number'), opts);
  }
}

export class Block extends Node {
  constructor(body, token, src = null, args = [], meta = {}) {
    super(`{${body.desc()}}`, token, src, args, meta);
    this.body = body;
  }

  prepare() {
    return this.body.withScope({block: this}).prepare();
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

  withScope(scope) {
    const src2 = this.src ? this.src.withScope(scope) : null;
    const args2 = this.args.map(arg => arg.withScope(scope));
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
    throw new StreamError(`expected ${type}, got stream ${this.node.desc()}`);
  }
}

export class Register {
  constructor(parent) {
    this.parent = parent;
    this._map = {};
  }

  register(ident, filter) {
    if(ident instanceof Array) {
      ident.forEach(e => this.register(e, filter));
      return;
    }
    ident = ident.toLowerCase();
    if(mainReg.includes(ident))
      throw new StreamError(`trying to overwrite base symbol ${ident}`);
    else if(this.includes(ident))
      throw new StreamError(`duplicate definition of ${ident}`);
    else
      this._map[ident] = filter;
  }

  find(ident) {
    ident = ident?.toLowerCase();
    return this._map[ident] || this.parent?._map[ident];
  }

  includes(ident) {
    ident = ident?.toLowerCase();
    return this._map.hasOwnProperty(ident);
  }
}

export const mainReg = new Register();

export class History {
  constructor() {
    this._hist = [];
  }

  add(node) {
    this._hist.push(node);
    return this._hist.length;
  }

  clear() {
    this._hist = [];
  }

  at(id) {
    if(id <= 0 || id > this._hist.length)
      return null;
    else
      return this._hist[id - 1];
  }

  last() {
    if(!this._hist.length)
      return null;
    else
      return this._hist[this._hist.length - 1];
  }
};

export const checks = {
  bounds(value, opts = {}) {
    if(opts.min !== undefined && value < opts.min)
      throw new StreamError(`expected ${
        opts.min === 0n ? 'nonnegative'
        : opts.min === 1n ? 'positive'
        : `≥ ${opts.min}`}, got ${value}`);
    if(opts.max !== undefined && value > opts.max)
      throw new StreamError(`value ${value} exceeds maximum ${opts.max}`);
    return value;
  },
  atom(r, type) {
    if(!r.isAtom)
      throw new StreamError(`expected ${type}, got stream ${r.node.desc()}`);
    if(r.type !== type)
      throw new StreamError(`expected ${type}, got ${r.type} ${r.value}`);
    return r;
  },
  num(r, opts = {}) {
    checks.atom(r, 'number');
    checks.bounds(r.value, opts);
    return r;
  },
  stream(r) {
    if(r.isAtom)
      throw new StreamError(`expected stream, got ${r.type} ${r.desc()}`);
    return r;
  }
};
