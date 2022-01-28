import {StreamError} from '../errors.js';
import {Node, Imm, Stream, types, INF, MAXMEM} from '../base.js';
import R from '../register.js';
import {catg} from '../help.js';

R.register('array', {
  reqSource: false,
  eval() {
    return Stream.fromArray(this.args.map(arg => arg.eval()));
  },
  bodyForm() {
    return '[' + this.args.map(n => n.toString()).join(',') + ']';
  },
  help: {
    en: ['A finite stream made of the arguments. Long form of `[...]`.'],
    cs: ['Konečný proud sestavený z argumentů. Alternativní zápis `[...]`.'],
    cat: [catg.base, catg.sources],
    ex: [['array(1,3,5)', '[1,3,5]']]
  }
});

R.register('foreach', {
  reqSource: true,
  numArg: 1,
  prepare: Node.prototype.prepareForeach,
  checkArgs(srcPromise) {
    this.args[0].check(true);
  },
  eval() {
    const src = this.cast0(this.src.eval(), types.stream);
    const body = this.cast0(this.args[0], [types.symbol, types.expr]);
    return new Stream(this,
      _ => {
        const gen = src.read();
        return [
          (function*() {
            for(const r of gen)
              yield body.applySrc(r);
          })(),
          c => gen.skip(c)
        ];
      },
      src.length
    );
  },
  inputForm() {
    if(this.src) {
      let ret = this.src.toString() + ':';
      ret += '(' + this.args.map(a => a.toString()).join(',') + ')';
      return ret;
    } else
      return Node.prototype.inputForm.call(this);
  },
  help: {
    en: ['Applies `body` on each element of `source`. Long form of `source:body`.'],
    cs: ['Použije `body` na každý prvek `source`. Alternativní zápis `source:body`.'],
    cat: catg.base,
    ex: [['iota.foreach(#^2)', '[1,4,9,16,...]'],
      ['iota:power(2)', '[1,4,9,16,...]', {en: 'short form', cs: 'zkrácená forma'}]],
    src: 'source',
    args: 'body'
  }
});

R.register('#id', {
  reqSource: false,
  numArg: 0,
  prepare(scope) {
    if(scope.argSrc)
      return scope.argSrc;
    else
      return this;
  },
  eval() {
    throw new StreamError('out of scope', this);
  },
  bodyForm() {
    return '#';
  }
});

R.register('join', {
  reqSource: false,
  eval() {
    const args = this.args.map(arg => arg.eval());
    const lens = args.map(arg => arg.isImm ? 1n : arg.length);
    const length = lens.some(len => len === undefined) ? undefined
      : lens.some(len => len === INF) ? INF
      : lens.reduce((a,b) => a+b);
    const gen = function*() {
      for(const arg of args) {
        if(arg.isImm)
          yield arg;
        else
          yield* arg.read();
      }
    };
    if(length !== undefined && length !== INF && length < MAXMEM)
      return Stream.fromArray([...gen()]);
    else
      return new Stream(this, gen, length);
  },
  bodyForm() {
    if(this.args.length > 1)
      return '(' + this.args.map(n => n.toString()).join('~') + ')';
    else
      return null;
  },
  help: {
    en: ['Concatenates all arguments into a stream. Long form of `x~y~...`'],
    cs: ['Naváže všechny argumenty do jednoho proudu. Alternativní zápis `x~y~...`'],
    cat: catg.base,
    ex: [
      ['join([1,2],3,"a",[[]])', '[1,2,3,"a",[]]'],
      ['-1~iota', '[-1,1,2,3,4,...]']],
    args: 'x,y,...',
    see: 'plus'
  }
});

R.register('zip', {
  reqSource: false,
  eval() {
    const args = this.args.map(arg => this.cast0(arg.eval(), types.stream));
    const lens = args.map(arg => arg.length);
    const length = lens.some(len => len === undefined) ? undefined
      : lens.every(len => len === INF) ? INF
      : lens.filter(len => len !== INF).reduce((a,b) => a < b ? a : b);
    return new Stream(this,
      _ => {
        const ins = args.map(arg => arg.read());
        return [
          (function*() {
            for(;;) {
              const vals = ins.map(inp => inp.next().value);
              if(vals.some(val => !val))
                break;
              yield Stream.fromArray(vals);
            }
          })(),
          c => ins.forEach(inp => inp.skip(c))
        ];
      },
      length
    );
  },
  bodyForm() {
    if(this.args.length > 1)
      return '(' + this.args.map(n => n.toString()).join('%') + ')';
    else
      return null;
  },
  help: {
    en: [
      'Reads all arguments concurrently and returns tuples of their elements. Long form of `x%y%...`.',
      'The resulting stream stops when the shortest argument does.'],
    cs: [
      'Čte všechny argumenty souběžně a vrací jejich prvky v n-ticích. Alternativní zápis `x%y%...`.',
      'Délka výstupu odpovídá nejkratšímu z argumentů.'],
    cat: catg.base,
    ex: [['abc%iota', '[["a",1],["b",2],["c",3],...]'],
      ['zip(iota,primes)', '[[1,2],[2,3],[3,5],[4,7],...]', {en: 'long form', cs: 'textová forma'}]],
    args: 'x,y,...'
  }
});

R.register('part', {
  reqSource: true,
  eval() {
    const args = this.args.map(arg => arg.eval());
    const src = this.cast0(this.src.eval(), types.stream);
    if(args.every(i => i.isImm)) {
      if(args.length === 1) {
        const ix = this.cast(args[0], types.N);
        if(ix > 0n) {
          const stm = src.read();
          stm.skip(ix - 1n);
          const r = stm.next().value;
          if(r)
            return r;
          else
            throw new StreamError(`requested part ${ix} beyond end`, this);
        } else if(ix < 0n) {
          this.cast0(src, types.stream, {finite: true});
          const nix = -ix;
          const stm = src.read();
          if(src.length === undefined) {
            const mem = [];
            for(const v of stm) {
              console.log(v);
              mem.push(v);
              if(mem.length > nix)
                mem.shift();
            }
            if(mem.length == nix)
              return mem[0];
            else
              throw new StreamError(`requested part ${ix} beyond end`, this);
          } else {
            if(src.length >= nix) {
              stm.skip(src.length - nix);
              return stm.next().value;
            } else
              throw new StreamError(`requested part ${ix} beyond end`, this);
          }
        } else
          throw new StreamError(`requested part 0`, this);
      } else
        return Stream.fromArray([...this._impl(src, args.map(arg => this.cast(arg, types.N)))]);
    } else if(args.length === 1) {
      const sParts = args[0];
      return new Stream(this,
        _ => {
          const rParts = sParts.adapt(val => this.cast(val, types.N));
          return [
            this._impl(src, rParts),
            c => rParts.skip(c)
          ];
        },
        sParts.length
      );
    } else
      throw new StreamError('required list of values or a single stream', this);
  },
  *_impl(src, gen) {
    const mem = [];
    const stMem = src.read();
    let stSkip = null;
    let read = 0n;
    let sLen = src.length;
    for(const ix of gen) {
      if(ix === 0n)
        throw new StreamError(`requested part 0`, this);
      else if(ix < 0n) {
        this.cast0(src, types.stream, {finite: true});
        const nix = -ix;
        if(sLen === undefined) {
          stSkip = src.read();
          read = 0n;
          const temp = [];
          for(const v of stSkip) {
            temp.push(v);
            if(temp.length > sLen)
              temp.shift();
            read++;
          }
          if(read < nix)
            throw new StreamError(`requested part ${ix} beyond end`, this);
          sLen = read;
          yield temp[read - nix];
        } else if(sLen < MAXMEM) {
          if(nix > sLen)
            throw new StreamError(`requested part ${ix} beyond end`, this);
          for(let i = mem.length; i <= sLen - nix; i++)
            mem.push(stMem.next().value);
          yield mem[sLen - nix];
        } else {
          if(!stSkip || sLen - nix <= read) {
            stSkip = src.read();
            read = 0n;
          }
          stSkip.skip(sLen - nix - read - 1n);
          yield stSkip.next().value;
          read = sLen - nix;
        }
      } else if(ix < MAXMEM) {
        if(ix > mem.length)
          for(let i = mem.length; i < ix; i++) {
            const next = stMem.next().value;
            if(!next)
              throw new StreamError(`requested part ${ix} beyond end`, this);
            mem.push(next);
          }
        yield mem[Number(ix) - 1];
      } else {
        if(!stSkip || ix <= read) {
          stSkip = src.read();
          read = 0n;
        }
        stSkip.skip(ix - read - 1n);
        const next = stSkip.next().value;
        if(!next)
          throw new StreamError(`requested part ${ix} beyond end`, this);
        yield next;
        read = ix;
      }
    }
  },
  inputForm() {
    if(this.src) {
      let ret = this.src.toString();
      ret += '[' + this.args.map(a => a.toString()).join(',') + ']';
      return ret;
    } else
      return Node.prototype.inputForm.call(this);
  },
  help: {
    en: [
      'Returns one or more parts of `_source`. Long form of `_source[_parts]`.',
      'One or more parts may be given, or a stream.',
      '-Part specifications may be negative, in that case they are counted from the end.'],
    cs: [
      'Vrátí jeden nebo více prvků `_source`. Alternativní zápis `_source[_parts]`.',
      'Specifikace může zahrnovat jeden nebo několik indexů, nebo sama být proudem.',
      '-Požadované indexy mohou být i záporné, v takovém případě se počítají od konce proudu.'],
    cat: catg.base,
    ex: [['abc[3]', '"c"', {en: 'returns a single value', cs: 'vrací jednu hodnotu'}],
      ['abc[3,1]', '["c","a"]', {en: 'returns a stream', cs: 'vrací proud'}],
      ['abc[range(1,5,2)]', '["a","c","e"]'],
      ['abc[-3]', '"x"']],
    src: 'source',
    args: 'parts...'
  }
});

R.register('#in', {
  maxArg: 1,
  prepare(scope) {
    if(scope.outer && !scope.outer.partial) {
      if(this.args[0]) {
        const ix = this.cast(this.args[0].eval(), types.N, {min: 1n, max: scope.outer.args.length});
        return ix <= scope.outer.args.length ? scope.outer.args[Number(ix) - 1] : this;
      } else
        return scope.outer.src || this;
    } else
      return this;
  },
  eval() {
    throw new StreamError('out of scope', this);
  },
  bodyForm() {
    if(this.args[0])
      return '#' + this.args[0].value;
    else
      return '##';
  }
});

R.register('over', {
  reqSource: true,
  minArg: 1,
  prepare(scope) {
    return this.prepareBase(scope, {partial: true}, {src: scope.src});
  },
  check(srcPromise = false, argsPromise = 0) {
    this.checkThis(srcPromise, argsPromise);
    this.src.check(false, this.args.length);
    this.checkArgs();
  },
  eval() {
    const body = this.cast0(this.src, [types.symbol, types.expr]);
    const args = this.args.map(arg => this.cast0(arg.eval(), types.stream));
    const lens = args.map(arg => arg.length);
    const length = lens.some(len => len === undefined) ? undefined
      : lens.every(len => len === INF) ? INF
      : lens.filter(len => len !== INF).reduce((a,b) => a < b ? a : b);
    return new Stream(this,
      _ => {
        const ins = args.map(arg => arg.read());
        return [
          (function*() {
            for(;;) {
              const vals = ins.map(inp => inp.next().value);
              if(vals.some(val => !val))
                break;
              yield body.applyArgs(vals);
            }
          })(),
          c => ins.forEach(inp => inp.skip(c))
        ];
      },
      length
    );
  },
  inputForm() {
    let ret = '';
    if(this.src && this.args.length === 1) {
      ret = this.src.toString() + '@'
      ret += '(' + this.args.map(n => n.toString()).join(',') + ')';
      return ret;
    } else
      return Node.prototype.inputForm.call(this);
  },
  help: {
    en: ['Reads all arguments concurrently and uses their elements as arguments for `body`. Long form of `body@args`.'],
    cs: ['Čte všechny argumenty souběžně a n-tice jejich prvků používá jako argumenty pro `body`. Alternativní zápis `body@args`.'],
    cat: catg.base,
    ex: [['{#1^#2} @ ([3,4,5], [1,2,3])', '[3,16,125]'],
      ['range@range(3)', '[[1],[1,2],[1,2,3]]']],
    src: 'body'
  }
});

R.register('equal', {
  reqSource: false,
  minArg: 2,
  eval() {
    return new Imm(this.compareStreams(...this.args.map(arg => arg.eval())));
  },
  bodyForm() {
    if(this.args.length > 1)
      return '(' + this.args.map(n => n.toString()).join('==') + ')';
    else
      return null;
  },
  toAssign() {
    return new Node('assign', this.token, this.src, this.args, this.meta);
  },
  help: {
    en: [
      'Compares two or more values for equality. The result is `true` or `false`. Long form of `x=y`.',
      '-Streams can be compared as long as they are finite.'],
    cs: [
      'Testuje rovnost dvou nebo více hodnot. Výsledkem je `true` nebo `false`. Alternativní zápis `x=y`.',
      '-I proudy mohou být porovnávány, pokud jsou konečné.'],
    cat: catg.base,
    ex: [['1=2', 'false'], ['[1,2,3]+1 = [2,3,4]', 'true'],
      ['range(3,1) = [] = []~[] = []%[]', 'true'],
      ['equal([],[])', 'true', {en: 'long form', cs: 'textová forma'}]],
    see: 'ineq'
  }
});

R.register('ineq', {
  reqSource: false,
  numArg: 2,
  eval() {
    return new Imm(!this.compareStreams(...this.args.map(arg => arg.eval())));
  },
  bodyForm() {
    if(this.args.length > 1)
      return '(' + this.args.map(n => n.toString()).join('<>') + ')';
    else
      return null;
  },
  help: {
    en: ['Compares two values for inequality. The result is `true` or `false`. Long form of `x<>y`.'],
    cs: ['Testuje nerovnost dvou hodnot. Výsledkem je `true` nebo `false`. Alternativní zápis `x<>y`.'],
    cat: catg.base,
    ex: [['1<>2', 'true'], ['[]<>[[]]', 'true']],
    see: 'equal'
  }
});

R.register('assign', {
  reqSource: false,
  minArg: 2,
  prepare(scope) {
    if(!scope.partial && scope.referrer !== this)
      throw new StreamError('cannot appear here', this);
    return this.prepareBase(scope, {},
      (arg, ix, arr) => {
        if(ix === arr.length - 1) // body
          return {partial: true, expand: !scope.partial};
        else // identifiers
          return null;
      },
      {_register: scope.register});
  },
  eval() {
    const args = this.args.slice();
    const body = args.pop();
    const idents = args.map(arg => this.cast0(arg, types.symbol).ident);
    const reg = this.meta._register;
    if(!reg)
      throw new Error('register not set');
    const ret = [];
    for(const ident of idents) {
      if(!reg.register(ident, {body}))
        throw new StreamError(`cannot overwrite symbol "${ident}"`, this);
      ret.push(new Imm(ident));
    }
    return Stream.fromArray(ret);
  },
  bodyForm() {
    if(this.args.length > 1)
      return '(' + this.args.map(n => n.toString()).join('=') + ')';
    else
      return null;
  },
  toAssign() {
    return this;
  },
  help: {
    en: [
      'Evaluating this assigns a stream to one or more variables. The new identifiers are returned as a list of strings.',
      '-Any user-defined symbols on the right-hand side are expanded first, so a new variable can refer to its prior assignment, or clearing a variable does not affects ones defined using it.',
      '-The assignments are done in a session-wide register but can be made persistent using `save`.',
      '-Persistent variables are shadowed by temporary variables of the same name.',
      '-Filters can also be assigned to variables. When used, they behave as in a block.'],
    cs: [
      'Vyhodnocení výrazu `assign` přiřadí hodnotu jedné nebo více proměnným. Nové identifikátory jsou navráceny jako seznam řetězců.',
      '-Jakékoli uživatelské proměnné použité na pravé straně přiřazení jsou nejprve dosazeny, takže proměnná může být definována pomocí předchozí hodnoty stejného symbolu, také vymazání jednoho symbolu neovlivní jiné.',
      '-Proměnné jsou uloženy v dočasném registru. Uložit je napříč sezeními je možno pomocí `save`.',
      '-Dočasné proměnné zastiňují stejnojmenné trvalé proměnné.',
      '-Do proměnné mohou být uloženy i filtry. Ty se pak chovají stejně jako v bloku.'],
    cat: catg.base,
    ex: [['a=b=10', '["a","b"]'],
      ['a=a^2', '["a"]'],
      ['[a,b]', '[100,10]'],
      ['c=c', '!symbol "c" undefined'],
      ['rot13=##.shift(13,abc)', '["rot13"]'],
      ['"grfg".rot13', '"test"']],
    args: 'vars..., value',
    see: ['save', 'clear', 'vars']
  }
});

R.register('#history', {
  reqSource: false,
  maxArg: 1,
  prepare(scope) {
    if(scope.history) {
      if(this.args[0]) {
        const ix = this.cast(this.args[0].eval(), types.N, {min: 1n});
        const ret = scope.history.at(Number(ix));
        if(!ret)
          throw new StreamError(`history element ${ix} not found`, this);
        else
          return ret.prepare(scope);
      } else {
        const ret = scope.history.last();
        if(!ret)
          throw new StreamError(`history is empty`, this);
        else
          return ret.prepare(scope);
      }
    } else
      throw new Error('initial prepare without scope.history');
  },
  bodyForm() {
    if(this.args[0])
      return '$' + this.args[0].value;
    else
      return '$';
  }
});
