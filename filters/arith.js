import {Node, Atom, Stream, mainReg, StreamError} from '../base.js';

function regReducer(name, sign, fun) {
  mainReg.register(name, {
    source: false,
    minArg: 2,
    prepare: function() {
      const nnode = Node.prototype.prepare.call(this);
      if(nnode.args.every(arg => arg.isAtom))
        return new Atom(nnode.args.map(arg => arg.numValue()).reduce(fun));
      else
        return nnode;
    },
    eval: function() {
      const is = this.args
        .map(arg => arg.eval());
      if(is.every(i => i.isAtom))
        return new Atom(is.map(a => a.value).reduce(fun));
      else {
        return new Stream(this,
          (function*() {
            for(;;) {
              const vs = [];
              for(const i of is)
                if(i.isAtom)
                  vs.push(i.value);
                else {
                  const {value: r, done} = i.next();
                  if(done)
                    return;
                  vs.push(r.evalNum());
                }
              yield new Atom(vs.reduce(fun));
            }
          }()),
          {
            skip: c => {
              for(const i of is)
                if(!i.isAtom)
                  i.skip(c);
            }
          }
        );
      }
    },
    desc: function() {
      let ret = '';
      if(this.src)
        ret = this.src.desc() + '.';
      if(this.args.length > 0) {
        ret += '(';
        ret += this.args.map(n => n.desc()).join(sign);
        ret += ')';
      } else
        ret += name;
      return ret;
    }
  });
}

regReducer('plus', '+', (a, b) => a + b);
regReducer('minus', '-', (a, b) => a - b);
regReducer('times', '*', (a, b) => a * b);
regReducer('div', '/', (a, b) => a / b);

mainReg.register('min', {
  eval: function() {
    if(this.args.length > 0) {
      const ins = this.args.map(arg => arg.evalNum());
      const min = ins.reduce((a, b) => b < a ? b : a);
      return new Atom(min);
    } else {
      if(!this.src)
        throw new StreamError(this, 'requires source');
      const str = this.src.evalStream({finite: true});
      const iter = (function*() {
        for(const s of str)
          yield s.evalNum();
      })();
      const {value, done} = iter.next();
      if(done)
        throw new StreamError(this, 'empty stream');
      let min = value;
      for(const v of iter)
        if(v < min)
          min = v;
      return new Atom(min);
    }
  }
});

mainReg.register('max', {
  eval: function() {
    if(this.args.length > 0) {
      const ins = this.args.map(arg => arg.evalNum());
      const max = ins.reduce((a, b) => b > a ? b : a);
      return new Atom(max);
    } else {
      if(!this.src)
        throw new StreamError(this, 'requires source');
      const str = this.src.evalStream({finite: true});
      const iter = (function*() {
        for(const s of str)
          yield s.evalNum();
      })();
      const {value, done} = iter.next();
      if(done)
        throw new StreamError(this, 'empty stream');
      let max = value;
      for(const v of iter)
        if(v > max)
          max = v;
      return new Atom(max);
    }
  }
});

mainReg.register(['total', 'tot'], {
  source: true,
  maxArg: 0,
  eval: function() {
    const str = this.src.evalStream({finite: true});
    let tot = 0n;
    for(const s of str)
      tot += s.evalNum();
    return new Atom(tot);
  }
});

mainReg.register('diff', {
  source: true,
  maxArg: 0,
  eval: function() {
    const sIn = this.src.evalStream();
    const ret = new Stream(this,
      (function*() {
        const {value, done} = sIn.next();
        if(done)
          return;
        let prev = value.evalNum();
        for(const next of sIn) {
          const curr = next.evalNum();
          yield new Atom(curr - prev);
          prev = curr;
        }
      })()
    );
    switch(sIn.len) {
      case undefined:
        break;
      case null:
        ret.len = null;
        break;
      case 0n:
        ret.len = 0n;
        break;
      default:
        ret.len = sIn.len - 1n;
        break;
    }
    return ret;
  }
});

mainReg.register('pow', {
  minArg: 1,
  maxArg: 2,
  eval: function() {
    if(this.args.length === 1) {
      if(!this.src)
        throw new StreamError(this, 'needs source');
      const base = this.src.evalNum();
      const pow = this.args[0].evalNum({min: 0n});
      return new Atom(base ** pow);
    } else {
      const base = this.args[0].evalNum();
      const pow = this.args[1].evalNum({min: 0n});
      return new Atom(base ** pow);
    }
  }
});

mainReg.register('mod', {
  source: true,
  minArg: 1,
  maxArg: 2,
  eval: function() {
    const inp = this.src.evalNum();
    const mod = this.args[0].evalNum({min: 1n});
    const base = this.args[1] ? this.args[1].evalNum() : 0n;
    const res0 = (inp - base) % mod;
    const res = (res0 >= 0n ? res0 : res0 + mod) + base;
    return new Atom(res);
  }
});
