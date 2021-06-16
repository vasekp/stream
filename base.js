const MAXLEN = 100;

export class StreamError extends Error {
  constructor(node, msg) {
    super();
    this.node = node;
    this.msg = msg;
  }
}

export class Node {
  constructor(ident, src = null, args = [], meta = {}) {
    this.ident = ident;
    this.src = src;
    this.args = args;
    this.meta = meta;
  }

  prepend(src) {
    if(!src)
      return this;
    if(this.src)
      return new Node(this.ident, this.src.prepend(src), this.args, this.meta);
    else
      return new Node(this.ident, src, this.args, this.meta);
  }

  apply(args) {
    if(this.args.length)
      throw new Error('Node.apply this.args ≠ []');
    else
      return new Node(this.ident, this.src, args, this.meta);
  }

  eval(env) {
    //console.log(`E ${this.desc()}`);
    const rec = env.register.find(this.ident);
    if(!rec)
      throw new StreamError(this, `undefined symbol ${this.ident}`);
    if(rec.source === true && !this.src)
      throw new StreamError(this, `needs source`);
    else if(rec.numArg === 0 && this.args.length > 0)
      throw new StreamError(this, `does not allow arguments`);
    else if(rec.numArg !== undefined && this.args.length !== rec.numArg)
      throw new StreamError(this, `exactly ${rec.numArg} arguments required`);
    else if(rec.minArg !== undefined && this.args.length < rec.minArg)
      throw new StreamError(this, `at least ${rec.minArg} arguments required`);
    else if(rec.maxArg !== undefined && this.args.length > rec.maxArg)
      throw new StreamError(this, `at most ${rec.maxArg} arguments required`);
    try {
      const iter = rec.eval(this, env);
      if(iter instanceof Atom)
        return iter;
      if(!iter.wrapped) {
        const pnext = iter.next.bind(iter);
        iter.next = () => {
          try {
            return pnext();
          } catch(e) {
            if(e instanceof StreamError && !e.node)
              e.node = this;
            throw e;
          }
        };
        iter.wrapped = true;
      }
      if(!iter.skip)
        iter.skip = defaultSkip;
      return iter;
    } catch(e) {
      if(e instanceof StreamError && !e.node)
        e.node = this;
      throw e;
    }
  }

  evalNum(env, opts = {}) {
    const ev = this.eval(env);
    if(!(ev instanceof Atom))
      throw new StreamError(null, `expected number, got stream ${this.desc()}`);
    return checks.num(ev.numValue, opts);
  }

  evalStream(env, opts = {}) {
    const ev = this.eval(env);
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
}

// injection for iterator instrumentation
function defaultSkip(c) {
  for(let i = 0n; i < c; i++)
    this.next();
}

export class Atom extends Node {
  constructor(val, meta = {}) {
    super(null, null, [], meta);
    if(typeof val === 'number')
      val = BigInt(val);
    Object.defineProperty(this, 'value', { value: val, enumerable: true });
    const type = typeof val === 'bigint' ? 'number' : 'string'; // displayed to user
    Object.defineProperty(this, 'type', { value: type, enumerable: true });
  }

  prepend() {
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
  constructor(body, src = null, args = [], meta = {}) {
    super(`{${body.desc()}}`, src, args, meta);
    this.body = body;
  }

  prepend(src) {
    if(!src)
      return this;
    if(this.src)
      return new Block(this.body, this.src.prepend(src), this.args, this.meta);
    else
      return new Block(this.body, src, this.args, this.meta);
  }

  apply(args) {
    if(this.args.length)
      throw new Error('Block.apply this.args ≠ []');
    else
      return new Block(this.body, this.src, args, this.meta);
  }

  eval(env) {
    //console.log(`E ${this.desc()}`);
    const env2 = {...env, ins: [this.src, ...this.args.map(arg => arg.prepend(this.src))], pEnv: env};
    const ret = this.body.eval(env2);
    if(ret instanceof Atom)
      return ret;
    const pnext = ret.next.bind(ret);
    ret.next = () => {
      const {value, done} = pnext();
      if(done)
        return {value, done};
      else
        return value instanceof Atom
          ? {value, done}
          : {value: new Block(value, this.src, this.args, this.meta), done};
    };
    return ret;
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
  }
};
