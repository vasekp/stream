export default class History {
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
