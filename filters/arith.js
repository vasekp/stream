import {Node, Atom, mainReg, StreamError} from '../base.js';

function regReducer(name, sign, fun) {
  mainReg.register(name, {
    source: false,
    minArg: 2,
    eval: function() {
      const is = this.args
        .map(arg => arg.eval())
        .map(st => st instanceof Atom ? st.numValue : st);
      if(is.every(i => typeof i === 'bigint'))
        return new Atom(is.reduce(fun));
      else {
        const iter = (function*() {
          for(;;) {
            const vs = [];
            for(const i of is)
              if(typeof i === 'bigint')
                vs.push(i);
              else {
                const {value: r, done} = i.next();
                if(done)
                  return;
                vs.push(r.evalNum());
              }
            yield new Atom(vs.reduce(fun));
          }
        }());
        iter.skip = c => {
          for(const i of is)
            if(typeof i !== 'bigint')
              i.skip(c);
        };
        return iter;
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
        throw new StreamError(null, 'requires source');
      const str = this.src.evalStream({finite: true});
      const iter = (function*() {
        for(const s of str)
          yield s.evalNum();
      })();
      const {value, done} = iter.next();
      if(done)
        throw new StreamError(null, 'empty stream');
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
        throw new StreamError(null, 'requires source');
      const str = this.src.evalStream({finite: true});
      const iter = (function*() {
        for(const s of str)
          yield s.evalNum();
      })();
      const {value, done} = iter.next();
      if(done)
        throw new StreamError(null, 'empty stream');
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
    const iter = (function*() {
      const {value, done} = sIn.next();
      if(done)
        return;
      let prev = value.evalNum();
      for(const next of sIn) {
        const curr = next.evalNum();
        yield new Atom(curr - prev);
        prev = curr;
      }
    })();
    switch(sIn.len) {
      case undefined:
        break;
      case null:
        iter.len = null;
        break;
      case 0n:
        iter.len = 0n;
        break;
      default:
        iter.len = sIn.len - 1n;
        break;
    }
    return iter;
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
