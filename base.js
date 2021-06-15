const MAXLEN = 100;

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

  eval(env) {
    //console.log(`E ${this.desc()}`);
    const rec = env.register.find(this.ident);
    if(!rec)
      throw `undefined symbol ${this.ident}`;
    if(rec.source === true && !this.src)
      throw `${this.desc()}: needs source`;
    else if(rec.numArg === 0 && this.args.length > 0)
      throw `${this.desc()}: does not allow arguments`;
    else if(rec.numArg !== undefined && this.args.length !== rec.numArg)
      throw `${this.desc()}: exactly ${rec.numArg} arguments required`;
    else if(rec.minArg !== undefined && this.args.length < rec.minArg)
      throw `${this.desc()}: at least ${rec.minArg} arguments required`;
    else if(rec.maxArg !== undefined && this.args.length > rec.maxArg)
      throw `${this.desc()}: at most ${rec.maxArg} arguments required`;
    const iter = rec.eval(this.src, this.args, env);
    if(!iter.skip)
      iter.skip = defaultSkip;
    return iter;
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
        throw 'desc object';
    }
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

  eval(env) {
    const env2 = {...env, ins: [this.src, ...this.args.map(arg => arg.prepend(this.src))], pEnv: env};
    return this.body.eval(env2);
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
      throw `trying to overwrite base symbol ${ident}`;
    else if(this.includes(ident))
      throw `duplicate definition of ${ident}`;
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
