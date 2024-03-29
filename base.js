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

export class Node {
  constructor(ident, token, src = null, args = [], meta = {}) {
    this.ident = ident;
    this.token = token;
    this.src = src;
    this.args = args;
    this.meta = meta;
    this.bare = this.src === null && this.args.length === 0;
    this.type = this.bare ? types.symbol : types.expr;
    const rec = ident ? mainReg.get(this.ident) : null;
    if(rec) {
      Object.assign(this, rec);
      this.evalIn = rec.eval;
      this.prepareIn = rec.prepare || this.prepareDefault;
      delete this.eval;
      delete this.prepare;
    }
    if(debug) {
      const pModify = this.modify;
      this.modify = what => {
        const nnode = pModify.call(this, what);
        if(nnode !== this)
          console.log(`modify ${this.toString()} {${Object.keys(what).filter(x => x).join(',')}} => ${nnode.toString()}`);
        return nnode;
      };
      const pPrepare = this.prepare;
      this.prepare = scope => {
        console.log(`prepare ${this.toString()} {${Object.keys(scope).join(',')}}`);
        const nnode = pPrepare.call(this, scope);
        if(nnode !== this)
          console.log(`prepare ${this.toString()} {${Object.keys(scope).filter(x => x).join(',')}} => ${nnode.toString()}`);
        return nnode;
      };
      const pEval = this.eval;
      if(pEval) {
        this.eval = _ => {
          console.log(`eval ${this.toString()}`);
          const nnode = pEval.call(this);
          if(nnode !== this)
            console.log(`eval ${this.toString()} => ${nnode.desc()}`);
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

  prepend(src) {
    return this.modify({src: this.src ? this.src.prepend(src) : src});
  }

  deepModify(what) {
    const src = this.src?.deepModify(what);
    const args = this.args.map(arg => arg.deepModify(what));
    return this.modify({...what, src, args});
  }

  prepare(scope) {
    watchdog.tick();
    return this.prepareIn(scope);
  }

  // overwritten in constructor for known symbols
  prepareIn(scope) {
    if(scope.register) {
      const rec = scope.register.get(this.ident);
      if(rec)
        return new CustomNode(this.ident, this.token, rec.body,
          this.src, this.args, this.meta).prepare(scope);
    } // !scope.register OR record not found
    if(!scope.partial || scope.expand)
      throw new StreamError(`symbol "${this.ident}" undefined`, this);
    else
      return this;
  }

  prepareBase(scope, srcOpts, argOpts, metaAdd = {}) {
    let src = this.src ? this.src.prepare({...scope, ...srcOpts}) : scope.src;
    const argOptsFn = typeof argOpts === 'function' ? argOpts : _ => argOpts;
    const args = this.args.map((arg, ...aa) => {
      const argsAdd = argOptsFn(arg, ...aa);
      if(argsAdd !== null)
        return arg.prepare({argSrc: src, ...scope, ...argsAdd});
      else
        return arg;
    });
    if(!scope.partial && this.reqSource === false)
      src = null;
    const meta = Object.keys(metaAdd).some(key => metaAdd[key] !== undefined) ? {...this.meta} : this.meta;
    for(const key in metaAdd)
      if(metaAdd[key] !== undefined)
        meta[key] = metaAdd[key];
    return this.modify({src, args, meta});
  }

  prepareDefault(scope) {
    return this.prepareBase(scope, {}, {});
  }

  prepareForeach(scope) {
    return this.prepareBase(scope, {}, {argSrc: undefined, partial: true});
  }

  prepareFold(scope, evalLast = false) {
    return this.prepareBase(scope, {}, (arg, ix, arr) =>
      evalLast && ix === arr.length - 1 ? {} : {argSrc: undefined, outer: undefined, partial: true}
    );
  }

  checkThis(srcPromise, argsPromise) {
    const hasSource = this.src || srcPromise;
    const numArgs = this.args.length || argsPromise;
    if(this.reqSource && !hasSource)
      throw new StreamError(`requires source`, this);
    if(this.sourceOrArgs && numArgs < this.sourceOrArgs && !hasSource)
      throw new StreamError(`requires source`, this);
    if(this.numArg === 0 && numArgs > 0)
      throw new StreamError(`does not allow arguments`, this);
    if(this.numArg instanceof Array) {
      if(!this.numArg.includes(numArgs))
        throw new StreamError(`${this.numArg.join(' or ')} arguments required`, this);
    } else if(this.numArg !== undefined && numArgs !== this.numArg)
      throw new StreamError(`exactly ${this.numArg} argument(s) required`, this);
    if(this.minArg !== undefined && numArgs < this.minArg)
      throw new StreamError(`at least ${this.minArg} argument(s) required`, this);
    if(this.maxArg !== undefined && numArgs > this.maxArg)
      throw new StreamError(`at most ${this.maxArg} argument(s) required`, this);
  }

  check(srcPromise = false, argsPromise = 0) {
    this.checkThis(srcPromise, argsPromise);
    this.src?.check();
    this.checkArgs();
  }

  checkArgs() {
    for(const arg of this.args)
      arg.check();
  }

  eval() {
    watchdog.tick();
    return this.evalIn();
  }

  evalAlphabet(lcase = false) {
    if(!this._cache) {
      this._cache = [...this.cast0(this.eval(), types.stream, {finite: true}).read()].map(s => this.cast(s, types.S));
      this._cacheL = this._cache.map(c => c.toLowerCase());
    }
    if(!this._cache.length)
      throw new StreamError('empty alphabet', this);
    return lcase ? this._cache : this._cacheL;
  }

  cast0(obj, type, opts = {}) {
    if(type instanceof Array) {
      if(!type.includes(obj.type))
        throw new StreamError(`expected ${type.join(' or ')}, got ${obj.desc()}`, this);
      else
        return obj;
    } else {
      if(obj.type !== type)
        throw new StreamError(`expected ${type}, got ${obj.desc()}`, this);
      switch(type) {
        case types.stream:
          if(opts.finite && obj.length === INF)
            throw new StreamError('infinite stream', this);
          return obj;
        case types.N:
          this.checkBounds(obj.value, opts);
          return obj;
        default:
          return obj;
      }
    }
  }

  cast(obj, type, opts = {}) {
    return this.cast0(obj, type, opts).value;
  }

  checkBounds(value, opts = {}) {
    if(opts.min !== undefined && value < opts.min)
      throw new StreamError(`expected ${
        opts.min === 0n ? 'nonnegative'
        : opts.min === 1n ? 'positive'
        : `≥ ${opts.min}`}, got ${value}`, this);
    if(opts.max !== undefined && value > opts.max)
      throw new StreamError(`value ${value} exceeds maximum ${opts.max}`, this);
  }

  applySrc(src) {
    return this.src ? this.prepare({argSrc: src}).eval() : this.modify({src}).prepare({}).eval();
  }

  applyArgs(args) {
    if(this.args.length)
      throw new StreamError(`already has arguments`, this);
    return this.modify({args}).prepare({}).eval();
  }

  applyArgsAuto(args) {
    if(debug)
      console.log(`apply ${this.toString()} (bare = ${this.bare}) [${args.map(arg => arg.toString()).join(',')}]`);
    return this.bare ? this.modify({args}).prepare({}).eval() : this.prepare({outer: {args}}).eval();
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

  desc() {
    return this.type ? `${this.type} ${this.toString()}` : this.toString();
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
    throw new Error('Node.prototype.writeout_gen()');
  }

  compareStreams(...args) {
    if(args.every(arg => arg.isImm)) {
      const vals = args.map(arg => arg.value);
      return vals.every(val => val === vals[0]);
    } else if(args.some(arg => arg.isImm))
      return false;
    // else
    /* all args confirmed streams now */
    const lens = args.map(arg => arg.length).filter(arg => arg !== undefined);
    if(lens.length > 1 && lens.some(l => l !== lens[0]))
      return false;
    if(lens.some(l => l === INF))
      throw new StreamError('can\'t determine equality', this);
    const streams = args.map(arg => arg.read());
    for(;;) {
      const rs = streams.map(stm => stm.next());
      if(rs.every(r => r.done))
        return true;
      else if(rs.some(r => r.done))
        return false;
      if(!this.compareStreams(...rs.map(r => r.value)))
        return false;
    }
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

  deepModify(what) {
    const src = this.src?.deepModify(what);
    const args = this.args.map(arg => arg.deepModify(what));
    const body = this.body.deepModify(what);
    return this.modify({...what, src, args, body});
  }

  prepareIn(scope) {
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

  modify(what) {
    if(anyChanged(this, what))
      return new CustomNode(this.ident, coal(what.token, this.token), coal(what.body, this.body),
        coal(what.src, this.src), coal(what.args, this.args), coal(what.meta, this.meta));
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

export class Imm extends Node {
  constructor(val, meta = {}) {
    super(null, null, null, [], meta);
    this.isImm = true;
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
        throw new Error(`unknown imm type ${typeof this.value}`);
    }
  }

  *writeout_gen() {
    yield this.toString();
  }

  static format(v) {
    return (new Imm(v)).toString();
  }
}

function defaultSkip(c) {
  for(let i = 0n; i < c; i++)
    this.next();
}

export class Stream extends Node {
  constructor(node, readFun, length) {
    super(node.ident, node.token, node.src, node.args, node.meta);
    this.isImm = false;
    this.type = types.stream;
    this.readFun = readFun;
    this.length = length;
  }

  static fromArray(arr) {
    return new Stream(new Node('array', null, null, arr),
      arr.values.bind(arr), BigInt(arr.length));
  }

  eval() {
    return this;
  }

  prepare() {
    return this;
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
        return bareGen.next();
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
