import parse from './parser.js';

class Register extends EventTarget {
  constructor(parent, init = []) {
    super();
    this.parent = parent;
    this.init(init);
  }

  init(init = []) {
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
    if(this !== mainReg && filter.body) {
      const e = new Event('register'); // Node.js does not have CustomEvent
      e.detail = {key: ident, value: filter.body.toString()};
      this.dispatchEvent(e);
    }
  }

  find(ident) {
    ident = ident?.toLowerCase();
    return this.map.get(ident) || this.parent?.find(ident);
  }

  includes(ident) {
    ident = ident?.toLowerCase();
    return this.map.has(ident);
  }

  clear(ident, deep = false) {
    if(this === mainReg)
      return false;
    if(this.map.has(ident)) {
      const e = new Event('register');
      e.detail = {key: ident};
      this.dispatchEvent(e);
      this.map.delete(ident);
      if(deep)
        this.parent.clear(ident, deep);
      return true;
    } else
      return deep ? this.parent.clear(ident, deep) : false;
  }

  child(init) {
    return new Register(this, init);
  }

  dump() {
    const set = new Set();
    for(let reg = this; reg !== mainReg; reg = reg.parent) {
      for(const key of reg.map.keys())
        set.add(key);
    }
    const keys = [...set.keys()].sort();
    const ret = [];
    for(const key of keys)
      ret.push([key, this.find(key).body.toString()]);
    return ret;
  }
}

const mainReg = new Register();
export default mainReg;
