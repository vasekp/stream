import {StreamError} from '../errors.js';
import {Node, Atom, Stream, types, compareStreams, MAXMEM} from '../base.js';
import R from '../register.js';
import {catg} from '../help.js';

R.register('array', {
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
  },
  help: {
    en: ['A finite stream made of the arguments. Long form of `[...]`.'],
    cz: ['Konečný proud sestavený z argumentů. Alternativní zápis `[...]`.'],
    cat: [catg.base, catg.sources],
    ex: [['array(1,3,5)', '[1,3,5]']]
  }
});

R.register('foreach', {
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
        for(const r of sIn)
          yield body.prepare({src: r});
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
  },
  help: {
    en: ['Applies `body` on each element of `source`. Long form of `source:body`.'],
    cz: ['Použije `body` na každý prvek `source`. Alternativní zápis `source:body`.'],
    cat: catg.base,
    ex: [['`iota`.foreach(#^2)', '[1,4,9,16,...]'],
      ['`iota`:(#^2) ;short form', '[1,4,9,16,...]']],
    src: 'source',
    args: 'body'
  }
});

R.register('#id', {
  reqSource: true,
  numArg: 0,
  prepare(scope) {
    return this.src?.prepare(scope) || scope.src || this;
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

R.register('join', {
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
  },
  help: {
    en: ['Concatenates all arguments into a stream. Long form of `x~y~...`'],
    cz: ['Naváže všechny argumenty do jednoho proudu. Alternativní zápis `x~y~...`'],
    cat: catg.base,
    ex: [
      ['join([1,2],3,"a",[[]])', '[1,2,3,"a",[]]'],
      ['-1~`iota`', '[-1,1,2,3,4,...]']],
    args: 'x,y,...',
    see: 'plus'
  }
});

R.register('zip', {
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
  },
  help: {
    en: [
      'Reads all arguments concurrently and returns tuples of their elements. Long form of `x%y%...`.',
      'The resulting stream stops when the shortest argument does.'],
    cz: [
      'Čte všechny argumenty souběžně a vrací jejich prvky v n-ticích. Alternativní zápis `x%y%...`.',
      'Délka výstupu odpovídá nejkratšímu z argumentů.'],
    cat: catg.base,
    ex: [['`abc`%`iota`', '[["a",1],["b",2],["c",3],...]'],
      ['zip(iota,`primes`) ;long form', '[[1,2],[2,3],[3,5],[4,7],...]']],
    args: 'x,y,...'
  }
});

function part(src, iter) {
  return (function*() {
    const mem = [];
    const stMem = src.evalStream();
    let stSkip = null;
    let read = 0n;
    for(const ix of iter) {
      if(ix < MAXMEM) {
        if(ix > mem.length)
          for(let i = mem.length; i < ix; i++) {
            const next = stMem.next().value;
            if(!next)
              throw new StreamError(`requested part ${ix} beyond end`);
            mem.push(next);
          }
        yield mem[Number(ix) - 1];
      } else {
        if(!stSkip || ix <= read) {
          stSkip = src.evalStream();
          read = 0n;
        }
        stSkip.skip(ix - read - 1n);
        const next = stSkip.next().value;
        if(!next)
          throw new StreamError(`requested part ${ix} beyond end`);
        yield next;
        read = ix;
      }
    }
  })();
}

R.register('part', {
  reqSource: false,
  minArg: 1,
  eval() {
    const ins = this.args.slice(1).map(arg => arg.eval());
    if(ins.every(i => i.isAtom)) {
      if(ins.length === 1) {
        const sIn = this.args[0].evalStream();
        const ix = ins[0].numValue({min: 1n});
        sIn.skip(ix - 1n);
        const r = sIn.next().value;
        if(!r)
          throw new StreamError(`requested part ${ix} beyond end`);
        return r.eval();
      } else
        return new Stream(this,
          part(this.args[0], ins.map(i => i.numValue({min: 1n}))),
            {len: BigInt(ins.length)});
    } else if(ins.length > 1)
      throw new StreamError('required list of values or a single stream');
    const sPart = ins[0];
    return new Stream(this,
      part(this.args[0], (function*() {
        for(const s of sPart)
          yield s.evalNum({min: 1n});
      })()),
      {
        len: sPart.len,
        skip: sPart.skip
      }
    );
  },
  toString() {
    let ret = '';
    if(this.src)
      ret = this.src.toString() + '.';
    ret += `(${this.args[0].toString()})`;
    ret += '[' + this.args.slice(1).map(a => a.toString()).join(',') + ']';
    return ret;
  },
  help: {
    en: [
      'Returns one or more parts of `_source`. Long form of `_source[...]`.',
      'One or more parts may be given, or a stream.'],
    cz: [
      'Vrátí jeden nebo více prvků `_source`. Alternativní zápis `_source[...]`.',
      'Specifikace může zahrnovat jeden nebo několik indexů, nebo sama být proudem.'],
    cat: catg.base,
    ex: [['`abc`[3] ;returns a single value', '"c"'], ['abc[3,1] ;returns a stream', '["c","a"]'], ['abc[`range`(1,5,2)]', '["a","c","e"]']],
    args: 'source,...'
  }
});

R.register('#in', {
  maxArg: 1,
  prepare(scope) {
    if(scope.outer && !scope.outer.partial) {
      if(this.args[0]) {
        const ix = this.args[0].evalNum({min: 1n, max: scope.outer.args.length});
        return ix <= scope.outer.args.length ? scope.outer.args[Number(ix) - 1] : this;
      } else
        return scope.outer.src || this;
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

R.register('over', {
  reqSource: true,
  minArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare({...scope, partial: true}) : scope.src;
    const args = this.args.map(arg => arg.prepare(scope));
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
          yield body.applyOver(vs);
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
  },
  help: {
    en: ['Reads all arguments concurrently and uses their elements as arguments for `body`. Long form of `body@args`.'],
    cz: ['Čte všechny argumenty souběžně a n-tice jejich prvků používá jako argumenty pro `body`. Alternativní zápis `body@args`.'],
    cat: catg.base,
    ex: [['{#1^#2} @ ([3,4,5], [1,2,3])', '[3,16,125]'],
      ['`range`@range(3)', '[[1],[1,2],[1,2,3]]']],
    src: 'body'
  }
});

R.register('equal', {
  reqSource: false,
  minArg: 2,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(!scope.partial && nnode.args.every(arg => arg.isAtom))
      return new Atom(compareStreams(...nnode.args));
    else
      return nnode;
  },
  eval() {
    return new Atom(compareStreams(...this.args));
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
  },
  help: {
    en: [
      'Compares two or more values for equality. The result is `true` or `false`. Long form of `x=y`.',
      '-Streams can be compared as long as they are finite.'],
    cz: [
      'Testuje rovnost dvou nebo více hodnot. Výsledkem je `true` nebo `false`. Alternativní zápis `x=y`.',
      '-I proudy mohou být porovnávány, pokud jsou konečné.'],
    cat: catg.base,
    ex: [['1=2', 'false'], ['[1,2,3]+1 = [2,3,4]', 'true'],
      ['`range`(3,1) = [] = []~[] = []%[]', 'true'],
      ['equal([],[]) ;long form', 'true']],
    see: 'ineq'
  }
});

R.register('ineq', {
  reqSource: false,
  numArg: 2,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(!scope.partial && nnode.args.every(arg => arg.isAtom))
      return new Atom(!compareStreams(...nnode.args));
    else
      return nnode;
  },
  eval() {
    return new Atom(!compareStreams(...this.args));
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
  },
  help: {
    en: ['Compares two values for inequality. The result is `true` or `false`. Long form of `x<>y`.'],
    cz: ['Testuje nerovnost dvou hodnot. Výsledkem je `true` nebo `false`. Alternativní zápis `x<>y`.'],
    cat: catg.base,
    ex: [['1<>2', 'true'], ['[]<>[[]]', 'true']],
    see: 'equal'
  }
});

R.register('assign', {
  reqSource: false,
  minArg: 2,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.slice();
    if(args.length) {
      const body = args.pop().prepare({...scope, src, partial: true, expand: !scope.partial});
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
    const ret = [];
    for(const ident of idents) {
      reg.register(ident, {body});
      ret.push(new Atom(ident));
    }
    return new Stream(this, ret.values());
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
    return this;
  },
  help: {
    en: [
      'Evaluating this assigns a stream to one or more variables. The new identifiers are returned as a list of strings.',
      '-Any user-defined symbols on the right-hand side are expanded first, so a new variable can refer to its prior assignment, or clearing a variable does not affects ones defined using it.',
      '-The assignments are done in a session-wide register but can be made persistent using `save`.',
      '-Persistent variables are shadowed by temporary variables of the same name.',
      '-Filters can also be assigned to variables. When used, they behave as in a block.'],
    cz: [
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
      ['rot13=##.`shift`(13,`abc`)', '["rot13"]'],
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
