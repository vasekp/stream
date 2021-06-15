import {Node, Atom, Block, mainReg} from './base.js';
import Enum from './enum.js';

function asstr(s) {
  if(!(s instanceof Atom))
    throw 'not atom';
  const v = s.value;
  if(typeof v !== 'string')
    throw 'not string';
  return v;
}

const cc = Enum.fromArray(['digit', 'alpha']);
const tc = Enum.fromArray(['ident', 'number', 'string', 'space', 'open', 'close', 'oper', 'hash']);

const priority = Enum.fromObj({
  ':': 5,
  '.': 5,
  '*': 4,
  '/': 4,
  '+': 3,
  '-': 3,
  '~': 2,
  '%': 1
});

const operMap = Enum.fromObj({
  '+': 'plus',
  '-': 'minus',
  '*': 'times',
  '/': 'div',
  '~': 'join',
  '%': 'zip'
});

function charcls(c) {
  if(c >= '0' && c <= '9')
    return cc.digit;
  else if(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z')
    return cc.alpha;
  else
    return c;
}

function tokcls(c) {
  switch(c) {
    case ' ':
    case '\t':
    case '\n':
      return tc.space;
    case '(':
    case '[':
    case '{':
      return tc.open;
    case ')':
    case ']':
    case '}':
      return tc.close;
    case '.':
    case ':':
    case '+':
    case '-':
    case '*':
    case '/':
    case '%':
    case '~':
      return tc.oper;
    default:
      return c;
  }
}

function* tokenize(str) {
  const ss = Enum.fromArray(['base', 'ident', 'number', 'string', 'stresc', 'hash', 'hashd']);
  let state = ss.base;
  let accum = '';
  for(const c of str) {
    /*** strings ***/
    if(state === ss.string) {
      if(c === '"') {
        yield {value: accum, cls: tc.string};
        state = ss.base;
      }
      else if(c === '\\')
        state = ss.stresc;
      else
        accum += c;
      continue;
    } else if(state === ss.stresc) {
      accum += c;
      state = ss.string;
      continue;
    } else if(c === '"') {
      state = ss.string;
      accum = '';
      continue;
    }
    /*** accumulators ***/
    let cls = charcls(c);
    if(state === ss.number && cls === cc.digit) {
      accum += c;
      continue;
    } else if(state === ss.ident && (cls === cc.digit || cls === cc.alpha)) {
      accum += c;
      continue;
    } else if(state === ss.hash && cls === '#') {
      accum += c;
      continue;
    } else if((state === ss.hash || state === ss.hashd) && cls === cc.digit) {
      accum += c;
      state = ss.hashd;
      continue;
    }
    /*** accumulation did not happen: dispatch the result ***/
    if(state === ss.ident)
      yield {value: accum, cls: tc.ident};
    else if(state === ss.number)
      yield {value: accum, cls: tc.number};
    else if(state === ss.hash || state === ss.hashd)
      yield {value: accum, cls: tc.hash};
    /*** now handle the new character ***/
    switch(cls) {
      case cc.digit:
        state = ss.number;
        accum = c;
        break;
      case cc.alpha:
        state = ss.ident;
        accum = c;
        break;
      case '#':
        state = ss.hash;
        accum = c;
        break;
      default:
        yield {value: c, cls: tokcls(c)};
        state = ss.base;
    }
  }
  /*** end of input ***/
  switch(state) {
    case ss.ident:
      yield {value: accum, cls: tc.ident};
      break;
    case ss.number:
      yield {value: accum, cls: tc.number};
      break;
    case ss.hash:
    case ss.hashd:
      yield {value: accum, cls: tc.hash};
      break;
    case ss.string:
    case ss.stresc:
      throw 'unterminated string';
    case ss.base: // default:
      // nothing to do
  }
  yield {value: '', cls: tc.close};
}

class Stack {
  constructor() {
    this._stack = [];
  }

  get empty() {
    return !this._stack.length;
  }

  get topPrio() {
    return this._stack[0].prio;
  }

  get topOper() {
    return this._stack[0].oper;
  }

  reduce(oper, prio, term) {
    while(!this.empty && (this.topPrio > prio || this.topOper === '.' || this.topOper === ':')) {
      const entry = this._stack.shift();
      switch(entry.oper) {
        case '.':
          term = term.prepend(entry.terms[0]);
          break;
        case ':':
          term = new Node('foreach', entry.terms[0], [term]);
          break;
        default:
          term = new Node(operMap[entry.oper], null, [...entry.terms, term]);
          break;
      }
    }
    if(!this.empty && this.topPrio === prio && this.topOper !== oper) {
      const entry = this._stack.shift();
      term = new Node(operMap[entry.oper], null, [...entry.terms, term]);
    }
    return term;
  }

  addOper(oper, term) {
    const prio = priority[oper];
    term = this.reduce(oper, prio, term);
    if(!this.empty && this.topPrio === prio && this.topOper === oper)
      this._stack[0].terms.push(term);
    else
      this._stack.unshift({oper, prio, terms: [term]});
  }

  flatten(term) {
    return this.reduce('', -1, term);
  }
}

function parse0(iter, close, array) {
  const ss = Enum.fromArray(['base', 'sym', 'term', 'oper']);
  let state = ss.base;
  let term = null;
  let ret = [];
  let stack = new Stack();
  for(;;) {
    let {value: s, done} = iter.next();
    if(done)
      s = {value: '', cls: tc.close};
    switch(s.cls) {
      case tc.space:
        continue;
      case tc.number:
      case tc.string:
        if(state === ss.base || state === ss.oper)
          term = new Atom(s.cls === tc.number ? BigInt(s.value) : s.value);
        else
          throw `${s.cls} after ${state}`;
        state = ss.term;
        break;
      case tc.ident:
        if(state === ss.base || state === ss.oper)
          term = new Node(s.value);
        else
          throw `${s.cls} after ${state}`;
        state = ss.sym;
        break;
      case tc.hash:
        if(s.value === '#')
          term = new Node('id');
        else if(s.value === '##')
          term = new Node('in', null, [new Atom(0)]);
        else {
          const ix = Number(s.value.substr(1));
          if(Number.isNaN(ix))
            throw `bad hash ${s.value}`;
          else
            term = new Node('in', null, [new Atom(ix)]);
        }
        state = ss.term;
        break;
      case tc.open:
        if(state === ss.base || state === ss.oper) {
          switch(s.value) {
            case '[': {
              const args = parse0(iter, ']', true);
              term = new Node('array', null, args);
              state = ss.term;
              break; }
            case '(':
              term = parse0(iter, ')', false);
              state = ss.term;
              break;
            case '{': {
              const body = parse0(iter, '}', false);
              term = new Block(body);
              state = ss.sym;
              break; }
            default:
              throw `unknown open ${s.value}`;
          }
        } else if(state === ss.sym && s.value === '(') {
          term.args = parse0(iter, ')', true);
          state = ss.term;
        } else if(s.value === '{' && state === ss.oper) {
          const body = parse0(iter, '}', false);
          term = new Block(body);
          state = ss.sym;
        } else if(s.value === '[' && (state === ss.sym || state === ss.term)) {
          const args = parse0(iter, ']', false);
          term = new Node('part', term, [args]);
          state = ss.term;
        } else
          throw `${s.cls} after ${state}`;
        break;
      case tc.close:
        if(s.value !== close)
          throw s.value ? `unexpected close ${s.value}` : 'unexpected end of input';
        if(state === ss.base) {
          if(!array)
            throw 'empty not allowed';
          else
            return [];
        } else if(state === ss.oper)
          throw 'unfinished expression';
        else {
          term = stack.flatten(term);
          if(array) {
            ret.push(term);
            return ret;
          } else
            return term;
          return;
        }
      case tc.oper:
        if(state === ss.sym || state === ss.term)
          stack.addOper(s.value, term);
        else if(state === ss.base && s.value === '-')
          // Unary minus
          stack.addOper('-', new Atom(0));
        else
          throw `${s.cls} after ${state}`;
        term = null;
        state = ss.oper;
        break;
      case ',':
        if(!array)
          throw 'multi not allowed here';
        else if(state === ss.sym || state === ss.term)
          ret.push(stack.flatten(term));
        else
          throw `${s.cls} after ${state}`;
        state = ss.base;
        term = null;
        break;
      default:
        throw `unknown input ${s.value}`;
    }
  }
}

export function parse(str) {
  return parse0(tokenize(str), '', false);
}
