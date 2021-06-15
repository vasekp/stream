const MAXLEN = 100;

export class Node {
  constructor(ident, src = null, args = [], meta = {}) {
    this.ident = ident;
    this.src = src;
    this.args = args;
    this.meta = meta;
  }

  withSource(src) {
    if(this.src)
      throw 'already have source';
    else
      return new Node(this.ident, src, this.args, this.meta);
  }

  eval(env) {
    const rec = env.register.find(this.ident);
    if(!rec)
      throw `undefined symbol ${this.ident}`;
    if(rec.source === true && !this.src)
      throw 'needs source';
    else if(rec.source === false && this.src)
      throw 'does not allow source';
    else if(rec.numArg === 0 && this.args.length > 0)
      throw 'does not allow arguments';
    else if(rec.numArg !== undefined && this.args.length !== rec.numArg)
      throw `exactly ${rec.numArg} arguments required`;
    else if(rec.minArg !== undefined && this.args.length < rec.minArg)
      throw `at least ${rec.minArg} arguments required`;
    else if(rec.maxArg !== undefined && this.args.length > rec.maxArg)
      throw `at most ${rec.maxArg} arguments required`;
    return rec.eval(this.src, this.args, env);
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

export class Atom extends Node {
  constructor(val, meta = {}) {
    super(null, null, [], meta);
    if(typeof val === 'number')
      val = BigInt(val);
    Object.defineProperty(this, 'value', { value: val, enumerable: true });
  }

  withSource() {
    throw 'atom.withSource';
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
