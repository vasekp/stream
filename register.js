import parse from './parser.js';

class Register {
  constructor(parent, init = []) {
    this.parent = parent;
    this.map = new Map();
    for(const [ident, string] of init)
      this.register(ident, {body: parse(string)});
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
      this.map.set(ident, filter);
  }

  find(ident) {
    ident = ident?.toLowerCase();
    return this.map.get(ident) || this.parent?.find(ident);
  }

  includes(ident) {
    ident = ident?.toLowerCase();
    return this.map.has(ident);
  }

  child(init) {
    return new Register(this, init);
  }

  dump() {
    const ret = [];
    for(const [key, node] of this.map)
      ret.push([key, value.body.toString()]);
    return ret;
  }
}

const mainReg = new Register();
export default mainReg;
