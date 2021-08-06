import {StreamError, TimeoutError} from './errors.js';
import watchdog from './watchdog.js';
import Enum from './enum.js';
import mainReg from './register.js';

const DEFLEN = 100;
const DESCLEN = 10;
export const MAXMEM = 1000;
export const INF = Symbol('infinite');

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
    const rec = ident ? mainReg.find(this.ident) : null;
    if(rec) {
      this.prepare = this.prepareDefault;
      Object.assign(this, rec);
      if(this.sourceOrArgs !== undefined)
        this.reqSource = this.args.length < this.sourceOrArgs;
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
        this[fn] = (...args) => {
          const nnode = pFn.call(this, ...args);
          if(nnode !== this)
            console.log(`${fn} ${this.toString()} {${Object.keys(args[0]).filter(x => x).join(',')}} => ${nnode.toString()}`);
          return nnode;
        };
      }
      const pEval = this.eval;
      if(pEval) {
        this.eval = _ => {
          const nnode = pEval.call(this);
          if(nnode !== this)
            console.log(`eval ${this.toString()} => ${nnode.desc()}`);
          return nnode;
        };
      }
    }
  }

  modify(what, allowAddSource = this.reqSource) {
    if(anyChanged(this, what))
      return new Node(this.ident, coal(what.token, this.token),
        (this.src || allowAddSource) ? coal(what.src, this.src) : null,
        coal(what.args, this.args), coal(what.meta, this.meta));
    else
      return this;
  }

  prepend(src) {
    return this.modify({src: this.src ? this.src.prepend(src) : src}, true);
  }

  deepModify(what, ...opt) {
    const src = this.src?.deepModify(what, ...opt);
    const args = this.args.map(arg => arg.deepModify(what, ...opt));
    return this.modify({...what, src, args}, ...opt);
  }

  // overwritten in constructor for known symbols
  prepare(scope) {
    if(scope.register) {
      const rec = scope.register.find(this.ident);
      if(rec)
        return new CustomNode(this.ident, this.token, rec.body,
          this.src, this.args, this.meta).prepare(scope);
    } // !scope.register OR record not found
    if(!scope.partial || scope.expand)
      throw new StreamError(`symbol "${this.ident}" undefined`);
    else
      return this;
  }

  prepareBase(scope, srcOpts, argOpts, metaAdd = {}) {
    let src = this.src ? this.src.prepare({...scope, ...srcOpts}) : scope.src;
    const argOptsFn = typeof argOpts === 'function' ? argOpts : _ => argOpts;
    const args = this.args.map((arg, ...aa) => {
      const argsAdd = argOptsFn(arg, ...aa);
      if(argsAdd !== null)
        return arg.prepare({...scope, src, ...argsAdd});
      else
        return arg;
    });
    if(!scope.partial && this.reqSource === false)
      src = null;
    const meta = Object.keys(metaAdd).some(key => metaAdd[key] !== undefined) ? {...this.meta} : this.meta;
    for(const key in metaAdd)
      if(metaAdd[key] !== undefined)
        meta[key] = metaAdd[key];
    return this
      .modify({src, args, meta})
      .check(scope.partial);
  }

  prepareDefault(scope) {
    return this.prepareBase(scope, {}, {});
  }

  prepareForeach(scope) {
    return this.prepareBase(scope, {}, {src: undefined, partial: true});
  }

  prepareFold(scope, evalLast = false) {
    return this.prepareBase(scope, {}, (arg, ix, arr) =>
      evalLast && ix === arr.length - 1 ? {} : {src: undefined, outer: undefined, partial: true}
    );
  }

  apply(args) {
    if(debug)
      console.log(`apply ${this.toString()} (bare = ${this.bare}) [${args.map(arg => arg.toString()).join(',')}]`);
    return this.bare ? this.modify({args}).prepare({}) : this.prepare({outer: {args}});
  }

  applyOver(args) {
    if(this.args.length)
      throw new StreamError(`already has arguments`);
    return this.modify({args}).prepare({});
  }

  check(skipCheck = false) {
    if(skipCheck)
      return this;
    if(this.reqSource && !this.src)
      throw new StreamError(`requires source`);
    if(this.numArg === 0 && this.args.length > 0)
      throw new StreamError(`does not allow arguments`);
    if(this.numArg instanceof Array) {
      if(!this.numArg.includes(this.args.length))
        throw new StreamError(`${this.numArg.join(' or ')} arguments required`);
    } else if(this.numArg !== undefined && this.args.length !== this.numArg)
      throw new StreamError(`exactly ${this.numArg} argument(s) required`);
    if(this.minArg !== undefined && this.args.length < this.minArg)
      throw new StreamError(`at least ${this.minArg} argument(s) required`);
    if(this.maxArg !== undefined && this.args.length > this.maxArg)
      throw new StreamError(`at most ${this.maxArg} argument(s) required`);
    return this;
  }

  eval() {
    return this;
  }

  evalAlphabet(lcase = false) {
    if(!this._cache) {
      this._cache = [...this.evalStream({finite: true}).read()].map(s => s.evalAtom(types.S));
      this._cacheL = this._cache.map(c => c.toLowerCase());
    }
    if(!this._cache.length)
      throw new StreamError('empty alphabet');
    return lcase ? this._cache : this._cacheL;
  }

  evalStream(opts = {}) {
    const r = this.eval().checkType(types.stream);
    if(opts.finite)
      r.checkFinite();
    return r;
  }

  evalAtom(type) {
    return this.eval().checkType(type).value;
  }

  evalNum(opts = {}) {
    return checkBounds(this.evalAtom(types.N), opts);
  }

  toString() {
    return this.inputForm();
  }

  inputForm() {
    let ret = '';
    if(this.src)
      ret = this.src.toString() + '.';
    let bf;
    if(this.bodyForm && (bf = this.bodyForm())) {
      ret += bf;
    } else {
      ret += this.ident;
      if(this.args.length)
        ret += '(' + this.args.map(a => a.toString()).join(',') + ')';
    }
    return ret;
  }

  static operatorForm(sign) {
    return function() {
      if(this.args.length > 1)
        return '(' + this.args.map(n => n.toString()).join(sign) + ')';
      else
        return null;
    }
  }

  *writeout_gen() {
    throw new Error('Node.prototype.writeout_gen()');
  }
}

export class Block extends Node {
  constructor(ident, token, body, src = null, args = [], meta = {}) {
    super(ident, token, src, args, meta);
    this.body = body;
  }

  modify(what, allowAddSource = this.reqSource) {
    if(anyChanged(this, what))
      return new Block(this.ident, coal(what.token, this.token), coal(what.body, this.body),
        (this.src || allowAddSource) ? coal(what.src, this.src) : null,
        coal(what.args, this.args), coal(what.meta, this.meta));
    else
      return this;
  }

  deepModify(what) {
    const src = this.src?.deepModify(what);
    const args = this.args.map(arg => arg.deepModify(what));
    const body = this.body.deepModify(what);
    return this.modify({...what, src, args, body});
  }

  prepare(scope) {
    const pnode = this.prepareDefault(scope);
    const pbody = this.body.prepare({...scope, outer: {
      src: pnode.src || scope.src,
      args: pnode.args,
      partial: scope.partial}});
    return scope.partial ? pnode.modify({body: pbody}) : pbody;
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

  modify(what, allowAddSource = this.reqSource) {
    if(anyChanged(this, what))
      return new CustomNode(this.ident, coal(what.token, this.token), coal(what.body, this.body),
        (this.src || allowAddSource) ? coal(what.src, this.src) : null,
        coal(what.args, this.args), coal(what.meta, this.meta));
    else
      return this;
  }

  prepare(scope) {
    if(scope.expand)
      return new Block(this.ident, this.token, this.body, this.src, this.args, this.meta).prepare(scope);
    else
      return super.prepare(scope);
  }

  toString() {
    return Node.prototype.toString.call(this);
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

  *writeout_gen() {
    yield this.toString();
  }

  static format(v) {
    return (new Atom(v)).toString();
  }
}

function defaultSkip(c) {
  for(let i = 0n; i < c; i++)
    this.next();
}

export class Stream extends Node {
  constructor(node, readFun, length) {
    super(node.ident, node.token, node.src, node.args, node.meta);
    this.isAtom = false;
    this.type = types.stream;
    this.readFun = readFun;
    this.length = length;
  }

  static fromArray(arr) {
    return new Stream(new Node('array', null, null, arr),
      arr.values.bind(arr), BigInt(arr.length));
  }

  read() {
    if(debug)
      console.log(`read ${this.toString()}`);
    const [bareGen, skip] = (_ => {
      const ret = this.readFun();
      if(ret instanceof Array)
        return ret;
      else if(ret.skip)
        return [ret, ret.skip.bind(ret)];
      else
        return [ret, defaultSkip];
    })();
    const self = this;
    const generator = {
      [Symbol.iterator]() {
        return this;
      },

      next() {
        watchdog.tick();
        try {
          return bareGen.next();
        } catch(e) {
          if(e instanceof StreamError)
            throw e.withNode(self);
          else
            throw e;
        }
      }
    }
    generator.skip = skip;
    generator.length = this.length;
    return generator;
  }

  adapt(trf) {
    const generator = this.read();
    const pNext = generator.next.bind(generator);
    generator.next = _ => {
      const ret = pNext();
      if(ret.value)
        ret.value = trf(ret.value);
      return ret;
    };
    return generator;
  }

  desc() {
    if(debug)
      return `stream *${this.toString()}`; // writeout would produce extra output
    else
      return `stream ${this.writeout(DESCLEN)}`;
  }

  checkFinite() {
    if(this.length === INF)
      throw new StreamError('infinite stream');
    return this;
  }

  *writeout_gen() {
    yield '[';
    let first = true;
    try {
      for(const value of this.read()) {
        if(!first)
          yield ',';
        first = false;
        yield* value.writeout_gen();
      }
    } catch(e) {
      if(e instanceof TimeoutError) {
        if(!first)
          yield ',';
        yield '...?';
      } else
        throw e;
    }
    yield ']';
  }
}

export function compareStreams(...args) {
  if(args.every(arg => arg.isAtom)) {
    const vals = args.map(arg => arg.value);
    return vals.every(val => val === vals[0]);
  } else if(args.some(arg => arg.isAtom))
    return false;
  // else
  /* all args confirmed streams now */
  const lens = args.map(arg => arg.length).filter(arg => arg !== undefined);
  if(lens.length > 1 && lens.some(l => l !== lens[0]))
    return false;
  if(lens.some(l => l === INF))
    throw new StreamError('can\'t determine equality');
  const streams = args.map(arg => arg.read());
  for(;;) {
    const rs = streams.map(stm => stm.next());
    if(rs.every(r => r.done))
      return true;
    else if(rs.some(r => r.done))
      return false;
    if(!compareStreams(...rs.map(r => r.value)))
      return false;
  }
}
