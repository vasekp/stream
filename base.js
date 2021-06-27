import {StreamError} from './errors.js';
import watchdog from './watchdog.js';

const DEFLEN = 100;
const DEFTIME = 1000;

function anyChanged(node, what) {
  for(const prop in what) {
    if(prop === 'args')
      continue;
    if(what[prop] === undefined)
      continue;
    if(node[prop] !== what[prop])
      return true;
  }
  if(what.args) {
    if(node.args.length !== what.args.length)
      return true;
    return [...node.args.keys()].some(key => node.args[key] !== what.args[key]);
  } else
    return false;
}

function coal(a, b) {
  return a !== undefined ? a : b;
}

export const debug = globalThis.process?.argv?.includes('debug');

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
      this[fn] = function(...args) {
        try {
          watchdog.tick();
          if(debug && !(this instanceof Atom)) {
            const detail = fn === 'prepare' ? `{${Object.keys(args[0]).join(',')}}` : '';
            console.log(`${fn} ${this.desc()} ${detail}`);
          }
          return pFn.call(this, ...args);
        } catch(e) {
          if(e instanceof StreamError)
            throw e.withNode(this);
          else
            throw e;
        }
      };
    }
    if(debug) {
      for(const fn of ['prepare', 'modify']) {
        const pFn = this[fn];
        this[fn] = scope => {
          const nnode = pFn.call(this, scope);
          if(nnode !== this)
            console.log(`${fn} ${this.desc()} => ${nnode.desc()}`);
          return nnode;
        };
      }
    }
  }

  modify(what) {
    if(anyChanged(this, what))
      return new Node(this.ident, this.token,
        coal(what.src, this.src), coal(what.args, this.args), coal(what.meta, this.meta));
    else
      return this;
  }

  prepare(scope) {
    if(this.known)
      return this.prepareAll(scope);
    else if(scope.register) {
      const rec = scope.register.find(this.ident);
      if(rec)
        return new CustomNode(this.ident, this.token, rec.body,
          this.src, this.args, this.meta).prepare(scope);
    } // !scope.register OR record not found
    throw new StreamError(`symbol "${this.ident}" undefined`);
  }

  prepareAll(scope) {
    const src2 = this.src ? this.src.prepare(scope) : scope.src;
    const args2 = (scope.args || this.args).map(arg => arg.prepare({...scope, src: src2}));
    return this.modify({
      src: this.source !== false ? src2 : null,
      args: args2
    }).check();
  }

  prepareSrc(scope) {
    const src2 = this.src ? this.src.prepare(scope) : scope.src;
    return this.modify({src: src2}).check();
  }

  prepareArgs(scope) {
    const args2 = (scope.args || this.args).map(arg => arg.prepare(scope));
    return this.modify({args: args2}).check();
  }

  check() {
    if(this.source && !this.src)
      throw new StreamError(`requires source`);
    if(this.numArg === 0 && this.args.length > 0)
      throw new StreamError(`does not allow arguments`);
    if(this.numArg !== undefined && this.args.length !== this.numArg)
      throw new StreamError(`exactly ${this.numArg} argument(s) required`);
    if(this.minArg !== undefined && this.args.length < this.minArg)
      throw new StreamError(`at least ${this.minArg} argument(s) required`);
    if(this.maxArg !== undefined && this.args.length > this.maxArg)
      throw new StreamError(`at most ${this.maxArg} argument(s) required`);
    return this;
  }

  apply(args) {
    return this.bare ? this.modify({args}).check() : this.prepare({outer: {args}});
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

  modify() {
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

  modify(what) {
    if(anyChanged(this, what))
      return new Block(this.body, this.token,
        coal(what.src, this.src), coal(what.args, this.args), coal(what.meta, this.meta));
    else
      return this;
  }

  prepare(scope) {
    const pnode = this.prepareAll(scope);
    return this.body.prepare({...scope, outer: {src: pnode.src, args: pnode.args}});
  }
}

export class CustomNode extends Node {
  constructor(ident, token, body, src = null, args = [], meta = {}) {
    super(ident, token, src, args, meta);
    this.body = body;
  }

  modify(what) {
    if(anyChanged(this, what))
      return new CustomNode(this.ident, this.token, coal(what.body, this.body),
        coal(what.src, this.src), coal(what.args, this.args), coal(what.meta, this.meta));
    else
      return this;
  }

  prepare(scope) {
    const pnode = this.prepareAll(scope);
    return this.body.prepare({...scope, outer: {src: pnode.src, args: pnode.args}});
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
      if(e instanceof StreamError)
        throw e.withNode(this.node);
      else
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
