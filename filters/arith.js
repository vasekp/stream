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
        return new Atom(is.map(a => a.numValue()).reduce(fun));
      else {
        const lens = is.filter(i => !i.isAtom).map(i => i.len);
        const len = lens.some(len => len === undefined) ? undefined
          : lens.every(len => len === null) ? null
          : lens.filter(len => len !== undefined && len !== null).reduce((a,b) => a < b ? a : b);
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
            len,
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
  prepare: function() {
    const nnode = Node.prototype.prepare.call(this);
    if(nnode.args.length > 0) {
      const ins = nnode.args.map(arg => arg.evalNum());
      const min = ins.reduce((a, b) => b < a ? b : a);
      return new Atom(min);
    } else {
      if(!nnode.src)
        throw new StreamError('requires source');
      const str = nnode.src.evalStream({finite: true});
      const iter = (function*() {
        for(const s of str)
          yield s.evalNum();
      })();
      const {value, done} = iter.next();
      if(done)
        throw new StreamError('empty stream');
      let min = value;
      for(const v of iter)
        if(v < min)
          min = v;
      return new Atom(min);
    }
  }
});

mainReg.register('max', {
  prepare: function() {
    const nnode = Node.prototype.prepare.call(this);
    if(nnode.args.length > 0) {
      const ins = nnode.args.map(arg => arg.evalNum());
      const max = ins.reduce((a, b) => b > a ? b : a);
      return new Atom(max);
    } else {
      if(!nnode.src)
        throw new StreamError('requires source');
      const str = nnode.src.evalStream({finite: true});
      const iter = (function*() {
        for(const s of str)
          yield s.evalNum();
      })();
      const {value, done} = iter.next();
      if(done)
        throw new StreamError('empty stream');
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
  numArg: 0,
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
  numArg: 0,
  eval: function() {
    const sIn = this.src.evalStream();
    return new Stream(this,
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
      })(),
      {
        len: sIn.len === undefined ? undefined
          : sIn.len === null ? null
          : sIn.len === 0n ? 0n
          : sIn.len - 1n
      }
    );
  }
});

mainReg.register('pow', {
  minArg: 1,
  maxArg: 2,
  prepare: function() {
    const nnode = Node.prototype.prepare.call(this);
    if(nnode.args.length === 1) {
      if(!nnode.src)
        throw new StreamError('needs source');
      const base = nnode.src.evalNum();
      const pow = nnode.args[0].evalNum({min: 0n});
      return new Atom(base ** pow);
    } else {
      const base = nnode.args[0].evalNum();
      const pow = nnode.args[1].evalNum({min: 0n});
      return new Atom(base ** pow);
    }
  }
});

mainReg.register('mod', {
  source: true,
  minArg: 1,
  maxArg: 2,
  prepare: function() {
    const nnode = Node.prototype.prepare.call(this);
    const inp = nnode.src.evalNum();
    const mod = nnode.args[0].evalNum({min: 1n});
    const base = nnode.args[1] ? nnode.args[1].evalNum() : 0n;
    const res0 = (inp - base) % mod;
    const res = (res0 >= 0n ? res0 : res0 + mod) + base;
    return new Atom(res);
  }
});

mainReg.register('odd', {
  source: true,
  numArg: 0,
  prepare: function() {
    this.checkArgs(this.src, this.args);
    const src2 = this.src.prepare();
    const val = src2.evalNum();
    return new Atom((val & 1n) === 1n);
  }
});

mainReg.register('even', {
  source: true,
  numArg: 0,
  prepare: function() {
    this.checkArgs(this.src, this.args);
    const src2 = this.src.prepare();
    const val = src2.evalNum();
    return new Atom((val & 1n) === 0n);
  }
});

function regComparer(name, sign, fun) {
  mainReg.register(name, {
    source: false,
    minArg: 2,
    prepare: function() {
      const nnode = Node.prototype.prepare.call(this);
      if(nnode.args.every(arg => arg.isAtom)) {
        const vals = nnode.args.map(arg => arg.numValue());
        let res = true;
        for(let i = 1; i < vals.length; i++)
          res &&= fun(vals[i-1], vals[i]);
        return new Atom(res);
      } else
        return nnode;
    },
    eval: function() {
      throw new StreamError('comparison with stream(s)');
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

regComparer('lt', '<', (a, b) => a < b);
regComparer('gt', '>', (a, b) => a > b);
regComparer('le', '<=', (a, b) => a <= b);
regComparer('ge', '>=', (a, b) => a >= b);

mainReg.register(['tobase', 'tbase'], {
  source: true,
  maxArg: 1,
  prepare: function() {
    const nnode = Node.prototype.prepare.call(this);
    let val = nnode.src.evalNum();
    const base = nnode.args[0] ? nnode.args[0].evalNum({min: 2n, max: 36n}) : 10n;
    const digit = c => c < 10 ? String.fromCharCode(c + 48) : String.fromCharCode(c + 97 - 10);
    let ret = val < 0 ? '-' : val > 0 ? '' : '0';
    if(val < 0)
      val = -val;
    const digits = [];
    while(val) {
      digits.push(val % base);
      val /= base;
    }
    ret += digits.reverse().map(d => digit(Number(d))).join('');
    return new Atom(ret);
  }
});

mainReg.register(['frombase', 'fbase'], {
  source: true,
  maxArg: 1,
  prepare: function() {
    const nnode = Node.prototype.prepare.call(this);
    const str = nnode.src.evalAtom('string');
    const base = nnode.args[0] ? nnode.args[0].evalNum({min: 2n, max: 36n}) : 10n;
    if(!/^-?[0-9a-zA-Z]+$/.test(str))
      throw new StreamError(`invalid input "${str}"`);
    const digit = c => {
      const d = c >= '0' && c <= '9' ? c.charCodeAt('0') - 48
        : c >= 'a' && c <= 'z' ? c.charCodeAt('a') - 97 + 10
        : c.charCodeAt('a') - 65 + 10;
      if(d >= base)
        throw new StreamError(`invalid digit "${c}" for base ${base}`);
      else
        return d;
    };
    const val = str[0] === '-'
      ? -[...str.substring(1)].map(digit).reduce((v, d) => v * base + BigInt(d), 0n)
      : [...str].map(digit).reduce((v, d) => v * base + BigInt(d), 0n);
    return new Atom(val);
  }
});

mainReg.register(['todigits', 'tdig'], {
  source: true,
  maxArg: 1,
  eval: function() {
    let val = this.src.evalNum({min: 0n});
    const base = this.args[0] ? this.args[0].evalNum({min: 2n, max: 36n}) : 10n;
    const digits = [];
    while(val) {
      digits.push(val % base);
      val /= base;
    }
    return new Stream(this,
      digits.reverse().map(d => new Atom(d)).values(),
      {len: digits.length}
    );
  }
});

mainReg.register(['fromdigits', 'fdig'], {
  source: true,
  maxArg: 1,
  eval: function() {
    const sIn = this.src.evalStream({finite: true});
    const base = this.args[0] ? this.args[0].evalNum({min: 2n, max: 36n}) : 10n;
    let val = 0n;
    for(const r of sIn) {
      const digit = r.prepare().evalNum({min: 0n, max: base - 1n});
      val = val * base + digit;
    }
    return new Atom(val);
  }
});
