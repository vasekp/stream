import {StreamError} from '../errors.js';
import {Node, Atom, Block, Stream, types, debug, compareStreams} from '../base.js';
import R from '../register.js';
import parse from '../parser.js';

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
    for(const ident of idents)
      reg.clear(ident);
    return new Atom("");
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
