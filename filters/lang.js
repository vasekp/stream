import {StreamError} from '../errors.js';
import {Node, Atom, Stream, types, mainReg} from '../base.js';

mainReg.register('array', {
  reqSource: false,
  eval() {
    return new Stream(this,
      this.args.values(),
      {len: BigInt(this.args.length)}
    );
  },
  toString() {
    let ret = '';
    if(this.src)
      ret = this.src.toString() + '.';
    ret += '[';
    ret += this.args.map(n => n.toString()).join(',');
    ret += ']';
    return ret;
  }
});

mainReg.register('foreach', {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const sIn = this.src.evalStream();
    const body = this.args[0].checkType([types.symbol, types.expr]);
    return new Stream(this,
      (function*() {
        for(;;) {
          const {value, done} = sIn.next();
          if(done)
            return;
          else
            yield body.prepare({src: value});
        }
      })(),
      {
        skip: sIn.skip,
        len: sIn.len
      }
    );
  },
  toString() {
    let ret = '';
    if(this.src)
      ret = this.src.toString() + ':';
    else
      ret = 'foreach';
    ret += '(' + this.args.map(a => a.toString()).join(',') + ')';
    return ret;
  }
});

mainReg.register('id', {
  reqSource: true,
  numArg: 0,
  prepare(scope) {
    const pnode = this.prepareAll(scope);
    return scope.partial ? pnode : pnode.src;
  },
  eval() {
    throw new StreamError('out of scope');
  },
  toString() {
    let ret = '';
    if(this.src)
      ret = this.src.toString() + '.';
    ret += '#';
    return ret;
  }
});

mainReg.register('join', {
  reqSource: false,
  eval() {
    const args = this.args.map(arg => arg.eval());
    const lens = args.map(arg => arg.isAtom ? 1n : arg.len);
    const len = lens.some(len => len === undefined) ? undefined
      : lens.some(len => len === null) ? null
      : lens.reduce((a,b) => a+b);
    return new Stream(this,
      (function*() {
        for(const arg of args) {
          if(arg.isAtom)
            yield arg;
          else
            yield* arg;
        }
      })(),
      {len}
    );
  },
  toString() {
    let ret = '';
    if(this.src)
      ret = this.src.toString() + '.';
    if(this.args.length > 0) {
      ret += '(';
      ret += this.args.map(n => n.toString()).join('~');
      ret += ')';
    } else
      ret += 'join()';
    return ret;
  }
});

mainReg.register('zip', {
  reqSource: false,
  eval() {
    const args = this.args.map(arg => arg.evalStream());
    const lens = args.map(arg => arg.len);
    const len = lens.some(len => len === undefined) ? undefined
      : lens.every(len => len === null) ? null
      : lens.filter(len => len !== undefined && len !== null).reduce((a,b) => a < b ? a : b);
    const node = this;
    return new Stream(this,
      (function*() {
        for(;;) {
          const rs = args.map(arg => arg.next());
          if(rs.some(r => r.done))
            break;
          const vs = rs.map(r => r.value);
          yield new Node('array', node.token, null, vs);
        }
      })(),
      {len}
    );
  },
  toString() {
    let ret = '';
    if(this.src)
      ret = this.src.toString() + '.';
    if(this.args.length > 0) {
      ret += '(';
      ret += this.args.map(n => n.toString()).join('%');
      ret += ')';
    } else
      ret += 'zip()';
    return ret;
  }
});

function part(sIn, iter) {
  return (function*() {
    const mem = [];
    for(const ix of iter) {
      if(ix > mem.length)
        for(let i = mem.length; i < ix; i++) {
          const {value, done} = sIn.next();
          if(done)
            throw new StreamError(`requested part ${ix} beyond end`);
          mem.push(value);
        }
      yield mem[Number(ix) - 1];
    }
  })();
}

mainReg.register('part', {
  reqSource: true,
  minArg: 1,
  eval() {
    const sIn = this.src.evalStream();
    const ins = this.args.map(arg => arg.eval());
    if(ins.every(i => i.isAtom)) {
      if(this.args.length === 1) {
        const ix = ins[0].numValue({min: 1n});
        sIn.skip(ix - 1n);
        const {value, done} = sIn.next();
        if(done)
          throw new StreamError(`requested part ${ix} beyond end`);
        return value.eval();
      } else
        return new Stream(this,
          part(sIn, ins.map(i => i.numValue({min: 1n}))),
          {len: BigInt(ins.length)});
    } else if(this.args.length > 1)
      throw new StreamError('required list of values or a single stream');
    return new Stream(this,
      part(sIn, (function*() {
        for(const s of ins[0])
          yield s.evalNum({min: 1n});
      })()),
      {
        len: sIn.len,
        skip: sIn.skip
      }
    );
  },
  toString() {
    let ret = '';
    if(this.src) {
      ret = this.src.toString();
      ret += '[' + this.args.map(a => a.toString()).join(',') + ']';
    } else {
      ret = 'part';
      ret += '(' + this.args.map(a => a.toString()).join(',') + ')';
    }
    return ret;
  }
});

mainReg.register('in', {
  maxArg: 1,
  prepare(scope) {
    this.check(scope.partial)
    if(scope.outer) {
      if(this.args[0]) {
        const ix = this.args[0].evalNum({min: 1n, max: scope.partial ? undefined : scope.outer.args.length});
        return ix <= scope.outer.args.length ? scope.outer.args[Number(ix) - 1] : this;
      } else {
        if(scope.outer.src)
          return scope.outer.src;
        else
          return this;
      }
    } else
      return this;
  },
  eval() {
    throw new StreamError('out of scope');
  },
  toString() {
    let ret = '';
    if(this.src)
      ret = this.src.toString() + '.';
    if(this.args.length === 0)
      ret += '##';
    else if(this.args.length === 1
        && this.args[0].isAtom
        && this.args[0].type === types.N
        && this.args[0].value > 0n)
      ret += '#' + this.args[0].value;
    else {
      ret = 'in';
      ret += '(' + this.args.map(a => a.toString()).join(',') + ')';
    }
    return ret;
  }
});

mainReg.register('over', {
  reqSource: true,
  minArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare({...scope, partial: true}) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const body = this.src.checkType([types.symbol, types.expr]);
    const args = this.args.map(arg => arg.evalStream());
    const lens = args.map(arg => arg.len);
    const len = lens.some(len => len === undefined) ? undefined
      : lens.every(len => len === null) ? null
      : lens.filter(len => len !== undefined && len !== null).reduce((a,b) => a < b ? a : b);
    return new Stream(this,
      (function*() {
        for(;;) {
          const rs = args.map(arg => arg.next());
          if(rs.some(r => r.done))
            break;
          const vs = rs.map(r => r.value);
          yield body.apply(vs);
        }
      })(),
      {len}
    );
  },
  toString() {
    let ret = '';
    if(this.src && this.args.length === 1)
      ret = this.src.toString() + '@'
    else {
      if(this.src)
        ret = this.src.toString() + '.';
      ret += this.ident;
    }
    ret += '(';
    ret += this.args.map(n => n.toString()).join(',');
    ret += ')';
    return ret;
  }
});

function eq(args) {
  const ins = args.map(arg => arg.eval());
  if(ins.every(i => i.isAtom)) {
    const vals = args.map(arg => arg.value);
    return vals.every(val => val === vals[0]);
  } else if(ins.some(i => i.isAtom))
    return false;
  // else
  /* all ins confirmed streams now */
  const lens = ins.map(i => i.len).filter(i => i !== undefined);
  if(lens.length > 1 && lens.some(l => l !== lens[0]))
    return false;
  if(lens.some(l => l === null))
    throw new StreamError('can\'t determine equality');
  for(;;) {
    const rs = ins.map(i => i.next());
    if(rs.every(r => r.done))
      return true;
    else if(rs.some(r => r.done))
      return false;
    if(!eq(rs.map(r => r.value)))
      return false;
  }
}

mainReg.register('equal', {
  reqSource: false,
  minArg: 2,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(nnode.args.every(arg => arg.isAtom))
      return new Atom(eq(nnode.args));
    else
      return nnode;
  },
  eval() {
    return new Atom(eq(this.args));
  },
  toString() {
    let ret = '';
    if(this.src)
      ret = this.src.toString() + '.';
    if(this.args.length > 0) {
      ret += '(';
      ret += this.args.map(n => n.toString()).join('=');
      ret += ')';
    } else
      ret += this.ident;
    return ret;
  },
  toAssign() {
    return new Node('assign', this.token, this.src, this.args, this.meta);
  }
});

mainReg.register('ineq', {
  reqSource: false,
  numArg: 2,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(nnode.args.every(arg => arg.isAtom))
      return new Atom(!eq(nnode.args));
    else
      return nnode;
  },
  eval() {
    return new Atom(!eq(this.args));
  },
  toString() {
    let ret = '';
    if(this.src)
      ret = this.src.toString() + '.';
    if(this.args.length > 0) {
      ret += '(';
      ret += this.args.map(n => n.toString()).join('<>');
      ret += ')';
    } else
      ret += this.ident;
    return ret;
  }
});

mainReg.register('assign', {
  reqSource: false,
  minArg: 2,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.slice();
    if(args.length) {
      const body = args.pop().prepare({...scope, partial: true, expand: true});
      args.forEach(arg => arg.checkType(types.symbol));
      args.push(body);
    }
    const mod = {src: null, args};
    if(scope.register)
      mod.meta = {...this.meta, _register: scope.register};
    return this.modify(mod).check(scope.partial);
  },
  eval() {
    const args = this.args.slice();
    const body = args.pop();
    const idents = args.map(arg => arg.ident);
    const reg = this.meta._register;
    if(!reg)
      throw new StreamError('out of scope');
    for(const ident of idents)
      reg.register(ident, {body});
    return new Atom(body.toString());
  },
  toString() {
    let ret = '';
    if(this.src)
      ret = this.src.toString() + '.';
    if(this.args.length > 0) {
      ret += '(';
      ret += this.args.map(n => n.toString()).join('=');
      ret += ')';
    } else
      ret += this.ident;
    return ret;
  }
});

mainReg.register('history', {
  reqSource: false,
  maxArg: 1,
  prepare(scope) {
    if(scope.history) {
      if(this.args[0]) {
        const ix = this.args[0].evalNum({min: 1n});
        const ret = scope.history.at(Number(ix));
        if(!ret)
          throw new StreamError(`history element ${ix} not found`);
        else
          return ret;
      } else {
        const ret = scope.history.last();
        if(!ret)
          throw new StreamError(`history is empty`);
        else
          return ret;
      }
    } else
      throw new StreamError('out of scope');
  },
  toString() {
    let ret = '';
    if(this.src)
      ret = this.src.toString() + '.';
    if(this.args.length === 0)
      ret += '$';
    else if(this.args.length === 1
        && this.args[0].isAtom
        && this.args[0].type === types.N
        && this.args[0].value > 0n)
      ret += '$' + this.args[0].value;
    else {
      ret = this.ident;
      ret += '(' + this.args.map(a => a.toString()).join(',') + ')';
    }
    return ret;
  }
});
