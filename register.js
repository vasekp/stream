import parse from './parser.js';
import {StreamError} from './errors.js';

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

  register(idents, obj, aliases = [idents]) {
    if(idents instanceof Array) {
      idents.forEach(ident => this.register(ident, obj, idents));
      return;
    }
    // else: idents is a single string
    const ident = idents.toLowerCase();
    // by now, aliases is set correctly
    if(!obj.aliases)
      obj.aliases = aliases;
    if(mainReg.includes(ident)) {
      if(this === mainReg)
        throw new Error(`symbol ${ident} defined twice`);
      else
        return false;
    }
    this.map.set(ident, obj);
    if(this !== mainReg && obj.body) {
      const e = new Event('register'); // Node.js does not have CustomEvent
      e.detail = {key: ident, value: obj.body.toString()};
      this.dispatchEvent(e);
    }
    return true;
  }

  get(ident) {
    ident = ident?.toLowerCase();
    return this.map.get(ident) || this.parent?.get(ident);
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
      ret.push([key, this.get(key).body.toString()]);
    return ret;
  }

  [Symbol.iterator]() {
    return this.map[Symbol.iterator]();
  }
}

const mainReg = new Register();
export default mainReg;
