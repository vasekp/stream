import {StreamError} from '../errors.js';
import {Node, Atom, Block, Stream, types, debug, compareStreams} from '../base.js';
import R from '../register.js';
import parse from '../parser.js';
import {catg} from '../help.js';

R.register('clear', {
  reqSource: false,
  minArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    this.args.forEach(arg => arg.checkType(types.symbol));
    const mod = {src: null};
    if(scope.register)
      mod.meta = {...this.meta, _register: scope.register};
    return this.modify(mod).check(scope.partial);
  },
  eval() {
    const reg = this.meta._register;
    if(!reg)
      throw new StreamError('out of scope');
    const idents = this.args.map(arg => arg.ident);
    const ret = [];
    for(const ident of idents)
      if(reg.clear(ident, true))
        ret.push(new Atom(ident));
    return new Stream(this, ret.values());
  },
  help: {
    en: ['Clears one or more variables. The affected identifiers are returned as a list of strings.',
      '-Clearing a nonexistent variable is not an error.',
      '!This command clears session-wide as well as persistent assignments.'],
    cz: ['Smaže jedno nebo více přiřazení. Změněné identifikátory jsou navráceny jako seznam řetězců.',
      '-Pokus o smazání neexistující proměnné není chyba.',
      '!Tento příkaz maže dočasné i trvalé proměnné.'],
    cat: catg.base,
    ex: [['a=3', '["a"]'], ['clear(a)', '["a"]'], ['a', '!symbol "a" undefined']],
    args: 'vars...',
    see: ['restore', 'vars']
  }
});

R.register('vars', {
  reqSource: false,
  numArg: 0,
  prepare(scope) {
    const mod = {src: null};
    if(scope.register)
      mod.meta = {...this.meta, _register: scope.register};
    return this.modify(mod).check(scope.partial);
  },
  eval() {
    const reg = this.meta._register;
    if(!reg)
      throw new StreamError('out of scope');
    return new Stream(this,
      (function*(self) {
        for(const [key, node] of reg.dump())
          yield new Node('array', self.token, null,
            [new Atom(key), new Atom(node.toString())]);
      })(this)
    );
  },
  help: {
    en: ['Lists all user-defined variables and their assignments.'],
    cz: ['Seznam všech uživatelských proměnných a jejich hodnot.'],
    cat: catg.base,
    ex: [['a=b=10', '["a","b"]'], ['vars', '[["a","10"], ["b","10"]]']]
  }
});

R.register('desc', {
  reqSource: true,
  numArg: 0,
  prepare(scope) {
    const src = this.src
      ? this.src.prepare({...scope, partial: true, expand: !scope.partial})
      : scope.src;
    const nnode = this.modify({src}).check(scope.partial);
    if(scope.partial)
      return nnode;
    else
      return new Atom(nnode.src.toString());
  },
  help: {
    en: ['Provides a valid input-form description of the input stream.'],
    cz: ['Popíše proud na vstupu formou validního vstupního příkazu.'],
    cat: catg.base,
    ex: [['`iota`:`range`(#):desc', '["r(1)","r(2)","r(3)",...]']]
  }
});

/*R.register('parse', {
  sourceOrArgs: 1,
  maxArg: 1,
  prepare(scope) {
    const nnode = this.prepareAll(scope);
    if(scope.partial)
      return nnode;
    const src = (nnode.args[0] || nnode.src).evalAtom(types.S);
    return parse(src).prepare({...scope, src: undefined, args: undefined});
  }
});*/

R.register('save', {
  minArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => {
      arg.checkType([types.symbol, types.expr]);
      if(arg.type === types.symbol)
        return arg;
      else if(arg.token.value !== '=')
        throw new StreamError(`expected assignment, found ${arg.desc()}`);
      else
        return arg.toAssign().prepare({...scope, src, partial: true, expand: !scope.partial});
    });
    const mod = {src: null, args};
    if(scope.register)
      mod.meta = {...this.meta, _register: scope.register};
    return this.modify(mod).check(scope.partial);
  },
  eval() {
    const innerReg = this.meta._register;
    if(!innerReg)
      throw new Error('register not defined');
    const outerReg = innerReg.parent;
    if(outerReg === R || outerReg.parent !== R)
      throw new Error('must be called in outer scope');
    const ret = [];
    this.args.forEach(arg => {
      if(arg.type === types.symbol) {
        const rec = innerReg.find(arg.ident);
        if(rec?.body) {
          outerReg.register(arg.ident, rec);
          ret.push(new Atom(arg.ident));
        }
      } else
        ret.push(...arg.prepare({register: outerReg}).eval());
    });
    return new Stream(this, ret.values());
  },
  help: {
    en: ['Saves a temporary variable or variables into a persistent register.',
      '-An assignment can be put directly into `save`.'],
    cz: ['Uloží dočasnou uživatelskou proměnnou do trvalého registru.',
      '-Přiřazení může být zapsáno přímo jako argument `save`.'],
    args: 'vars|assign',
    ex: [['a=3', '["a"]'], ['save(a)', '["a"]'], ['save(b=3)', '["b"]']],
    see: ['restore', 'clear']
  }
});

R.register(['restore', 'revert'], {
  minArg: 1,
  prepare(scope) {
    const src = this.src ? this.src.prepare(scope) : scope.src;
    const args = this.args.map(arg => arg.checkType(types.symbol));
    const mod = {src: null, args};
    if(scope.register)
      mod.meta = {...this.meta, _register: scope.register};
    return this.modify(mod).check(scope.partial);
  },
  eval() {
    const innerReg = this.meta._register;
    if(!innerReg)
      throw new Error('register not defined');
    const outerReg = innerReg.parent;
    if(outerReg === R || outerReg.parent !== R)
      throw new Error('must be called in outer scope');
    const ret = [];
    this.args.forEach(arg => {
      if(innerReg.clear(arg.ident))
        ret.push(new Atom(arg.ident));
    });
    return new Stream(this, ret.values());
  },
  help: {
    en: ['Clears one or more temporary variables, effectively restoring its assignment in the persistent register.',
      '-If a variable has no persistent assignment, it is undefined.'],
    cz: ['Smaže záznam jedné nebo více proměnných v dočasném registru. Pokud má proměnná záznam v trvalém registru, zastíněná hodnota se tak zpřístupní.',
      '-Jestliže trvalý záznam stejného jména neexistuje, proměnná bude nedefinovaná.'],
    args: 'vars...',
    ex: [['save(a=1)', '["a"]'], ['a=2', '["a"]'], ['restore(a)', '["a"]'], ['a', '1']],
    see: ['save', 'clear']
  }
});
