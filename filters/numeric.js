import {StreamError} from '../errors.js';
import {Node, Atom, Stream, types, MAXMEM} from '../base.js';
import watchdog from '../watchdog.js';
import R from '../register.js';
import RNG from '../random.js';
import {catg} from '../help.js';

function regReducer(name, sign, fun, type, help) {
  R.register(name, {
    reqSource: false,
    minArg: 2,
    prepare(scope) {
      const nnode = this.prepareAll(scope);
      if(!scope.partial && nnode.args.every(arg => arg.isAtom))
        return new Atom(nnode.args.map(arg => arg.checkType(type).value).reduce(fun));
      else
        return nnode;
    },
    eval() {
      const is = this.args
        .map(arg => arg.eval());
      if(is.every(i => i.isAtom))
        return new Atom(is.map(a => a.checkType(type).value).reduce(fun));
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
                  const r = i.next().value;
                  if(!r)
                    return;
                  vs.push(r.evalAtom(type));
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
    toString() {
      let ret = '';
      if(this.src)
        ret = this.src.toString() + '.';
      if(this.args.length > 0) {
        ret += '(';
        ret += this.args.map(n => n.toString()).join(sign);
        ret += ')';
      } else
        ret += name;
      return ret;
    },
    help
  });
}

regReducer('plus', '+',
  (a, b) => {
    if(typeof a !== typeof b)
      throw new StreamError(`${Atom.format(a)} and ${Atom.format(b)} have different types`);
    else
      return a + b;
  },
  [types.N, types.S],
  {
    en: ['Adds numbers or concatenates strings. Long form of `x+y+...`.',
      'If any of the arguments are streams, they are processed element by element.'],
    cz: ['Sčítá čísla nebo navazuje řetězce. Alternativní zápis `x+y+...`.',
      'Jestliže některé z argumentů jsou proudy, zpracovává je prvek po prvku.'],
    cat: [catg.numbers, catg.streams],
    ex: [['1+2+3', '6'],
      ['"a"+"b"+"c"', '"abc"'],
      ['[1,2,3]+4', '[5,6,7]'],
      ['[10,20,30]+[1,2,3,4,5] ;shortest argument defines the length of output', '[11,22,33]'],
      ['[1,2,[3,4]]+5 ;unpacking works only to first level', '!expected number or string, got stream [3,4]'],
      ['`iota`.`fold`(plus) ;long form used as an operand (also see `accum`)', '[1,3,6,10,15,...]']],
    see: ['add', 'minus', 'accum', 'total']
  }
);

regReducer('minus', '-', (a, b) => a - b, types.N, {
  en: ['Subtracts second and higher arguments from first. Long form of `x-y-...`.',
    'If any of the arguments are streams, they are processed element by element.'],
  cz: ['Odečítá od prvního argumentu všechny následující. Alternativní zápis `x-y-...`.',
    'Jestliže některé z argumentů jsou proudy, zpracovává je prvek po prvku.'],
  cat: catg.numbers,
  ex: [['1-2-3', '-4'],
    ['[1,2,3]-4', '[-3,-2,-1]'],
    ['[10,20,30]-[1,2,3,4,5] ;shortest argument defines the length of output', '[9,18,27]'],
    ['[1,2,[3,4]]-5 ;unpacking works only to first level', '!expected number or string, got stream [3,4]'],
    ['1.`repeat`.`fold`(minus) ;long form used as an operand', '[[1,0,-1,-2,-3,...]']],
  see: ['plus', 'diff']
});

regReducer('times', '*', (a, b) => a * b, types.N, {
  en: ['Multiplies its arguments. Long form of `x*y*...`.',
    'If any of the arguments are streams, they are processed element by element.'],
  cz: ['Násobí své argumenty. Alternativní zápis `x*y*...`.',
    'Jestliže některé z argumentů jsou proudy, zpracovává je prvek po prvku.'],
  cat: catg.numbers,
  ex: [['1*2*3', '6'],
    ['[1,2,3]*4', '[4,8,12]'],
    ['[10,20,30]*[1,2,3,4,5] ;shortest argument defines the length of output', '[10,40,90]'],
    ['[1,2,[3,4]]*5 ;unpacking works only to first level', '!expected number or string, got stream [3,4]'],
    ['range(7).`reduce`(times) ;long form used as an operand (also see `product`, `factorial`', '5040']],
  see: ['div', 'product']
});

regReducer('div', '/',
  (a, b) => {
    if(b === 0n)
      throw new StreamError('division by zero');
    else
      return a / b
  },
  types.N,
  {
    en: ['Divides its first argument by all the others. Long form of `x/y/...`.',
      'If any of the arguments are streams, they are processed element by element.',
      '!All numbers in Stream are integers. Fractional part is lost.'],
    cz: ['Dělí první argument všemi následujícími. Alternativní zápis `x/y/...`.',
      'Jestliže některé z argumentů jsou proudy, zpracovává je prvek po prvku.',
      '!Všechna čísla v jazyce Stream jsou celá. Zlomková část je zahozena.'],
    cat: catg.numbers,
    ex: [['12/2/3', '2'],
      ['[4,5,6]/2', '[2,2,3]'],
      ['[10,20,30]/[1,2,3,4,5] ;shortest argument defines the length of output', '[10,10,10]'],
      ['[1,2,[3,4]]/5 ;unpacking works only to first level', '!expected number or string, got stream [3,4]'],
      ['1/0', '!division by zero']],
    see: ['times', 'mod', 'divmod']
  });

regReducer('and', '&', (a, b) => a && b, types.B, {
  en: ['Takes a logical conjunction of its arguments, i.e., `true` only if all of them are `true`. Long form of `x&y&...`.',
    'If any of the arguments are streams, they are processed element by element.'],
  cz: ['Počítá logický součin svých argumentů, tj. `true` právě tehdy, pokud všechny jsou `true`. Alternativní zápis `x&y&...`.',
    'Jestliže některé z argumentů jsou proudy, zpracovává je prvek po prvku.'],
  cat: catg.numbers,
  ex: [['`range`(10).`select`(#.odd & #<6)', '[1,3,5]']],
  see: ['or', 'not', 'every']
});

regReducer('or', '|', (a, b) => a || b, types.B, {
  en: ['Takes a logical disjunction of its arguments, i.e., `true` only if at least one of them is `true`. Long form of `x|y|...`.',
    'If any of the arguments are streams, they are processed element by element.'],
  cz: ['Počítá logický součet svých argumentů, tj. `true` právě tehdy, pokud alespoň jeden z nich je `true`. Alternativní zápis `x|y|...`.',
    'Jestliže některé z argumentů jsou proudy, zpracovává je prvek po prvku.'],
  cat: catg.numbers,
  ex: [['`range`(10).`select`(#.odd | #<6)', '[1,2,3,4,5,7,9]']],
  see: ['and', 'not', 'some']
});

function regReducerS(name, fun, numOpts, help) {
  R.register(name, {
    sourceOrArgs: 1,
    prepare(scope) {
      const nnode = this.prepareAll(scope);
      if(scope.partial)
        return nnode;
      if(nnode.args.length > 0) {
        const ins = nnode.args.map(arg => arg.evalNum());
        const res = ins.reduce(fun);
        return new Atom(res);
      } else {
        const sIn = nnode.src.evalStream({finite: true});
        let res = null;
        for(const s of sIn) {
          const curr = s.evalNum(numOpts);
          res = res === null ? curr : fun(res, curr);
        }
        if(res === null)
          throw new StreamError('empty stream');
        return new Atom(res);
      }
    },
    help
  });
}

function gcd(a, b) {
  for(;;) {
    a %= b;
    if(a === 0n)
      return b;
    b %= a;
    if(b === 0n)
      return a;
  }
}

regReducerS('min', (a, b) => b < a ? b : a); // TODO
regReducerS('max', (a, b) => b > a ? b : a); // TODO

regReducerS('gcd', gcd, {min: 1n}, {
  en: ['Calculates the greatest common divisor of its arguments (if given) or the input stream.'],
  cz: ['Najde největšího společného dělitele svých argumentů (jestliže nějaké má) nebo vstupního proudu.'],
  cat: catg.numbers,
  src: 'stream?',
  args: 'list?',
  ex: [['`range`(4,8,2).gcd ;input stream', '2'],
    ['gcd(100,125,145) ;arguments', '5']],
  see: 'lcm'
});

regReducerS('lcm', (a, b) => a * (b / gcd(a, b)), {min: 1n}, {
  en: ['Calculates the least common multiplier of its arguments (if given) or the input stream.'],
  cz: ['Najde nejmenší společný násobek svých argumentů (jestliže nějaké má) nebo vstupního proudu.'],
  cat: catg.numbers,
  src: 'stream?',
  args: 'list?',
  ex: [['`range`(4,8,2).lcm ;input stream', '24'],
    ['lcm(10,12,15) ;arguments', '60']],
  see: 'gcd'
});

R.register(['accum', 'acc', 'ac'], {
  reqSource: true,
  numArg: 0,
  eval() {
    const sIn = this.src.evalStream();
    return new Stream(this,
      (function*() {
        let sum = 0n;
        for(const next of sIn) {
          sum += next.evalNum();
          yield new Atom(sum);
        }
      })(),
      {len: sIn.len}
    );
  },
  help: {
    en: ['Calculates the running total of the input stream.'],
    cz: ['Postupně přičítá hodnoty ze vstupního proudu.'],
    cat: [catg.streams, catg.numbers],
    ex: [['`range`(5).accum', '[1,3,6,10,15]']]
  }
});

R.register(['total', 'tot', 'sum'], {
  reqSource: true,
  numArg: 0,
  eval() {
    const str = this.src.evalStream({finite: true});
    let tot = 0n;
    for(const s of str)
      tot += s.evalNum();
    return new Atom(tot);
  },
  help: {
    en: ['Calculates the total of the input stream.'],
    cz: ['Součet celého vstupního proudu.'],
    cat: catg.numbers,
    ex: [['`range`(5).total', '15']]
  }
});

R.register('diff', {
  reqSource: true,
  numArg: 0,
  eval() {
    const sIn = this.src.evalStream();
    return new Stream(this,
      (function*() {
        let prev = null;
        for(const next of sIn) {
          const curr = next.evalNum();
          if(prev === null) {
            prev = curr;
            continue;
          }
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
  },
  help: {
    en: ['Returns the differences of consecutive elements of the input stream.'],
    cz: ['Vrací rozdíly mezi sousedními dvojicemi prvků vstupního proudu.'],
    cat: [catg.numbers, catg.streams],
    ex: [['`iota`:`power`(2).diff', '[3,5,7,9,11,...]']]
  }
});

R.register(['product', 'prod'], {
  reqSource: true,
  numArg: 0,
  eval() {
    const str = this.src.evalStream({finite: true});
    let prod = 1n;
    for(const s of str) {
      prod *= s.evalNum();
      if(prod === 0n)
        break;
    }
    return new Atom(prod);
  },
  help: {
    en: ['Calculates the produce of all elements of the input stream.'],
    cz: ['Součin všech prvků vstupního proudu.'],
    cat: catg.numbers,
    ex: [['`range`(5).product', '120']]
  }
});

R.register(['power', 'pow'], {
  minArg: 1,
  maxArg: 2,
  sourceOrArgs: 2,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    if(nnode.args.length === 1) {
      const base = nnode.src.evalNum();
      const pow = nnode.args[0].evalNum({min: 0n});
      return new Atom(base ** pow);
    } else {
      const base = nnode.args[0].evalNum();
      const pow = nnode.args[1].evalNum({min: 0n});
      return new Atom(base ** pow);
    }
  },
  toString() {
    let ret = '';
    if(this.src)
      ret = this.src.toString() + '.';
    if(this.args.length === 2) {
      ret += '(';
      ret += this.args.map(n => n.toString()).join('^');
      ret += ')';
    } else {
      ret += this.ident;
      ret += '(';
      ret += this.args.map(n => n.toString()).join(',');
      ret += ')';
    }
    return ret;
  },
  help: {
    en: ['Calculates `_base` to the power of `_power`.',
      'These can be given as two arguments, or in the form `_base.power(_power)`. Also allows short form `_base^_power`.'],
    cz: ['Počítá `_power`-tou mocninu `_base`.',
      'Hodnoty mohou být zadány jako dva argumenty nebo ve formě `_base.power(_power)`. Existuje také stručný zápis `_base^_power`.'],
    cat: [catg.numbers, catg.streams],
    args: 'base?,power',
    ex: [['2^64', '18446744073709551616'],
      ['`iota`:power(3)', '[1,8,27,64,125,...]']],
    see: 'sqrt'
  }
});

R.register('mod', {
  reqSource: true,
  minArg: 1,
  maxArg: 2,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const inp = nnode.src.evalNum();
    const mod = nnode.args[0].evalNum({min: 1n});
    const base = nnode.args[1] ? nnode.args[1].evalNum() : 0n;
    const res0 = (inp - base) % mod;
    const res = (res0 >= 0n ? res0 : res0 + mod) + base;
    return new Atom(res);
  },
  help: {
    en: ['Calculates `_n` modulo `_modulus`.',
      'If `_base` is given, the result is given between `_base` and `_base+_modulus-1`, rather than between 0 and `_modulus-1`.'],
    cz: ['Počítá `_n` modulo `_modulus`.',
      'Jestliže je zadáno `_base`, dává výsledek mezi `_base` a `_base+_modulus-1` namísto mezi 0 a `_modulus-1`.'],
    cat: catg.numbers,
    source: 'n',
    args: 'modulus,base?',
    ex: [['`range`(-5,5):mod(3) ;remainder is calculated ≥ 0 even for negative numbers', '[1,2,0,1,2,0,1,2,0,1,2]'],
      ['10.mod(5,1) ;with base=1 returns 5 instead of 0', '5']],
    see: ['div', 'divmod', 'add']
  }
});

R.register('modinv', {
  minArg: 1,
  maxArg: 2,
  sourceOrArgs: 2,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const [val, mod] = (nnode.args[1] ? [nnode.args[0], nnode.args[1]] : [nnode.src, nnode.args[0]])
      .map(arg => arg.evalNum({min: 1n}));
    let [a, b, c, d] = [1n, 0n, 0n, 1n];
    let [x, y] = [val, mod];
    for(;;) {
      if(y === 1n) {
        c %= mod;
        return new Atom(c >= 0n ? c : c + mod);
      } else if(y === 0n)
        throw new StreamError(`${val} and ${mod} are not coprime`);
      let [q, r] = [x / y, x % y]; // Working with BigInt, no need for floor
      [a, b] = [a - q*c, b - q*d];
      [a, b, c, d, x, y] = [c, d, a, b, y, r];
    }
  },
  help: {
    en: ['Calculates the inverse of `_n` modulo `_modulus`, i.e., `_k` such that `(_n*_k).mod(_modulus) = 1`.',
      'May be used in the form `modinv(_n,_modulus)` or `_n.modinv(_modulus)`.'],
    cz: ['Počítá převrácenou hodnotu `_n` modulo `_modulus`, tj. `_k` takové, že `(_n*_k).mod(_modulus) = 1`.',
      'Může být použito ve formě `modinv(_n,_modulus)` nebo `_n.modinv(_modulus)`.'],
    cat: catg.numbers,
    args: 'n?,modulus',
    ex: [['`range`(1,6):modinv(7)', '[1,4,5,2,3,6]'],
      ['range(1,6)*$', '[1,8,15,8,15,36]'],
      ['$:`mod`(7)', '[1,1,1,1,1,1]'],
      ['10.modinv(6)', '!10 and 6 are not coprime']]
  }
});

R.register('add', {
  reqSource: true,
  minArg: 1,
  maxArg: 3,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const inp = nnode.src.evalNum();
    const add = nnode.args[0].evalNum();
    if(nnode.args.length > 1) {
      const mod = nnode.args[1].evalNum({min: 1n});
      const base = nnode.args[2] ? nnode.args[2].evalNum() : 0n;
      const res0 = (inp + add - base) % mod;
      const res = (res0 >= 0n ? res0 : res0 + mod) + base;
      return new Atom(res);
    } else
      return new Atom(inp + add);
  },
  help: {
    en: ['1-argument form: alternative to `_n+_add` for chaining.',
      '2- and 3-argument form: equivalent to `(_n+_add).mod(_modulus,_base?)`'],
    cz: ['Forma s jedním argumentem: alternativa k `_n+_add` uzpůsobená k řetězení.',
      'Forma se dvěma nebo třemi argumenty: ekvivalentní `(_n+_add).mod(_modulus,_base?)`'],
    cat: catg.numbers,
    src: 'n',
    args: 'add,modulus?,base?',
    ex: [['`range`(10,20):add(10,26,1)', '[20,21,22,23,24,25,26,1,2,3,4]']],
    see: ['plus', 'mod']
  }
});

R.register('abs', {
  reqSource: true,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const inp = nnode.src.evalNum();
    return new Atom(inp >= 0n ? inp : -inp);
  },
  help: {
    en: ['Absolute value of `_n`.'],
    cz: ['Absolutní hodnota `_n`.'],
    cat: catg.numbers,
    src: 'n',
    ex: [['`range`(-3,3):abs', '[3,2,1,0,1,2,3]']]
  }
});

R.register(['sign', 'sgn'], {
  reqSource: true,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const inp = nnode.src.evalNum();
    return new Atom(inp > 0n ? 1 : inp < 0n ? -1 : 0);
  },
  help: {
    en: ['Sign of `_n`: -1, 0, or 1.'],
    cz: ['Znaménko `_n`: -1, 0 nebo 1.'],
    cat: catg.numbers,
    src: 'n',
    ex: [['`range`(-3,3):sign', '[-1,-1,-1,0,1,1,1]']]
  }
});

R.register('odd', {
  reqSource: true,
  numArg: 0,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const val = nnode.src.evalNum();
    return new Atom((val & 1n) === 1n);
  },
  help: {
    en: ['Checks if `_n` is odd, returns `true` or `false`.',
      'Non-numeric input results in an error.'],
    cz: ['Podle toho, zda `_n` je liché, vrátí `true` nebo `false`.',
      'Nečíselný vstup způsobí chybu.'],
    cat: catg.numbers,
    src: 'n',
    ex: [['`range`(10).`select`(odd)', '[1,3,5,7,9]'],
      ['10.`nest`(`if`(odd,3*#+1,#/2)) ;Collatz sequence', '[10,5,16,8,4,2,1,...]']],
    see: 'even'
  }
});

R.register('even', {
  reqSource: true,
  numArg: 0,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const val = nnode.src.evalNum();
    return new Atom((val & 1n) === 0n);
  },
  help: {
    en: ['Checks if `_n` is even, returns `true` or `false`.',
      'Non-numeric input results in an error.'],
    cz: ['Podle toho, zda `_n` je sudé, vrátí `true` nebo `false`.',
      'Nečíselný vstup způsobí chybu.'],
    cat: catg.numbers,
    src: 'n',
    ex: [['`range`(10).`select`(even)', '[2,4,6,8,10]']],
    see: 'odd'
  }
});

R.register('not', {
  maxArg: 1,
  sourceOrArgs: 1,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    if(nnode.args[0]) {
      const val = nnode.args[0].evalAtom(types.B);
      return new Atom(!val);
    } else {
      const val = nnode.src.evalAtom(types.B);
      return new Atom(!val);
    }
  },
  help: {
    en: ['Negates a logical value.',
      'Can be used in both formats `_value.not` and `not(_value)`.'],
    cz: ['Neguje logickou hodnotu.',
      'Může být použito ve formě `_value.not` i `not(_value)`.'],
    cat: catg.numbers,
    args: 'value?',
    ex: [['`range`(10).`select`(not(`isprime`)))', '[1,4,6,8,9,10]']],
    see: ['and', 'or']
  }
});

R.register(['every', 'each', 'all'], {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const sIn = this.src.evalStream({finite: true});
    const cond = this.args[0];
    for(const value of sIn)
      if(!cond.prepare({src: value}).evalAtom('boolean'))
        return new Atom(false);
    return new Atom(true);
  },
  help: {
    en: ['Returns `true` only if evaluating `_condition` on every element of `_source` gives `true`, `false` otherwise.'],
    cz: ['Vrátí `true` pokud podmínka `_condition` vyhodnocená v každém prvku proudu `_source` dává `true`, jinak `false`.'],
    cat: catg.numbers,
    src: 'source',
    args: 'condition',
    ex: [['[5,7,1,9].all(odd)', 'true'],
      ['ineq@([2,3,4,1],range(4)).all(#) ;does no number appear in its place?', 'true']],
    see: 'some'
  }
});

R.register(['some', 'any'], {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src: undefined, partial: true}));
    return this.modify({src, args}).check(scope.partial);
  },
  eval() {
    const sIn = this.src.evalStream({finite: true});
    const cond = this.args[0];
    for(const value of sIn)
      if(cond.prepare({src: value}).evalAtom('boolean'))
        return new Atom(true);
    return new Atom(false);
  },
  help: {
    en: ['Returns `true` if evaluating `_condition` on some element of `_source` gives `true`, `false` otherwise.'],
    cz: ['Vrátí `true` pokud podmínka `_condition` vyhodnocená na některém prvku proudu `_source` dává `true`, jinak `false`.'],
    cat: catg.numbers,
    src: 'source',
    args: 'condition',
    ex: [['[4,6,1,8].some(odd)', 'true'],
      ['equal@([2,3,1,4],range(4)).some(#) ;does some number appear in its place?', 'true']],
    see: 'every'
  }
});

function regComparer(name, sign, fun, help) {
  R.register(name, {
    reqSource: false,
    minArg: 2,
    prepare(scope) {
      const nnode = this.prepareAll(scope);
      if(scope.partial)
        return nnode;
      if(nnode.args.every(arg => arg.isAtom)) {
        const vals = nnode.args.map(arg => arg.numValue());
        let res = true;
        for(let i = 1; i < vals.length; i++)
          res = res && fun(vals[i-1], vals[i]);
        return new Atom(res);
      } else
        return nnode;
    },
    eval() {
      const vals = this.args.map(arg => arg.evalNum());
      let res = true;
      for(let i = 1; i < vals.length; i++)
        res = res && fun(vals[i-1], vals[i]);
      return new Atom(res);
    },
    toString() {
      let ret = '';
      if(this.src)
        ret = this.src.toString() + '.';
      if(this.args.length > 0) {
        ret += '(';
        ret += this.args.map(n => n.toString()).join(sign);
        ret += ')';
      } else
        ret += name;
      return ret;
    },
    help
  });
}

regComparer('lt', '<', (a, b) => a < b, {
  en: ['Checks if the arguments are numbers in strictly increasing order. Long form of `x&lt;y&lt;...`.'],
  cz: ['Testuje, zda argumenty jsou čísla tvořící ostře rostoucí posloupnost. Alternativní zápis `x&lt;y&lt;...`.'],
  cat: catg.numbers,
  ex: [['1&lt;3&lt;5&lt;6', 'true'], ['1&lt;3&lt;4&lt;4', 'false']],
  see: ['le', 'gt']
});

regComparer('gt', '>', (a, b) => a > b, {
  en: ['Checks if the arguments are numbers in strictly decreasing order. Long form of `x&gt;y...`.'],
  cz: ['Testuje, zda argumenty jsou čísla tvořící ostře klesající posloupnost. Alternativní zápis `x&gt;y...`.'],
  cat: catg.numbers,
  ex: [['7&gt;5&gt;3', 'true'], ['7&gt;5&gt;5&gt;3', 'false']],
  see: ['ge', 'lt']
});

regComparer('le', '<=', (a, b) => a <= b, {
  en: ['Checks if the arguments are numbers in nondecreasing order. Long form of `x&lt;=y...`.'],
  cz: ['Testuje, zda argumenty jsou čísla tvořící neklesající posloupnost. Alternativní zápis `x&lt;=y...`.'],
  cat: catg.numbers,
  ex: [['1&lt;=3&lt;=5&lt;=6', 'true'], ['1&lt;=3&lt;=4&lt;=4', 'true']],
  see: ['lt', 'ge']
});

regComparer('ge', '>=', (a, b) => a >= b, {
  en: ['Checks if the arguments are numbers in nonincreasing order. Long form of `x&gt;=y...`.'],
  cz: ['Testuje, zda argumenty jsou čísla tvořící nerostoucí posloupnost. Alternativní zápis `x&gt;=y...`.'],
  cat: catg.numbers,
  ex: [['7&gt;=5&gt;=3', 'true'], ['7&gt;=5&gt;=5&gt;=3', 'true']],
  see: ['gt', 'le']
});

R.register(['tobase', 'tbase', 'tb', 'str'], {
  reqSource: true,
  maxArg: 2,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    let val = nnode.src.evalNum();
    const base = nnode.args[0] ? nnode.args[0].evalNum({min: 2n, max: 36n}) : 10n;
    const minl = nnode.args[1] ? Number(nnode.args[1].evalNum({min: 1n})) : 0;
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
    return new Atom(ret.padStart(minl, '0'));
  },
  help: {
    en: ['Converts number `_n` to a string in base `_base`. Digits `0`, ..., `9`, `_a`, ..., `_z` are used.',
      'If no `_base` is given, base 10 is used.',
      'If `_length` is given, the result is left padded with zeroes if it is shorter than `_length` digits.'],
    cz: ['Konvertuje číslo `_n` na řetězec jeho zápisu v soustavě `_base`. Jako číslice jsou použity `0`, ..., `9`, `_a`, ..., `_z`.',
      'Jestliže `_base` není dáno, pracuje v desítkové soustavě.',
      'Jestliže je dána délka `_len`, výsledek je zleva doplněn nulami, pokud by měl menší počet číslic.'],
    cat: [catg.numbers, catg.strings],
    src: 'n',
    args: 'base?,len?',
    ex: [['15.str ;number to string conversion', '"15"'],
      ['(-100).tobase(15) ;negative inputs are permitted', '"-6a"'],
      ['"n".ord(abc).tobase(2,5)', '"01110"'],
      ['""ASCII".split:ord:tobase(16,2)', '["41","53","43","49","49"]']],
    see: ['frombase', 'todigits']
  }
});

R.register(['frombase', 'fbase', 'fb', 'num'], {
  reqSource: true,
  maxArg: 1,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
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
  },
  help: {
    en: ['Parses `_string` as a number in base `_base`. Digits `0`, ..., `9`, `_a`, ..., `_z` are accepted, as well as uppercase.',
      'If no `_base` is given, base 10 is used.'],
    cz: ['Interpretuje `_string` jako číslo v soustavě `_base`. Jako číslice jsou přijímány `0`, ..., `9`, `_a`, ..., `_z`, včetně velkých písmen.',
      'Jestliže `_base` není dáno, pracuje v desítkové soustavě.'],
    cat: [catg.numbers, catg.strings],
    src: 'string',
    args: 'base?',
    ex: [['"123".num ;string to number conversion', '123'],
      ['"FFFFFF".frombase(16) ;parse a hexadecimal value', '16777215'],
      ['"74657374".split(2):frombase(16):chr.cat', '"test"']],
    see: ['tobase', 'fromdigits']
  }
});

R.register(['todigits', 'tdig'], {
  reqSource: true,
  maxArg: 2,
  eval() {
    let val = this.src.evalNum({min: 0n});
    const base = this.args[0] ? this.args[0].evalNum({min: 2n}) : 10n;
    const minl = this.args[1] ? Number(this.args[1].evalNum({min: 1n})) : 0;
    const digits = [];
    while(val) {
      digits.push(val % base);
      val /= base;
    }
    while(digits.length < minl)
      digits.push(0);
    return new Stream(this,
      digits.reverse().map(d => new Atom(d)).values(),
      {len: BigInt(digits.length)}
    );
  },
  help: {
    en: ['Converts number `_n` to a base `_base` and outputs its digits as a stream.',
      'If no `_base` is given, base 10 is used.',
      'If `_length` is given, the result is left padded with zeroes if it is shorter than `_length` digits.'],
    cz: ['Konvertuje číslo `_n` na zápis v soustavě `_base` a vrátí jeho číslice jako proud.',
      'Jestliže `_base` není dáno, pracuje v desítkové soustavě.',
      'Jestliže je dána délka `_len`, výsledek je zleva doplněn nulami, pokud by měl menší počet číslic.'],
    cat: [catg.numbers, catg.streams],
    src: 'n',
    args: 'base?,len?',
    ex: [['(2^100).todigits', '[1,2,6,7,6,5,0,6,0,...]'],
      ['65536.todigits(100) ;allows bases larger than 36', '[6,55,36]']],
    see: ['fromdigits', 'tobase']
  }
});

R.register(['fromdigits', 'fdig'], {
  reqSource: true,
  maxArg: 1,
  eval() {
    const sIn = this.src.evalStream({finite: true});
    const base = this.args[0] ? this.args[0].evalNum({min: 2n}) : 10n;
    let val = 0n;
    for(const r of sIn) {
      const digit = r.evalNum({min: 0n, max: base - 1n});
      val = val * base + digit;
    }
    return new Atom(val);
  },
  help: {
    en: ['Reads numbers from `_source` and interprets them as digits in base `_base`. Returns the composed number.',
      'If no `_base` is given, base 10 is used.'],
    cz: ['Čte čísla z proudu `_source` a interpretuje je jako číslice čísla v soustavě `_base`. Vrátí výslednou hodnotu.',
      'Jestliže `_base` není dáno, pracuje v desítkové soustavě.'],
    cat: [catg.numbers, catg.streams],
    src: 'source',
    args: 'base?',
    ex: [['pi.take(10).fromdigits', '3141592653']],
    see: ['todigits', 'frombase']
  }
});

const primes = (() => {
  const cache = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n, 53n, 59n, 61n, 67n, 71n, 73n, 79n, 83n, 89n, 97n, 101n, 103n, 107n, 109n, 113n, 127n, 131n, 137n, 139n, 149n, 151n, 157n, 163n, 167n, 173n, 179n, 181n, 191n, 193n, 197n, 199n, 211n, 223n, 227n, 229n, 233n, 239n, 241n, 251n, 257n, 263n, 269n, 271n, 277n, 281n, 283n, 293n, 307n, 311n, 313n, 317n, 331n, 337n, 347n, 349n, 353n, 359n, 367n, 373n, 379n, 383n, 389n, 397n, 401n, 409n, 419n, 421n, 431n, 433n, 439n, 443n, 449n, 457n, 461n, 463n, 467n, 479n, 487n, 491n, 499n, 503n, 509n, 521n, 523n, 541n];
  return function*() {
    yield* cache;
    for(let i = cache[cache.length - 1] + 2n; ; i += 2n) {
      let prime = true;
      for(const p of cache) {
        if(i % p === 0n) {
          prime = false;
          break;
        } else if(p*p > i)
          break;
      }
      if(prime) {
        cache.push(i);
        yield i;
        watchdog.tick();
      }
    }
  };
})();

R.register('primes', {
  reqSource: false,
  numArg: 0,
  eval() {
    return new Stream(this,
      (function*() {
        for(const p of primes())
          yield new Atom(p);
      })(),
      {len: null}
    );
  },
  help: {
    en: ['Prime numbers.'],
    cz: ['Prvočísla.'],
    cat: [catg.numbers, catg.sources],
    ex: [['primes[1000]', '7919']],
    see: ['isprime', 'factor']
  }
});

R.register('isprime', {
  reqSource: true,
  numArg: 0,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const val = nnode.src.evalNum();
    if(val <= 1n)
      return new Atom(false);
    for(const p of primes()) {
      if(p === val)
        return new Atom(true);
      else if(p * p < val && (val % p) === 0n)
        return new Atom(false);
      else if(p > val)
        return new Atom(false);
    }
  },
  help: {
    en: ['Checks if `_n` is a prime, returns `true` or `false`.',
      'Non-numeric input results in an error.'],
    cz: ['Podle toho, zda `_n` je prvočíslo, vrátí `true` nebo `false`.',
      'Nečíselný vstup způsobí chybu.'],
    cat: catg.numbers,
    src: 'n',
    ex: [['range(10).select(even)', '[2,4,5,7]']],
    see: 'primes'
  }
});

R.register('factor', {
  reqSource: true,
  numArg: 0,
  eval() {
    let val = this.src.evalNum({min: 1n});
    return new Stream(this,
      (function*() {
        for(const p of primes()) {
          while((val % p) === 0n) {
            yield new Atom(p);
            val /= p;
          }
          if(val === 1n)
            return;
        }
      })()
    );
  },
  help: {
    en: ['Prime divisors of `_n` in nondecreasing order.'],
    cz: ['Prvočíselné dělitele čísla `_n` v neklesající posloupnosti.'],
    cat: catg.numbers,
    src: 'n',
    ex: [['1552668.factor', '[2,2,3,13,37,269]'],
      ['iota.select(#.factor.rle.every(#[2]=1)) ;squarefree numbers', '[2,3,5,6,7,10,11,13,...]']],
    see: 'rle'
  }
});

R.register(['isnumber', 'isnum'], {
  reqSource: true,
  numArg: 0,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const c = nnode.src.eval();
    return new Atom(c.type === types.N);
  },
  help: {
    en: ['Tests if `_input` is a number. Returns `true` or `false`.'],
    cz: ['Testuje, zda `_input` je číslem. Vrací `true` nebo `false`.'],
    cat: catg.numbers,
    src: 'input',
    ex: [['[1,[2,3,4],"123"]:isnumber', '[true,false,false]']]
  }
});

R.register('pi', {
  reqSource: false,
  numArg: 0,
  eval() {
    const normalize = v => {
      let carry = 0;
      for(let i = v.length - 1; i > 0; i--) {
        let x = v[i] + carry * (i + 1);
        v[i] = x % (2*i + 1);
        carry = Math.floor(x / (2*i + 1));
      }
      return carry;
    };
    return new Stream(this,
      (function*() {
        const v = [];
        let wait = [];
        for(let j = 0; ; j++) {
          watchdog.utick();
          const w = v.map(() => 0);
          const add = 196;
          for(let i = 0; i < add; i++) {
            v.push(0);
            w.push(2);
          }
          for(let k = 0; k < j * 59; k++) {
            w.forEach((el, ix) => w[ix] *= 10);
            normalize(w);
          }
          v.forEach((el, ix) => v[ix] += w[ix]);
          for(let k = 0; k < 59; k++) {
            v.forEach((el, ix) => v[ix] *= 10);
            v[0] += normalize(v);
            const pre = Math.floor(v[0] / 10);
            v[0] %= 10;
            if(pre < 9) {
              yield* wait.map(x => new Atom(x));
              wait = [pre];
            } else if(pre === 10) {
              yield* wait.map(x => new Atom(x + 1));
              wait = [0];
            } else {
              // pre === 9
              wait.push(pre);
            }
          }
        }
      })(),
      {len: null}
    );
  },
  help: {
    en: ['The digits of π in base 10.'],
    cz: ['Číslice čísla π v desítkové soustavě.'],
    cat: [catg.numbers, catg.sources],
    ex: [['pi', '[3,1,4,1,5,9,2,6,...]'],
      ['pi.drop(1)[range(100,110)]', '[9,8,2,1,4,8,0,8,6,5,1]']]
  }
});

function* rnds(seed, min, max) {
  if(max < min)
    throw new StreamError(`maximum ${max} less than minimum ${min}`);
  if(seed === undefined)
    throw new Error('RNG unitialized');
  const rng = new RNG(seed);
  for(;;)
    yield rng.random(min, max);
}

function rnd1(seed, min, max) {
  return rnds(seed, min, max).next().value;
}

R.register(['random', 'rnd', 'sample'], {
  minArg: 0,
  maxArg: 3,
  sourceOrArgs: 2,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src}));
    const nnode = this.modify({src, args,
      meta: scope.seed ? {...this.meta, _seed: scope.seed} : this.meta
    }).check(scope.partial);
    if(scope.partial)
      return nnode;
    if(nnode.args.length === 2) {
      /*** 2-arg: min, max - resolve in prepare() ***/
      const min = nnode.args[0].evalNum();
      const max = nnode.args[1].evalNum();
      return new Atom(rnd1(nnode.meta._seed, min, max));
    } else
      return nnode;
  },
  eval() {
    if(this.args.length === 3) {
      /*** 3-arg: min, max, count ***/
      const min = this.args[0].evalNum();
      const max = this.args[1].evalNum();
      const count = this.args[2].evalNum({min: 1n});
      const gen = rnds(this.meta._seed, min, max);
      return new Stream(this,
        (function*() {
          for(let i = 0n; i < count; i++)
            yield new Atom(gen.next().value);
        })(),
        {count}
      );
    } else {
      let sIn = this.src.evalStream({finite: true});
      let sLen;
      if(typeof sIn.len === 'bigint')
        sLen = sIn.len;
      else {
        sLen = 0n;
        for(const _ of sIn)
          sLen++;
        sIn = this.src.evalStream();
      }
      if(sLen === 0n)
        throw new StreamError('empty stream');
      const gen = rnds(this.meta._seed, 0n, sLen - 1n);
      if(!this.args[0]) {
        /*** 0-arg: one sample from source ***/
        sIn.skip(gen.next().value);
        return sIn.next().value.eval();
      } else {
        /*** 1-arg: source + count ***/
        const count = this.args[0].evalNum({min: 1n});
        if(sLen < MAXMEM) {
          // Memoize
          const data = [...sIn];
          return new Stream(this,
            (function*() {
              for(let i = 0n; i < count; i++)
                yield data[gen.next().value];
            })(),
            {len: count}
          );
        } else {
          // Skip + reinit
          return new Stream(this,
            (function*(self) {
              for(let i = 0n; i < count; i++) {
                const ix = gen.next().value;
                sIn.skip(ix);
                yield sIn.next().value;
                sIn = self.src.evalStream();
              }
            })(this),
            {len: count}
          );
        }
      }
    }
  },
  help: {
    en: ['0-argument form: take a single random sample from `_source`.',
      '1-argument form: take a random sample of size `_count`.',
      '2-argument form: take a random number between `_min` and `_max`.',
      '3-argument form: take `_count` random numbers between `_min` and `_max`.',
      '!In the interest of consistency, all instances of `random` and `rndstream` use the same pseudorandom generator with the same seed per command. This may cause surprising behaviour.'],
    cz: ['Forma bez argumentů: jeden náhodně vybraný prvek proudu `_source`.',
      'Forma s 1 argumentem: `_count` náhodně vybraných prvků.',
      'Forma se 2 argumenty: náhodně vybrané číslo mezi `_min` a `_max`.',
      'Forma se 3 argumenty: `_count` náhodných čísel mezi `_min` a `_max`.',
      '!V zájmu vnitřní konzistence všechny instance `random` a `rndstream` v rámci jednoho příkazu používají stejný pseudonáhodný generátor se stejným počátečním stavem. To může způsobit překvapivé chování.'],
    cat: [catg.numbers, catg.streams, catg.sources],
    ex: [['abc.subsets.random.cat ;random subset of alphabet', '"cefgnptuvw"'],
      ['"ABC".split.perm.random(3):cat', '["BCA","BAC","BCA"]'],
      ['random(1,6)', '4'],
      ['[rnd(1,6),rnd(1,6),rnd(1,6)] ;watch out for this!', '[3,3,3]'],
      ['random(1,6,3) ;use this instead!', '[2,1,6]']
    ],
    src: 'source?',
    args: 'min??,max??,count?',
    see: 'rndstream'
  }
});

R.register(['rndstream', 'rnds'], {
  minArg: 0,
  maxArg: 2,
  sourceOrArgs: 2,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.prepare({...scope, src}));
    const nnode = this.modify({src, args,
      meta: scope.seed ? {...this.meta, _seed: scope.seed} : this.meta
    }).check(scope.partial);
    if(!scope.partial && nnode.args.length === 1)
      throw new StreamError('zero or two arguments required');
    return nnode;
  },
  eval() {
    if(this.args.length === 2) {
      /*** 2-arg: min, max ***/
      const min = this.args[0].evalNum();
      const max = this.args[1].evalNum();
      const gen = rnds(this.meta._seed, min, max);
      return new Stream(this,
        (function*() {
          for(const ix of gen)
            yield new Atom(ix);
        })(),
        {len: null}
      );
    } else {
      /*** 0-arg: source */
      let sIn = this.src.evalStream({finite: true});
      let sLen;
      if(typeof sIn.len === 'bigint')
        sLen = sIn.len;
      else {
        sLen = 0n;
        for(const _ of sIn)
          sLen++;
        sIn = this.src.evalStream();
      }
      if(sLen === 0n)
        throw new StreamError('empty stream');
      const gen = rnds(this.meta._seed, 0n, sLen - 1n);
      if(sLen < MAXMEM) {
        // Memoize
        const data = [...sIn];
        return new Stream(this,
          (function*() {
            for(const ix of gen)
              yield data[ix];
          })(),
          {len: null}
        );
      } else {
        // Skip + reinit
        return new Stream(this,
          (function*(self) {
            for(const ix of gen) {
              sIn.skip(ix);
              yield sIn.next().value;
              sIn = self.src.evalStream();
            }
          })(this),
          {len: null}
        );
      }
    }
  },
  help: {
    en: ['0-argument form: produces a stream of random samples of `_source`.',
      '2-argument form: a stream of random numbers between `_min` and `_max`.',
      '!In the interest of consistency, all instances of `random` and `rndstream` use the same pseudorandom generator with the same seed per command. This may cause surprising behaviour.'],
    cz: ['Forma bez argumentů: proud náhodně vybraných prvků proudu `_source`.',
      'Forma se 2 argumenty: proud náhodně vybraných čísel mezi `_min` a `_max`.',
      '!V zájmu vnitřní konzistence všechny instance `random` a `rndstream` v rámci jednoho příkazu používají stejný pseudonáhodný generátor se stejným počátečním stavem. To může způsobit překvapivé chování.'],
    cat: [catg.numbers, catg.streams, catg.sources],
    ex: [['rndstream(1,9)', '[6,7,3,2,9,5,2,3,6,4,...]'],
      ['rndstream(1,9) ;new run gives new results', '[3,2,7,5,1,4,1,8,6,7,...]'],
      ['$1 ;but recalling history reuses the earlier state', '[6,7,3,2,9,5,2,3,6,4,...]']
    ],
    src: 'source?',
    args: 'min??,max??,count?',
    see: 'rndstream'
  }
});

R.register(['divmod', 'quotrem'], {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const inp = nnode.src.evalNum();
    const mod = nnode.args[0].evalNum({min: 1n});
    let rem = inp % mod;
    if(rem < 0n)
      rem += mod;
    const div = (inp - rem) / mod;
    return new Node('array', this.token, null, [new Atom(div), new Atom(rem)]);
  },
  help: {
    en: ['Returns a pair comprising the quotient and remainder of dividing `_n` by `_k`.'],
    cz: ['Vrátí dvojici obsahující celočíselný podíl a zbytek po dělení `_n` číslem `_k`.'],
    cat: catg.numbers,
    src: 'n',
    args: 'k',
    ex: [['153.divmod(10)', '[15,3]']],
    see: ['mantexp', 'sqrem']
  }
});

R.register(['mantexp', 'manexp'], {
  reqSource: true,
  numArg: 1,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const inp = nnode.src.evalNum({min: 1n});
    const base = nnode.args[0].evalNum({min: 1n});
    let exp = 0n, rem = inp;
    while(rem % base === 0n) {
      rem /= base;
      exp++;
    }
    return new Node('array', this.token, null, [new Atom(rem), new Atom(exp)]);
  },
  help: {
    en: ['Returns a pair comprising the mantissa and exponent of `_n` in base `_base`, such that `_n = _mantissa * _base^_exponent` and `_mantissa.mod(_base) &lt;&gt; 0`.'],
    cz: ['Vrátí dvojici obsahující mantisu a exponent čísla `_n` v bázi `_base` takové, že `_n = _mantissa * _base^_exponent` a `_mantissa.mod(_base) &lt;&gt; 0`.'],
    cat: catg.numbers,
    src: 'n',
    args: 'base',
    ex: [['123000.mantexp(10)', '[123,3]']]
  }
});

function sqrt(n) {
  if(n < 16n)
    return BigInt(Math.floor(Math.sqrt(Number(n))));
  let x = 1n;
  for(;;) {
    let y = (x + n / x) / 2n;
    if(x === y || x === y - 1n)
      return x;
    else
      x = y;
  }
}

R.register('sqrt', {
  reqSource: true,
  numArg: 0,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const inp = nnode.src.evalNum({min: 0n});
    return new Atom(sqrt(inp));
  },
  help: {
    en: ['Returns the square root of `_n` rounded below.'],
    cz: ['Odmocnina z čísla `_n` zakrouhlená dolů.'],
    cat: catg.numbers,
    src: 'n',
    ex: [['iota:sqrt', '[1,1,1,2,2,2,2,2,3,...]']],
    see: 'sqrem'
  }
});

R.register('sqrem', {
  reqSource: true,
  numArg: 0,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const inp = nnode.src.evalNum({min: 0n});
    const sqr = sqrt(inp);
    return new Node('array', this.token, null, [new Atom(sqr), new Atom(inp - sqr * sqr)]);
  },
  help: {
    en: ['Returns a pair comprising the integer square root of `_n` and the remaining difference.'],
    cz: ['Vrátí dvojici obsahující celočíselnou odmocninu čísla `_n` a zbývající rozdíl.'],
    cat: catg.numbers,
    src: 'n',
    ex: [['153.sqrem', '[12,9]'],
      ['12^2+9', '153']],
    see: 'sqrt'
  }
});

R.register('trirem', {
  reqSource: true,
  numArg: 0,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const inp = nnode.src.evalNum({min: 0n});
    const row = (sqrt(1n + 8n * inp) - 1n) / 2n;
    return new Node('array', this.token, null, [new Atom(row), new Atom(inp - row * (row + 1n) / 2n)]);
  },
  help: {
    en: ['Returns a pair `[_k,_l]` such that `_n = _k*(_k-1) + _l` and `_k &lt;= _n`.'],
    cz: ['Vrátí dvojici čísel `[_k,_l]` takových, že `_n = _k*(_k-1) + _l` a `_k &lt;= _n`.'],
    cat: catg.numbers,
    src: 'n',
    ex: [['iota.trirem', '[[1,0],[1,1],[2,0],[2,1],[2,2],...]'],
      ['$.iwhere(#[2]=0) ;triangular numbers', '[1,3,6,10,15,21,28,...]']]
  }
});
