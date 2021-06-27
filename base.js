import {StreamError} from './errors.js';
import watchdog from './watchdog.js';
import Enum from './enum.js';

const DEFLEN = 100;
const DEFTIME = 1000;

export const debug = globalThis.process?.argv?.includes('debug');

export const types = Enum.fromObj({
  N: 'number',
  S: 'string',
  B: 'boolean',
  stream: 'stream',
  symbol: 'symbol',
  expr: 'expression'
});

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

function checkBounds(value, opts = {}) {
  if(opts.min !== undefined && value < opts.min)
    throw new StreamError(`expected ${
      opts.min === 0n ? 'nonnegative'
      : opts.min === 1n ? 'positive'
      : `≥ ${opts.min}`}, got ${value}`);
  if(opts.max !== undefined && value > opts.max)
    throw new StreamError(`value ${value} exceeds maximum ${opts.max}`);
  return value;
}

class Base {
  desc() {
    return this.type ? `${this.type} ${this.toString()}` : this.toString();
  }

  checkType(type) {
    if(type instanceof Array) {
      if(!type.includes(this.type))
        throw new StreamError(`expected ${type.join(' or ')}, got ${this.desc()}`);
    } else
      if(this.type !== type)
        throw new StreamError(`expected ${type}, got ${this.desc()}`);
    // else
    return this;
  }
}

export class Node extends Base {
  constructor(ident, token, src = null, args = [], meta = {}) {
    super();
    this.ident = ident;
    this.token = token;
    this.src = src;
    this.args = args;
    this.meta = meta;
    this.bare = this.src === null && this.args.length === 0;
    this.type = this.bare ? types.symbol : types.expr;
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
            console.log(`${fn} ${this.toString()} ${detail}`);
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
            console.log(`${fn} ${this.toString()} {${Object.keys(scope).join(',')}} => ${nnode.toString()}`);
          return nnode;
        };
      }
    }
  }

  modify(what) {
    if(anyChanged(this, what))
      return new Node(this.ident, coal(what.token, this.token),
        coal(what.src, this.src), coal(what.args, this.args), coal(what.meta, this.meta));
    else
      return this;
  }

  deepModify(what) {
    const src = this.src?.deepModify(what);
    const args = this.args.map(arg => arg.deepModify(what));
    return this.modify({...what, src, args});
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
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src}));
    return this.modify({src: !scope.partial && this.reqSource === false ? null : src, args}).check(scope.partial);
  }

  apply(args) {
    if(debug)
      console.log(`apply ${this.toString()} (bare = ${this.bare}) [${args.map(arg => arg.toString()).join(',')}]`);
    return this.bare ? this.modify({args}).prepare({}) : this.prepare({outer: {args}});
  }

  check(skipCheck = false) {
    if(skipCheck)
      return this;
    if(this.reqSource && !this.src)
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

  eval() {
    throw new Error(`Node.prototype.eval() (${this.toString()})`);
  }

  evalStream(opts = {}) {
    const r = this.eval().checkType(types.stream);
    if(opts.finite && r.len === null)
      throw new StreamError('infinite stream');
    return r;
  }

  evalAtom(type) {
    return this.eval().checkType(type).value;
  }

  evalNum(opts = {}) {
    return checkBounds(this.evalAtom(types.N), opts);
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
      yield str.toString();
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

  timed(func, limit = DEFTIME) {
    try {
      watchdog.start(limit);
      return func(this);
    } finally {
      watchdog.stop();
    }
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

  toString() {
    switch(this.type) {
      case types.N:
      case types.B:
        return this.value.toString();
      case types.S:
        return `"${this.value.replace(/"|"|\\/g, '\\$&')}"`; // " included once confuses Vim
      default:
        throw new Error(`unknown atom type ${typeof this.value}`);
    }
  }

  numValue(opts = {}) {
    return checkBounds(this.checkType(types.N).value, opts);
  }
}

export class Block extends Node {
  constructor(ident, token, body, src = null, args = [], meta = {}) {
    super(ident, token, src, args, meta);
    this.body = body;
  }

  modify(what) {
    if(anyChanged(this, what))
      return new Block(this.ident, coal(what.token, this.token), coal(what.body, this.body),
        coal(what.src, this.src), coal(what.args, this.args), coal(what.meta, this.meta));
    else
      return this;
  }

  prepare(scope) {
    const pnode = this.prepareAll(scope);
    const pbody = this.body.prepare({...scope, outer: {src: pnode.src, args: pnode.args}});
    return scope.partial && !scope.expand ? pnode.modify({body: pbody}) : pbody;
  }

  apply(args) {
    if(this.args.length)
      throw new StreamError(`already has arguments`);
    return this.modify({args}).prepare({});
  }

  toString() {
    let ret = '';
    if(this.src)
      ret = this.src.toString() + '.';
    ret += `{${this.body.toString()}}`;
    if(this.args.length)
      ret += '(' + this.args.map(a => a.toString()).join(',') + ')';
    return ret;
  }
}

export class CustomNode extends Block {
  constructor(ident, token, body, src = null, args = [], meta = {}) {
    super(ident, token, body.deepModify({token}), src, args, meta);
  }

  modify(what) {
    if(anyChanged(this, what))
      return new CustomNode(this.ident, coal(what.token, this.token), coal(what.body, this.body),
        coal(what.src, this.src), coal(what.args, this.args), coal(what.meta, this.meta));
    else
      return this;
  }

  toString() {
    return Node.prototype.toString.call(this);
  }
}

export class Stream extends Base {
  constructor(node, iter, opts) {
    super();
    this.isAtom = false;
    this.node = node;
    this.iter = iter;
    this.type = types.stream;
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

  toString() {
    return this.node.toString();
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
