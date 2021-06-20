import {Node, Atom, Block, Stream, StreamError, checks, mainReg} from '../base.js';

const S = 'string';

mainReg.register('split', {
  source: true,
  maxArg: 1,
  eval: function() {
    const str = this.src.evalAtom(S);
    if(this.args[0]) {
      const sep = this.args[0].evalAtom(S);
      return new Stream(this,
        (function*() {
          for(const c of str.split(sep))
            yield new Atom(c);
        })()
      );
    } else {
      const chars = [...str];
      return new Stream(this,
        (function*() {
          for(const c of chars)
            yield new Atom(c);
        })(),
        {len: chars.length}
      );
    }
  }
});

mainReg.register('cat', {
  source: true,
  maxArg: 1,
  eval: function() {
    const strs = [...this.src.evalStream()].map(a => a.evalAtom(S));
    const sep = this.args[0] ? this.args[0].evalAtom(S) : '';
    return new Atom(strs.join(sep));
  }
});

mainReg.register('ord', {
  source: true,
  maxArg: 1,
  eval: function() {
    const c = this.src.evalAtom(S);
    if(this.args[0]) {
      const abc = [...this.args[0].evalStream()].map(a => a.evalAtom(S));
      const ix = abc.indexOf(c);
      if(ix < 0)
        throw new StreamError(this, `character "${c}" not in list`);
      else
        return new Atom(ix + 1);
    } else {
      if(c.codePointAt(1) !== undefined)
        throw new StreamError(this, `expected single character, got "${c}"`);
      return new Atom(c.codePointAt(0));
    }
  }
});

mainReg.register('chr', {
  source: true,
  maxArg: 1,
  eval: function() {
    if(this.args[0]) {
      const ix = this.src.evalNum({min: 1n});
      const abc = this.args[0].evalStream();
      abc.skip(ix - 1n);
      const {value, done} = abc.next();
      if(done)
        throw new StreamError(this, `index ${ix} beyond end`);
      else
        return value.eval();
    } else {
      const cp = this.src.evalNum({min: 0n});
      return new Atom(String.fromCodePoint(Number(cp)));
    }
  }
});

mainReg.register('chrm', {
  source: true,
  numArg: 1,
  eval: function() {
    let ix = this.src.evalNum() - 1n;
    const abc = this.args[0].evalStream({finite: true});
    if(typeof abc.len === 'bigint' && abc.len !== 0n) {
      ix %= abc.len;
      if(ix < 0n) ix += abc.len;
      abc.skip(ix);
      const {value} = abc.next();
      return value.eval();
    } else {
      const abcEval = [...abc];
      if(!abcEval.length)
        throw new StreamError(this, 'empty alphabet');
      return abcEval[Number(ix) % abcEval.length].eval();
    }
  }
});

mainReg.register('lcase', {
  source: true,
  numArg: 0,
  eval: function() {
    const str = this.src.evalAtom(S);
    return new Atom(str.toLowerCase());
  }
});

mainReg.register('ucase', {
  source: true,
  numArg: 0,
  eval: function() {
    const str = this.src.evalAtom(S);
    return new Atom(str.toUpperCase());
  }
});

mainReg.register('abc', {
  source: false,
  numArg: 0,
  eval: function() {
    let i = 97;
    return new Stream(this,
      (function*() { while(i < 97+26) yield new Atom(String.fromCharCode(i++)); })(),
      {
        skip: c => i += Number(c),
        len: 26n
      }
    );
  }
});
