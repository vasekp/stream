import {StreamError} from '../errors.js';
import {Node, Atom, Stream, types, MAXMEM} from '../base.js';
import watchdog from '../watchdog.js';
import R from '../register.js';
import RNG from '../random.js';
import {catg} from '../help.js';

function regMathOp(name, sign, fun, type, help) {
  R.register(name, {
    minArg: 1,
    sourceOrArgs: 2,
    preeval() {
      if(this.args.length > 1 && this.args.every(arg => arg.isAtom))
        return new Atom(this.args.map(arg => arg.checkType(type).value).reduce(fun));
      else
        return this;
    },
    eval() {
      if(this.args.length === 1) {
        const a = this.src.evalAtom(type);
        const b = this.args[0].evalAtom(type);
        return new Atom(fun(a, b));
      }
      const is = this.args.map(arg => arg.eval());
      if(is.every(i => i.isAtom))
        return new Atom(is.map(a => a.checkType(type).value).reduce(fun));
      // else
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

regMathOp(['plus', 'add'], '+',
  (a, b) => {
    if(typeof a !== typeof b)
      throw new StreamError(`${Atom.format(a)} and ${Atom.format(b)} have different types`);
    else
      return a + b;
  },
  [types.N, types.S],
  {
    en: ['Adds numbers or concatenates strings. Long form of `x+y+...`.',
      'If any of the arguments are streams, they are processed element by element.',
      'Form with one argument: adds the argument to the source (number).'],
    cs: ['Sčítá čísla nebo navazuje řetězce. Alternativní zápis `x+y+...`.',
      'Jestliže některé z argumentů jsou proudy, zpracovává je prvek po prvku.',
      'Forma s jedním argumentem: součet vstupu (čísla) a argumentu.'],
    cat: [catg.numbers, catg.streams],
    ex: [['1+2+3', '6'],
      ['"a"+"b"+"c"', '"abc"'],
      ['[1,2,3]+4', '[5,6,7]'],
      ['[1,2,3]:plus(4)', '[5,6,7]'],
      ['[10,20,30]+[1,2,3,4,5]', '[11,22,33]', {en: 'shortest argument defines the length of output', cs: 'délku výstupu definuje nejkratší argument'}],
      ['[1,2,[3,4]]+5', '!expected number or string, got stream [3,4]', {en: 'unpacking works only to first level', cs: 'vstup do proudu funguje jen do první úrovně'}],
      ['iota.fold(plus)', '[1,3,6,10,15,...]', {en: 'long form used as an operand (also see `accum`)', cs: 'textová forma použitá jako operand (viz též `accum`)'}]],
    see: ['minus', 'accum', 'total']
  }
);

regMathOp('minus', '-', (a, b) => a - b, types.N, {
  en: ['Subtracts second and higher arguments from first. Long form of `x-y-...`.',
    'If any of the arguments are streams, they are processed element by element.',
    'Form with one argument: subtracts the argument from the source (number).'],
  cs: ['Odečítá od prvního argumentu všechny následující. Alternativní zápis `x-y-...`.',
    'Jestliže některé z argumentů jsou proudy, zpracovává je prvek po prvku.',
    'Forma s jedním argumentem: odečítá argument od vstupu (čísla).'],
  cat: catg.numbers,
  ex: [['1-2-3', '-4'],
    ['[1,2,3]-4', '[-3,-2,-1]'],
    ['[1,2,3]:minus(4)', '[-3,-2,-1]'],
    ['[10,20,30]-[1,2,3,4,5]', '[9,18,27]', {en: 'shortest argument defines the length of output', cs: 'délku výstupu definuje nejkratší argument'}],
    ['[1,2,[3,4]]-5', '!expected number, got stream [3,4]', {en: 'unpacking works only to first level', cs: 'vstup do proudu funguje jen do první úrovně'}],
    ['1.repeat.fold(minus)', '[1,0,-1,-2,-3,...]', {en: 'long form used as an operand', cs: 'textová forma použitá jako operand'}]],
  see: ['plus', 'diff']
});

regMathOp('times', '*', (a, b) => a * b, types.N, {
  en: ['Multiplies its arguments. Long form of `x*y*...`.',
    'If any of the arguments are streams, they are processed element by element.',
    'Form with one argument: multiplies the argument and the source (number).'],
  cs: ['Násobí své argumenty. Alternativní zápis `x*y*...`.',
    'Jestliže některé z argumentů jsou proudy, zpracovává je prvek po prvku.',
    'Forma s jedním argumentem: součin vstupu (čísla) a argumentu.'],
  cat: catg.numbers,
  ex: [['1*2*3', '6'],
    ['[1,2,3]*4', '[4,8,12]'],
    ['[1,2,3]:times(4)', '[4,8,12]'],
    ['[10,20,30]*[1,2,3,4,5]', '[10,40,90]', {en: 'shortest argument defines the length of output', cs: 'délku výstupu definuje nejkratší argument'}],
    ['[1,2,[3,4]]*5', '!expected number, got stream [3,4]', {en: 'unpacking works only to first level', cs: 'vstup do proudu funguje jen do první úrovně'}],
    ['range(7).reduce(times)', '5040', {en: 'long form used as an operand (also see `product`, `factorial`)', cs: 'textová forma použitá jako operand (viz též `product`, `factorial`)'}]],
  see: ['divide', 'product']
});

regMathOp(['divide', 'div'], '/',
  (a, b) => {
    if(b === 0n)
      throw new StreamError('division by zero');
    else
      return a / b;
  },
  types.N,
  {
    en: ['Divides its first argument by all the others. Long form of `x/y/...`.',
      'If any of the arguments are streams, they are processed element by element.',
      'Form with one argument: divides the source (number) with the argument.',
      '!All numbers in Stream are integers. Fractional part is lost.'],
    cs: ['Dělí první argument všemi následujícími. Alternativní zápis `x/y/...`.',
      'Jestliže některé z argumentů jsou proudy, zpracovává je prvek po prvku.',
      'Forma s jedním argumentem: dělí vstup (číslo) argumentem.',
      '!Všechna čísla v jazyce Stream jsou celá. Zlomková část je zahozena.'],
    cat: catg.numbers,
    ex: [['12/2/3', '2'],
      ['[4,5,6]/2', '[2,2,3]'],
      ['[4,5,6]:divide(2)', '[2,2,3]'],
      ['[10,20,30]/[1,2,3,4,5]', '[10,10,10]', {en: 'shortest argument defines the length of output', cs: 'délku výstupu definuje nejkratší argument'}],
      ['[1,2,[3,4]]/5', '!expected number, got stream [3,4]', {en: 'unpacking works only to first level', cs: 'vstup do proudu funguje jen do první úrovně'}],
      ['1/0', '!division by zero']],
    see: ['times', 'mod', 'divmod']
  });

R.register('min', {
  sourceOrArgs: 2,
  prepare(scope) {
    return this.args.length === 1
      ? this.prepareForeach(scope)
      : this.prepareDefault(scope);
  },
  preeval() {
    if(this.args.length >= 2) {
      const ins = this.args.map(arg => arg.evalNum());
      const res = ins.reduce((a, b) => b < a ? b : a);
      return new Atom(res);
    } else
      return this;
  },
  eval() {
    const sIn = this.src.evalStream({finite: true});
    if(this.args[0]) {
      let res = null;
      let best = null;
      const body = this.args[0].checkType([types.symbol, types.expr]);
      for(const r of sIn) {
        const curr = body.prepare({src: r}).evalNum();
        if(best === null || curr < best) {
          best = curr;
          res = r;
        }
      }
      if(res === null)
        throw new StreamError('empty stream');
      else
        return res.eval();
    } else {
      let res = null;
      for(const s of sIn) {
        const curr = s.evalNum();
        if(res === null || curr < res)
          res = curr;
      }
      if(res === null)
        throw new StreamError('empty stream');
      return new Atom(res);
    }
  },
  help: {
    en: ['Form with several arguments: returns the least of them.',
      'Form without arguments: finds the least in the input stream of numbers.',
      'Form with one argument: applies the argument on elements of the input stream and returns that which gives the least result.'],
    cs: ['Forma s několika argumenty: vrátí nejmenší z nich.',
      'Forma bez argumentů: najde nejmenší ze vstupního proudu čísel.',
      'Forma s jedním argumentem: aplikuje argument na každý prvek vstupního proudu a vrátí ten, který dává nejmenší výsledek.'],
    cat: catg.numbers,
    src: 'stream?',
    ex: [['range(3,5).min', '3', {en: 'input stream', cs: 'vstupní proud'}],
      ['min(6,2,7)', '2', {en: 'arguments', cs: 'argumenty'}],
      ['["xyz",".","abcde"].min(#.length)', '"."', {en: '1 argument', cs: '1 argument'}]],
    see: ['max', 'selmin']
  }
});

R.register('max', {
  sourceOrArgs: 2,
  prepare(scope) {
    return this.args.length === 1
      ? this.prepareForeach(scope)
      : this.prepareDefault(scope);
  },
  preeval() {
    if(this.args.length >= 2) {
      const ins = this.args.map(arg => arg.evalNum());
      const res = ins.reduce((a, b) => b > a ? b : a);
      return new Atom(res);
    } else
      return this;
  },
  eval() {
    const sIn = this.src.evalStream({finite: true});
    if(this.args[0]) {
      let res = null;
      let best = null;
      const body = this.args[0].checkType([types.symbol, types.expr]);
      for(const r of sIn) {
        const curr = body.prepare({src: r}).evalNum();
        if(best === null || curr > best) {
          best = curr;
          res = r;
        }
      }
      if(res === null)
        throw new StreamError('empty stream');
      else
        return res.eval();
    } else {
      let res = null;
      for(const s of sIn) {
        const curr = s.evalNum();
        if(res === null || curr > res)
          res = curr;
      }
      if(res === null)
        throw new StreamError('empty stream');
      return new Atom(res);
    }
  },
  help: {
    en: ['Form with several arguments: returns the greatest of them.',
      'Form without arguments: finds the greatest in the input stream of numbers.',
      'Form with one argument: applies the argument on elements of the input stream and returns that which gives the greatest result.'],
    cs: ['Forma s několika argumenty: vrátí největší z nich.',
      'Forma bez argumentů: najde největší ze vstupního proudu čísel.',
      'Forma s jedním argumentem: aplikuje argument na každý prvek vstupního proudu a vrátí ten, který dává největší výsledek.'],
    cat: catg.numbers,
    src: 'stream?',
    ex: [['range(3,5).max', '5', {en: 'input stream', cs: 'vstupní proud'}],
      ['max(6,2,7)', '7', {en: 'arguments', cs: 'argumenty'}],
      ['["xyz",".","abcde"].max(#.length)', '"abcde"', {en: '1 argument', cs: '1 argument'}]],
    see: ['min', 'selmax']
  }
});

function regReducerS(name, fun, numOpts, help) {
  R.register(name, {
    sourceOrArgs: 2,
    preeval() {
      if(this.args.length >= 2) {
        const ins = this.args.map(arg => arg.evalNum());
        const res = ins.reduce(fun);
        return new Atom(res);
      } else if(this.args.length === 1) {
        const inp = this.src.evalNum(numOpts);
        const arg = this.args[0].evalNum(numOpts);
        return new Atom(fun(inp, arg));
      } else
        return this;
    },
    eval() {
      const sIn = this.src.evalStream({finite: true});
      let res = null;
      for(const s of sIn) {
        const curr = s.evalNum(numOpts);
        res = res === null ? curr : fun(res, curr);
      }
      if(res === null)
        throw new StreamError('empty stream');
      return new Atom(res);
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

regReducerS('gcd', gcd, {min: 1n}, {
  en: ['Form with several arguments: calculates the greatest common divisor of them.',
    'Form without arguments: calculates the GCD of the input stream.',
    'Form with one argument: calculates the GCD of the source (number) and the argument.'],
  cs: ['Forma s několika argumenty: počítá jejich největší společný dělitel (GCD).',
    'Forma bez argumentů: počítá GCD vstupního proudu.',
    'Forma s jedním argumentem: počítá GCD vstupu (čísla) a argumentu.'],
  cat: catg.numbers,
  src: 'stream?',
  args: 'list?',
  ex: [['range(4,8,2).gcd', '2', {en: 'input stream', cs: 'vstupní proud'}],
    ['gcd(100,125,145)', '5', {en: 'arguments', cs: 'argumenty'}],
    ['iota:gcd(4)', '[1,2,1,4,1,...]', {en: '1 argument (`foreach`)', cs: '1 argument (`foreach`)'}]],
  see: 'lcm'
});

regReducerS('lcm', (a, b) => a * (b / gcd(a, b)), {min: 1n}, {
  en: ['Form with several arguments: calculates the least common multiple of them.',
    'Form without arguments: calculates the LCM of the input stream.',
    'Form with one argument: calculates the LCM of the source (number) and the argument.'],
  cs: ['Forma s několika argumenty: počítá jejich nejmenší společný násobek (LCM).',
    'Forma bez argumentů: počítá LCM vstupního proudu.',
    'Forma s jedním argumentem: počítá LCM vstupu (čísla) a argumentu.'],
  cat: catg.numbers,
  src: 'stream?',
  args: 'list?',
  ex: [['range(4,8,2).lcm', '24', {en: 'input stream', cs: 'vstupní proud'}],
    ['lcm(10,12,15)', '60', {en: 'arguments', cs: 'argumenty'}],
    ['iota:lcm(4)', '[4,4,12,4,20,12,28,...]', {en: '1 argument (`foreach`)', cs: '1 argument (`foreach`)'}]],
  see: 'gcd'
});

regReducerS('bitand', (a, b) => a & b, {min: 1n}, {
  en: ['Form with several arguments: calculates the bitwise logical AND of them.',
    'Form without arguments: calculates the same operation the input stream.',
    'Form with one argument: calculates the same operation the source (number) and the argument.'],
  cs: ['Forma s několika argumenty: počítá jejich bitový logický součin (AND).',
    'Forma bez argumentů: počítá bitový součin vstupního proudu.',
    'Forma s jedním argumentem: počítá bitový součin vstupu (čísla) a argumentu.'],
  cat: catg.numbers,
  src: 'stream?',
  args: 'list?',
  ex: [['range(7,21,4).bitand', '3', {en: 'input stream', cs: 'vstupní proud'}],
    ['bitand("a".ord, "b".ord)', '96', {en: 'arguments', cs: 'argumenty'}],
    ['iota:bitand(6)', '[0,2,2,4,4,6,6,0,...]', {en: '1 argument (`foreach`)', cs: '1 argument (`foreach`)'}]],
  see: ['bitor', 'bitxor']
});

regReducerS('bitor', (a, b) => a | b, {min: 1n}, {
  en: ['Form with several arguments: calculates the bitwise logical OR of them.',
    'Form without arguments: calculates the same operation the input stream.',
    'Form with one argument: calculates the same operation the source (number) and the argument.'],
  cs: ['Forma s několika argumenty: počítá jejich bitový logický součet (OR).',
    'Forma bez argumentů: počítá bitový součet vstupního proudu.',
    'Forma s jedním argumentem: počítá bitový součet vstupu (čísla) a argumentu.'],
  cat: catg.numbers,
  src: 'stream?',
  args: 'list?',
  ex: [['range(7,21,4).bitor', '31', {en: 'input stream', cs: 'vstupní proud'}],
    ['bitor("a".ord,"b".ord).chr', '"c"', {en: 'arguments', cs: 'argumenty'}],
    ['iota:bitor(2)', '[3,2,3,6,7,6,7,10,...]', {en: '1 argument (`foreach`)', cs: '1 argument (`foreach`)'}]],
  see: ['bitand', 'bitxor']
});

regReducerS('bitxor', (a, b) => a ^ b, {min: 1n}, {
  en: ['Form with several arguments: calculates the bitwise logical XOR of them.',
    'Form without arguments: calculates the same operation the input stream.',
    'Form with one argument: calculates the same operation the source (number) and the argument.'],
  cs: ['Forma s několika argumenty: počítá jejich bitový exkluzivní logický součin (XOR).',
    'Forma bez argumentů: počítá stejnou operaci na vstupním proudu.',
    'Forma s jedním argumentem: počítá stejnou operaci na vstupu (čísle) a argumentu.'],
  cat: catg.numbers,
  src: 'stream?',
  args: 'list?',
  ex: [['range(15).bitxor', '0', {en: 'input stream', cs: 'vstupní proud'}],
    ['bitxor(3,6)', '5', {en: 'arguments', cs: 'argumenty'}],
    ['iota:bitxor(1)', '[0,3,2,5,4,7,6,9,8,...]', {en: '1 argument (`foreach`)', cs: '1 argument (`foreach`)'}]],
  see: ['bitand', 'bitor']
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
    cs: ['Postupně přičítá hodnoty ze vstupního proudu.'],
    cat: [catg.streams, catg.numbers],
    ex: [['range(5).accum', '[1,3,6,10,15]']]
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
    cs: ['Součet celého vstupního proudu.'],
    cat: catg.numbers,
    ex: [['range(5).total', '15']]
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
    cs: ['Vrací rozdíly mezi sousedními dvojicemi prvků vstupního proudu.'],
    cat: [catg.numbers, catg.streams],
    ex: [['iota:power(2).diff', '[3,5,7,9,11,...]']]
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
    cs: ['Součin všech prvků vstupního proudu.'],
    cat: catg.numbers,
    ex: [['range(5).product', '120']]
  }
});

R.register(['power', 'pow'], {
  minArg: 1,
  maxArg: 2,
  sourceOrArgs: 2,
  preeval() {
    if(this.args.length === 1) {
      const base = this.src.evalNum();
      const pow = this.args[0].evalNum({min: 0n});
      return new Atom(base ** pow);
    } else {
      const base = this.args[0].evalNum();
      const pow = this.args[1].evalNum({min: 0n});
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
      'These can be given as two arguments, or in the form `_base.power(_power)`. Also allows short form `_base^_power`.',
      '-`0^0` is defined as 1.'],
    cs: ['Počítá `_power`-tou mocninu `_base`.',
      'Hodnoty mohou být zadány jako dva argumenty nebo ve formě `_base.power(_power)`. Existuje také stručný zápis `_base^_power`.',
      '-`0^0` je definováno jako 1.'],
    cat: [catg.numbers, catg.streams],
    args: 'base?,power',
    ex: [['2^64', '18446744073709551616'],
      ['iota:power(3)', '[1,8,27,64,125,...]']],
    see: 'sqrt'
  }
});

R.register('clamp', {
  reqSource: true,
  numArg: 2,
  eval() {
    const inp = this.src.evalNum();
    const min = this.args[0].evalNum();
    const max = this.args[1].evalNum();
    if(max < min)
      throw new StreamError(`maximum ${max} smaller than minimum ${min}`);
    const res = inp < min ? min : inp > max ? max : inp;
    return new Atom(res);
  },
  help: {
    en: ['Clamps `_n` to bounds given by `_min` and `_max`.'],
    cs: ['Omezí vstup `_n` mezi dané meze `_min` a `_max`.'],
    cat: catg.numbers,
    src: 'n',
    args: 'min,max',
    ex: [['iota:clamp(3,7)', '[3,3,3,4,5,6,7,7,7,...]']]
  }
});

R.register('mod', {
  reqSource: true,
  minArg: 1,
  maxArg: 2,
  preeval() {
    const inp = this.src.evalNum();
    const mod = this.args[0].evalNum({min: 1n});
    const base = this.args[1] ? this.args[1].evalNum() : 0n;
    let rem = (inp - base) % mod;
    rem = (rem >= 0n ? rem : rem + mod) + base;
    return new Atom(rem);
  },
  help: {
    en: ['Calculates `_n` modulo `_modulus`.',
      'If `_base` is given, the result is given between `_base` and `_base+_modulus-1`, rather than between 0 and `_modulus-1`.'],
    cs: ['Počítá `_n` modulo `_modulus`.',
      'Jestliže je zadáno `_base`, dává výsledek mezi `_base` a `_base+_modulus-1` namísto mezi 0 a `_modulus-1`.'],
    cat: catg.numbers,
    src: 'n',
    args: 'modulus,base?',
    ex: [['range(-5,5):mod(3)', '[1,2,0,1,2,0,1,2,0,1,2]', {en: 'remainder is calculated ≥ 0 even for negative numbers', cs: 'zbytek je vrácen ≥ 0 i pro záporné argumenty'}],
      ['10.mod(5,1)', '5', {en: 'with base=1 returns 5 instead of 0', cs: 's base=1 vrátí 5 namísto 0'}]],
    see: ['divide', 'divmod']
  }
});

R.register('modinv', {
  minArg: 1,
  maxArg: 2,
  sourceOrArgs: 2,
  preeval() {
    const [val, mod] = (this.args[1] ? [this.args[0], this.args[1]] : [this.src, this.args[0]])
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
    cs: ['Počítá převrácenou hodnotu `_n` modulo `_modulus`, tj. `_k` takové, že `(_n*_k).mod(_modulus) = 1`.',
      'Může být použito ve formě `modinv(_n,_modulus)` nebo `_n.modinv(_modulus)`.'],
    cat: catg.numbers,
    args: 'n?,modulus',
    ex: [['range(1,6):modinv(7)', '[1,4,5,2,3,6]'],
      ['range(1,6)*$', '[1,8,15,8,15,36]'],
      ['$:mod(7)', '[1,1,1,1,1,1]'],
      ['10.modinv(6)', '!10 and 6 are not coprime']]
  }
});

R.register('abs', {
  reqSource: true,
  preeval() {
    const inp = this.src.evalNum();
    return new Atom(inp >= 0n ? inp : -inp);
  },
  help: {
    en: ['Absolute value of `_n`.'],
    cs: ['Absolutní hodnota `_n`.'],
    cat: catg.numbers,
    src: 'n',
    ex: [['range(-3,3):abs', '[3,2,1,0,1,2,3]']]
  }
});

R.register(['sign', 'sgn'], {
  reqSource: true,
  preeval() {
    const inp = this.src.evalNum();
    return new Atom(inp > 0n ? 1 : inp < 0n ? -1 : 0);
  },
  help: {
    en: ['Sign of `_n`: -1, 0, or 1.'],
    cs: ['Znaménko `_n`: -1, 0 nebo 1.'],
    cat: catg.numbers,
    src: 'n',
    ex: [['range(-3,3):sign', '[-1,-1,-1,0,1,1,1]']]
  }
});

R.register(['odd', 'isodd'], {
  reqSource: true,
  numArg: 0,
  preeval() {
    const val = this.src.evalNum();
    return new Atom((val & 1n) === 1n);
  },
  help: {
    en: ['Checks if `_n` is odd, returns `true` or `false`.',
      'Non-numeric input results in an error.'],
    cs: ['Podle toho, zda `_n` je liché, vrátí `true` nebo `false`.',
      'Nečíselný vstup způsobí chybu.'],
    cat: catg.numbers,
    src: 'n',
    ex: [['range(10).select(odd)', '[1,3,5,7,9]'],
      ['10.nest(if(odd,3*#+1,#/2))', '[10,5,16,8,4,2,1,...]', {en: 'Collatz sequence', cs: 'Collatzova posloupnost'}]],
    see: 'even'
  }
});

R.register(['even', 'iseven'], {
  reqSource: true,
  numArg: 0,
  preeval() {
    const val = this.src.evalNum();
    return new Atom((val & 1n) === 0n);
  },
  help: {
    en: ['Checks if `_n` is even, returns `true` or `false`.',
      'Non-numeric input results in an error.'],
    cs: ['Podle toho, zda `_n` je sudé, vrátí `true` nebo `false`.',
      'Nečíselný vstup způsobí chybu.'],
    cat: catg.numbers,
    src: 'n',
    ex: [['range(10).select(even)', '[2,4,6,8,10]']],
    see: 'odd'
  }
});

R.register('and', {
  reqSource: false,
  minArg: 2,
  preeval() {
    return new Atom(this.args.map(arg => arg.evalAtom(types.B)).reduce((a, b) => a && b));
  },
  toString() {
    let ret = '';
    if(this.src)
      ret = this.src.toString() + '.';
    if(this.args.length > 0) {
      ret += '(';
      ret += this.args.map(n => n.toString()).join('&');
      ret += ')';
    } else
      ret += name;
    return ret;
  },
  help: {
    en: ['Takes a logical conjunction of its arguments, i.e., `true` only if all of them are `true`. Long form of `x&y&...`.',
      '-For bitwise operation on numbers, see `bitand`.'],
    cs: ['Počítá logický součin svých argumentů, tj. `true` právě tehdy, pokud všechny jsou `true`. Alternativní zápis `x&y&...`.',
      '-Tento filtr je vyhrazen pro pravdivostní hodnoty. Pro bitovou operaci nad čísly viz `bitand`.'],
    cat: catg.numbers,
    ex: [['range(10).select(#.odd & #<6)', '[1,3,5]']],
    see: ['or', 'not', 'bitand', 'every']
  }
});

R.register('or', {
  reqSource: false,
  minArg: 2,
  preeval() {
    return new Atom(this.args.map(arg => arg.evalAtom(types.B)).reduce((a, b) => a || b));
  },
  toString() {
    let ret = '';
    if(this.src)
      ret = this.src.toString() + '.';
    if(this.args.length > 0) {
      ret += '(';
      ret += this.args.map(n => n.toString()).join('|');
      ret += ')';
    } else
      ret += name;
    return ret;
  },
  help: {
    en: ['Takes a logical disjunction of its arguments, i.e., `true` only if at least one of them is `true`. Long form of `x|y|...`.',
      '-For bitwise operation on numbers, see `bitor`.'],
    cs: ['Počítá logický součet svých argumentů, tj. `true` právě tehdy, pokud alespoň jeden z nich je `true`. Alternativní zápis `x|y|...`.',
      '-Tento filtr je vyhrazen pro pravdivostní hodnoty. Pro bitovou operaci nad čísly viz `bitor`.'],
    cat: catg.numbers,
    ex: [['range(10).select(#.odd | #<6)', '[1,2,3,4,5,7,9]']],
    see: ['and', 'not', 'bitor', 'some']
  }
});

R.register('not', {
  maxArg: 1,
  sourceOrArgs: 1,
  preeval() {
    if(this.args[0]) {
      const val = this.args[0].evalAtom(types.B);
      return new Atom(!val);
    } else {
      const val = this.src.evalAtom(types.B);
      return new Atom(!val);
    }
  },
  help: {
    en: ['Negates a logical value.',
      'Can be used in both formats `_value.not` and `not(_value)`.'],
    cs: ['Neguje logickou hodnotu.',
      'Může být použito ve formě `_value.not` i `not(_value)`.'],
    cat: catg.numbers,
    args: 'value?',
    ex: [['range(10).select(not(isprime))', '[1,4,6,8,9,10]']],
    see: ['and', 'or']
  }
});

R.register(['every', 'each', 'all'], {
  reqSource: true,
  maxArg: 1,
  prepare: Node.prototype.prepareForeach,
  eval() {
    const sIn = this.src.evalStream({finite: true});
    const cond = this.args[0];
    for(const value of sIn)
      if(!(cond ? cond.prepare({src: value}) : value).evalAtom('boolean'))
        return new Atom(false);
    return new Atom(true);
  },
  help: {
    en: ['Returns `true` only if evaluating `_condition` on every element of `_source` gives `true`, `false` otherwise.',
      'If `_condition` is omitted, the elements of `_source` must be boolean values themselves.'],
    cs: ['Vrátí `true`, pokud podmínka `_condition` vyhodnocená v každém prvku proudu `_source` dává `true`, jinak `false`.',
      'Jestliže `_condition` není poskytnuta, prvky `_source` musí samy být pravdivostními hodnotami.'],
    cat: catg.numbers,
    src: 'source',
    args: 'condition?',
    ex: [['[5,7,1,9].all(odd)', 'true'],
      ['ineq@([2,3,4,1],range(4)).all', 'true', {en: 'no number in its right place?', cs: 'žádné číslo na svém místě?'}]],
    see: 'some'
  }
});

R.register(['some', 'any'], {
  reqSource: true,
  maxArg: 1,
  prepare: Node.prototype.prepareForeach,
  eval() {
    const sIn = this.src.evalStream({finite: true});
    const cond = this.args[0];
    for(const value of sIn)
      if((cond ? cond.prepare({src: value}) : value).evalAtom('boolean'))
        return new Atom(true);
    return new Atom(false);
  },
  help: {
    en: ['Returns `true` if evaluating `_condition` on some element of `_source` gives `true`, `false` otherwise.',
      'If `_condition` is omitted, the elements of `_source` must be boolean values themselves.'],
    cs: ['Vrátí `true`, pokud podmínka `_condition` vyhodnocená na některém prvku proudu `_source` dává `true`, jinak `false`.',
      'Jestliže `_condition` není poskytnuta, prvky `_source` musí samy být pravdivostními hodnotami.'],
    cat: catg.numbers,
    src: 'source',
    args: 'condition?',
    ex: [['[4,6,1,8].some(odd)', 'true'],
      ['equal@([2,3,1,4],range(4)).some', 'true', {en: 'does some number appear in its place?', cs: 'je některé číslo na svém místě?'}]],
    see: 'every'
  }
});

function regComparer(name, sign, fun, help) {
  R.register(name, {
    reqSource: false,
    minArg: 2,
    preeval() {
      if(this.args.every(arg => arg.isAtom)) {
        const vals = this.args.map(arg => arg.numValue());
        let res = true;
        for(let i = 1; i < vals.length; i++)
          res = res && fun(vals[i-1], vals[i]);
        return new Atom(res);
      } else
        return this;
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
  en: ['Checks if the arguments are numbers in strictly increasing order. Long form of `x<y<...`.'],
  cs: ['Testuje, zda argumenty jsou čísla tvořící ostře rostoucí posloupnost. Alternativní zápis `x<y<...`.'],
  cat: catg.numbers,
  ex: [['1<3<5<6', 'true'], ['1<3<4<4', 'false']],
  see: ['le', 'gt']
});

regComparer('gt', '>', (a, b) => a > b, {
  en: ['Checks if the arguments are numbers in strictly decreasing order. Long form of `x>y...`.'],
  cs: ['Testuje, zda argumenty jsou čísla tvořící ostře klesající posloupnost. Alternativní zápis `x>y...`.'],
  cat: catg.numbers,
  ex: [['7>5>3', 'true'], ['7>5>5>3', 'false']],
  see: ['ge', 'lt']
});

regComparer('le', '<=', (a, b) => a <= b, {
  en: ['Checks if the arguments are numbers in nondecreasing order. Long form of `x<=y...`.'],
  cs: ['Testuje, zda argumenty jsou čísla tvořící neklesající posloupnost. Alternativní zápis `x<=y...`.'],
  cat: catg.numbers,
  ex: [['1<=3<=5<=6', 'true'], ['1<=3<=4<=4', 'true']],
  see: ['lt', 'ge']
});

regComparer('ge', '>=', (a, b) => a >= b, {
  en: ['Checks if the arguments are numbers in nonincreasing order. Long form of `x>=y...`.'],
  cs: ['Testuje, zda argumenty jsou čísla tvořící nerostoucí posloupnost. Alternativní zápis `x>=y...`.'],
  cat: catg.numbers,
  ex: [['7>=5>=3', 'true'], ['7>=5>=5>=3', 'true']],
  see: ['gt', 'le']
});

R.register(['tobase', 'tbase', 'tb', 'str'], {
  reqSource: true,
  maxArg: 2,
  preeval() {
    let val = this.src.evalNum();
    const base = this.args[0] ? this.args[0].evalNum({min: 2n, max: 36n}) : 10n;
    const minl = this.args[1] ? Number(this.args[1].evalNum({min: 1n})) : 0;
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
    cs: ['Konvertuje číslo `_n` na řetězec jeho zápisu v soustavě `_base`. Jako číslice jsou použity `0`, ..., `9`, `_a`, ..., `_z`.',
      'Jestliže `_base` není dáno, pracuje v desítkové soustavě.',
      'Jestliže je dána délka `_len`, výsledek je zleva doplněn nulami, pokud by měl menší počet číslic.'],
    cat: [catg.numbers, catg.strings],
    src: 'n',
    args: 'base?,len?',
    ex: [['15.str', '"15"', {en: 'number to string conversion', cs: 'převod čísla na řetězec'}],
      ['(-100).tobase(15)', '"-6a"', {en: 'negative inputs are permitted', cs: 'záporná čísla jsou dovolena'}],
      ['"n".ord(abc).tobase(2,5)', '"01110"'],
      ['"ASCII".split:ord:tobase(16,2)', '["41","53","43","49","49"]']],
    see: ['frombase', 'todigits']
  }
});

R.register(['frombase', 'fbase', 'fb', 'num'], {
  reqSource: true,
  maxArg: 1,
  preeval() {
    const str = this.src.evalAtom('string');
    const base = this.args[0] ? this.args[0].evalNum({min: 2n, max: 36n}) : 10n;
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
    cs: ['Interpretuje `_string` jako číslo v soustavě `_base`. Jako číslice jsou přijímány `0`, ..., `9`, `_a`, ..., `_z`, včetně velkých písmen.',
      'Jestliže `_base` není dáno, pracuje v desítkové soustavě.'],
    cat: [catg.numbers, catg.strings],
    src: 'string',
    args: 'base?',
    ex: [['"123".num', '123', {en: 'string to number conversion', cs: 'převod řetězce na číslo'}],
      ['"FFFFFF".frombase(16)', '16777215', {en: 'parse a hexadecimal value', cs: 'způsob zadání šestnáctkové hodnoty'}],
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
    cs: ['Konvertuje číslo `_n` na zápis v soustavě `_base` a vrátí jeho číslice jako proud.',
      'Jestliže `_base` není dáno, pracuje v desítkové soustavě.',
      'Jestliže je dána délka `_len`, výsledek je zleva doplněn nulami, pokud by měl menší počet číslic.'],
    cat: [catg.numbers, catg.streams],
    src: 'n',
    args: 'base?,len?',
    ex: [['(2^100).todigits', '[1,2,6,7,6,5,0,6,0,...]'],
      ['65536.todigits(100)', '[6,55,36]', {en: 'allows bases larger than 36', cs: 'umožňuje soustavy vyšší než 36'}]],
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
    cs: ['Čte čísla z proudu `_source` a interpretuje je jako číslice čísla v soustavě `_base`. Vrátí výslednou hodnotu.',
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
    cs: ['Prvočísla.'],
    cat: [catg.numbers, catg.sources],
    ex: [['primes[1000]', '7919']],
    see: ['isprime', 'factor']
  }
});

R.register('isprime', {
  reqSource: true,
  numArg: 0,
  preeval() {
    const val = this.src.evalNum();
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
    cs: ['Podle toho, zda `_n` je prvočíslo, vrátí `true` nebo `false`.',
      'Nečíselný vstup způsobí chybu.'],
    cat: catg.numbers,
    src: 'n',
    ex: [['range(10).select(isprime)', '[2,3,5,7]']],
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
    cs: ['Prvočíselné dělitele čísla `_n` v neklesající posloupnosti.'],
    cat: catg.numbers,
    src: 'n',
    ex: [['1552668.factor', '[2,2,3,13,37,269]'],
      ['iota.select(#.factor.rle.every(#[2]=1))', '[2,3,5,6,7,10,11,13,...]', {en: 'squarefree numbers', cs: 'bezčtvercová čísla'}]],
    see: 'rle'
  }
});

R.register('divisors', {
  reqSource: true,
  numArg: 0,
  eval() {
    let val = this.src.evalNum({min: 1n});
    const fact = new Map();
    for(const p of primes()) {
      let pow = 0;
      while((val % p) === 0n) {
        pow++;
        val /= p;
      }
      if(pow !== 0)
        fact.set(p, BigInt(pow));
      if(val === 1n)
        break;
    }
    const len = [...fact.values()].reduce((a, b) => a * (b + 1n), 1n);
    let i = 0n;
    return new Stream(this,
      (function*() {
        for(;;) {
          if(i >= len)
            return;
          let x = i;
          let res = 1n;
          for(const [prime, pow] of fact) {
            if(x === 0n)
              break;
            const p = x % (pow + 1n);
            res *= prime ** p;
            x /= (pow + 1n);
          }
          yield new Atom(res);
          i++;
        }
      })(),
      {
        len,
        skip: c => i += c
      }
    );
  },
  help: {
    en: ['All integer divisors of `_n`.'],
    cs: ['Všechny celočíselné dělitele čísla `_n`.'],
    cat: catg.numbers,
    src: 'n',
    ex: [['12.divisors', '[1,2,4,3,6,12]'],
      ['range(10000).iwhere(#.divisors.sum-#==#)', '[6,28,496,8128]', {en: 'perfect numbers', cs: 'dokonalá čísla'}]],
    see: 'factor'
  }
});

R.register(['isnumber', 'isnum'], {
  reqSource: true,
  numArg: 0,
  preeval() {
    const c = this.src.eval();
    return new Atom(c.type === types.N);
  },
  help: {
    en: ['Tests if `_input` is a number. Returns `true` or `false`.'],
    cs: ['Testuje, zda `_input` je číslem. Vrací `true` nebo `false`.'],
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
    cs: ['Číslice čísla π v desítkové soustavě.'],
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
    return this.prepareBase(scope, {}, {}, {_seed: scope.seed});
  },
  preeval() {
    if(this.args.length === 2) {
      /*** 2-arg: min, max - resolve in preeval() ***/
      const min = this.args[0].evalNum();
      const max = this.args[1].evalNum();
      return new Atom(rnd1(this.meta._seed, min, max));
    } else
      return this;
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
    cs: ['Forma bez argumentů: jeden náhodně vybraný prvek proudu `_source`.',
      'Forma s 1 argumentem: `_count` náhodně vybraných prvků.',
      'Forma se 2 argumenty: náhodně vybrané číslo mezi `_min` a `_max`.',
      'Forma se 3 argumenty: `_count` náhodných čísel mezi `_min` a `_max`.',
      '!V zájmu vnitřní konzistence všechny instance `random` a `rndstream` v rámci jednoho příkazu používají stejný pseudonáhodný generátor se stejným počátečním stavem. To může způsobit překvapivé chování.'],
    cat: [catg.numbers, catg.streams, catg.sources],
    ex: [['abc.subsets.random.cat', '"cefgnptuvw"', {en: 'random subset of alphabet', cs: 'náhodná podmnožina abecedy'}],
      ['"ABC".split.perm.random(3):cat', '["BCA","BAC","BCA"]'],
      ['random(1,6)', '4'],
      ['[rnd(1,6),rnd(1,6),rnd(1,6)]', '[3,3,3]', {en: 'watch out for this!', cs: 'pozor na toto!'}],
      ['random(1,6,3)', '[2,1,6]', {en: 'use this instead!', cs: 'použijte toto!'}]
    ],
    skipTest: true,
    src: 'source?',
    args: 'min??,max??,count?',
    see: 'rndstream'
  }
});

R.register(['rndstream', 'rnds'], {
  numArg: [0, 2],
  sourceOrArgs: 1,
  prepare(scope) {
    return this.prepareBase(scope, {}, {}, {_seed: scope.seed});
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
    cs: ['Forma bez argumentů: proud náhodně vybraných prvků proudu `_source`.',
      'Forma se 2 argumenty: proud náhodně vybraných čísel mezi `_min` a `_max`.',
      '!V zájmu vnitřní konzistence všechny instance `random` a `rndstream` v rámci jednoho příkazu používají stejný pseudonáhodný generátor se stejným počátečním stavem. To může způsobit překvapivé chování.'],
    cat: [catg.numbers, catg.streams, catg.sources],
    ex: [['rndstream(1,9)', '[6,7,3,2,9,5,2,3,6,4,...]'],
      ['rndstream(1,9)', '[3,2,7,5,1,4,1,8,6,7,...]', {en: 'new run gives new results', cs: 'nový běh dá nové výsledky'}],
      ['$1', '[6,7,3,2,9,5,2,3,6,4,...]', {en: 'but recalling history reuses the earlier state', cs: 'ale odkaz na historii replikuje též stav generátoru'}]
    ],
    skipTest: true,
    src: 'source?',
    args: 'min??,max??,count?',
    see: 'rndstream'
  }
});

R.register(['divmod', 'quotrem'], {
  reqSource: true,
  minArg: 1,
  maxArg: 2,
  preeval() {
    const inp = this.src.evalNum();
    const mod = this.args[0].evalNum({min: 1n});
    const base = this.args[1] ? this.args[1].evalNum() : 0n;
    let rem = (inp - base) % mod;
    rem = (rem >= 0n ? rem : rem + mod) + base;
    const div = (inp - rem) / mod;
    return new Node('array', this.token, null, [new Atom(div), new Atom(rem)]);
  },
  help: {
    en: ['Returns a pair comprising the quotient and remainder of dividing `_n` by `_k`.',
      'If `_base` is given, the remainder is given between `_base` and `_base+_modulus-1`, rather than between 0 and `_modulus-1`, shifting the quotient as needed.'],
    cs: ['Vrátí dvojici obsahující celočíselný podíl a zbytek po dělení `_n` číslem `_k`.',
      'Jestliže je zadáno `_base`, zbytek je dán mezi `_base` a `_base+_modulus-1` namísto mezi 0 a `_modulus-1` a podíl adekvátně upraven.'],
    cat: catg.numbers,
    src: 'n',
    args: 'k',
    ex: [['153.divmod(10)', '[15,3]'],
      ['[4,5,6,7]:divmod(5,1)', '[[0,4],[0,5],[1,1],[1,2]]']],
    see: ['mantexp', 'sqrem']
  }
});

R.register(['mantexp', 'manexp'], {
  reqSource: true,
  numArg: 1,
  preeval() {
    const inp = this.src.evalNum({min: 1n});
    const base = this.args[0].evalNum({min: 1n});
    let exp = 0n, rem = inp;
    while(rem % base === 0n) {
      rem /= base;
      exp++;
    }
    return new Node('array', this.token, null, [new Atom(rem), new Atom(exp)]);
  },
  help: {
    en: ['Returns a pair comprising the mantissa and exponent of `_n` in base `_base`, such that `_n = _mantissa * _base^_exponent` and `_mantissa.mod(_base) <> 0`.'],
    cs: ['Vrátí dvojici obsahující mantisu a exponent čísla `_n` v bázi `_base` takové, že `_n = _mantissa * _base^_exponent` a `_mantissa.mod(_base) <> 0`.'],
    cat: catg.numbers,
    src: 'n',
    args: 'base',
    ex: [['123000.mantexp(10)', '[123,3]']]
  }
});

R.register('dlog', {
  reqSource: true,
  maxArg: 1,
  preeval() {
    const inp = this.src.evalNum({min: 0n});
    const base = this.args[0]?.evalNum({min: 2n}) || 10n;
    for(let x = inp, exp = 0; ; x /= base, exp++)
      if(x === 0n)
        return new Atom(exp);
  },
  help: {
    en: ['Discrete logarithm: digit length of `_n` in base `_base` (default 10).'],
    cs: ['Diskrétní logaritmus: počet číslic čísla `_n` v soustavě o základu `_base` (výchozí `_base = 10`).'],
    cat: catg.numbers,
    src: 'n',
    args: 'base?',
    ex: [['123456.dlog', '6'],
      ['iota:dlog(2).index(10)', '512', {en: 'first 10-digit number in base 2', cs: 'první číslo desetimístné ve dvojkové soustavě'}]]
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
  preeval() {
    const inp = this.src.evalNum({min: 0n});
    return new Atom(sqrt(inp));
  },
  help: {
    en: ['Returns the square root of `_n` rounded below.'],
    cs: ['Odmocnina z čísla `_n` zakrouhlená dolů.'],
    cat: catg.numbers,
    src: 'n',
    ex: [['iota:sqrt', '[1,1,1,2,2,2,2,2,3,...]']],
    see: 'sqrem'
  }
});

R.register('sqrem', {
  reqSource: true,
  numArg: 0,
  preeval() {
    const inp = this.src.evalNum({min: 0n});
    const sqr = sqrt(inp);
    return new Node('array', this.token, null, [new Atom(sqr), new Atom(inp - sqr * sqr)]);
  },
  help: {
    en: ['Returns a pair comprising the integer square root of `_n` and the remaining difference.'],
    cs: ['Vrátí dvojici obsahující celočíselnou odmocninu čísla `_n` a zbývající rozdíl.'],
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
  preeval() {
    const inp = this.src.evalNum({min: 0n});
    const row = (sqrt(1n + 8n * inp) - 1n) / 2n;
    return new Node('array', this.token, null, [new Atom(row), new Atom(inp - row * (row + 1n) / 2n)]);
  },
  help: {
    en: ['Returns a pair `[_k,_l]` such that `_n = _k*(_k-1) + _l` and `_k <= _n`.'],
    cs: ['Vrátí dvojici čísel `[_k,_l]` takových, že `_n = _k*(_k-1) + _l` a `_k <= _n`.'],
    cat: catg.numbers,
    src: 'n',
    ex: [['iota:trirem', '[[1,0],[1,1],[2,0],[2,1],[2,2],...]'],
      ['$.iwhere(#[2]=0)', '[1,3,6,10,15,21,28,...]', {en: 'triangular numbers', cs: 'trojúhelníková čísla'}]]
  }
});
