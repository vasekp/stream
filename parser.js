import {Node, Atom, Block} from './base.js';
import {ParseError} from './errors.js';
import Enum from './enum.js';

const cc = Enum.fromArray(['digit', 'alpha']);
const tc = Enum.fromArray(['ident', 'number', 'string', 'space', 'open', 'close', 'oper', 'spec']);

const priority = Enum.fromObj({
  ':': 10,
  '.': 10,
  '@': 10,
  '^': 9,
  '*': 8,
  '/': 8,
  '+': 7,
  '-': 7,
  '~': 6,
  '%': 5,
  '>': 4,
  '<': 4,
  '>=': 4,
  '<=': 4,
  '<>': 4,
  '==': 4,
  '&': 3,
  '|': 2,
  '=': 1
});

const operMap = Enum.fromObj({
  '+': 'plus',
  '-': 'minus',
  '*': 'times',
  '/': 'div',
  '^': 'pow',
  '~': 'join',
  '%': 'zip',
  '=': 'equal',
  '==': 'equal',
  '<': 'lt',
  '>': 'gt',
  '<>': 'ineq',
  '<=': 'le',
  '>=': 'ge',
  '&': 'and',
  '|': 'or'
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
    case '@':
    case '+':
    case '-':
    case '*':
    case '/':
    case '^':
    case '%':
    case '~':
    case '=':
    case '&':
    case '|':
      return tc.oper;
    default:
      return c;
  }
}

function* tokenize(str) {
  const ss = Enum.fromArray(['base', 'ident', 'number', 'string', 'stresc',
    'spec', 'specd', 'comp']);
  let state = ss.base;
  let accum = '';
  let read = 0;
  let accumStart;
  for(const c of str) {
    read++;
    /*** strings ***/
    if(state === ss.string) {
      if(c === '"') {
        yield {value: accum, cls: tc.string, pos: accumStart};
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
    }
    /*** other accumulators ***/
    let cls = charcls(c);
    if(state === ss.number && cls === cc.digit) {
      accum += c;
      continue;
    } else if(state === ss.ident && (cls === cc.digit || cls === cc.alpha)) {
      accum += c;
      continue;
    } else if(state === ss.spec && (cls === '#' || cls === '$')) {
      accum += c;
      continue;
    } else if((state === ss.spec || state === ss.specd) && cls === cc.digit) {
      accum += c;
      state = ss.specd;
      continue;
    } else if(state === ss.comp && (cls === '=' || cls === '>' || cls === '<')) {
      accum += c;
      yield {value: accum, cls: tc.oper, pos: accumStart};
      state = ss.base;
      continue;
    }
    /*** accumulation did not happen: dispatch the result ***/
    if(state === ss.ident)
      yield {value: accum, cls: tc.ident, pos: accumStart};
    else if(state === ss.number)
      yield {value: accum, cls: tc.number, pos: accumStart};
    else if(state === ss.spec || state === ss.specd)
      yield {value: accum, cls: tc.spec, pos: accumStart};
    else if(state === ss.comp)
      yield {value: accum, cls: tc.oper, pos: accumStart};
    /*** now handle the new character ***/
    switch(cls) {
      case cc.digit:
        state = ss.number;
        accum = c;
        accumStart = read - 1;
        break;
      case cc.alpha:
        state = ss.ident;
        accum = c;
        accumStart = read - 1;
        break;
      case '#':
      case '$':
        state = ss.spec;
        accum = c;
        accumStart = read - 1;
        break;
      case '"':
        state = ss.string;
        accum = '';
        accumStart = read - 1;
        break;
      case '>':
      case '<':
      case '=':
        state = ss.comp;
        accum = c;
        accumStart = read - 1;
        break;
      default:
        yield {value: c, cls: tokcls(c), pos: read - 1};
        state = ss.base;
    }
  }
  /*** end of input ***/
  switch(state) {
    case ss.ident:
      yield {value: accum, cls: tc.ident, pos: accumStart};
      break;
    case ss.number:
      yield {value: accum, cls: tc.number, pos: accumStart};
      break;
    case ss.spec:
    case ss.specd:
      yield {value: accum, cls: tc.spec, pos: accumStart};
      break;
    case ss.string:
    case ss.stresc:
      throw new ParseError('unterminated string', accumStart, read);
    case ss.base: // default:
      // nothing to do
  }
  yield {value: '', cls: tc.close, pos: read};
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
    return this._stack[0].token.value;
  }

  reduce(oper, prio, term) {
    while(!this.empty && (this.topPrio > prio
        || this.topOper === '.' || this.topOper === ':' || this.topOper === '@')) {
      const entry = this._stack.shift();
      switch(entry.token.value) {
        case '.':
          term = term.prepend(entry.terms[0]);
          break;
        case ':':
          term = new Node('foreach', entry.token, entry.terms[0], [term]);
          break;
        case '@':
          term = new Node('over', entry.token, entry.terms[0], [term]);
          break;
        default:
          term = new Node(operMap[entry.token.value], entry.token, null, [...entry.terms, term]);
          break;
      }
    }
    if(!this.empty && this.topPrio === prio && this.topOper !== oper) {
      const entry = this._stack.shift();
      term = new Node(operMap[entry.token.value], entry.token, null, [...entry.terms, term]);
    }
    return term;
  }

  addOper(token, term) {
    const prio = priority[token.value];
    term = this.reduce(token.value, prio, term);
    if(!this.empty && this.topPrio === prio && this.topOper === token.value)
      this._stack[0].terms.push(term);
    else
      this._stack.unshift({token, prio, terms: [term]});
  }

  addArgs(args) {
    // assert: topOper === '@'
    const entry = this._stack.shift();
    return new Node('over', entry.token, entry.terms[0], args);
  }

  flatten(term, prio = -1) {
    return this.reduce('', prio, term);
  }
}

function parse0(iter, open, close, array) {
  const ss = Enum.fromArray(['base', 'sym', 'term', 'oper']);
  let state = ss.base;
  let term = null;
  let ret = [];
  let stack = new Stack();
  for(;;) {
    let {value: s, done} = iter.next();
    if(done)
      throw new Error('internal parser error');
    switch(s.cls) {
      case tc.space:
        continue;
      case tc.number:
      case tc.string:
        if(state === ss.base || state === ss.oper)
          term = new Atom(s.cls === tc.number ? BigInt(s.value) : s.value);
        else
          throw new ParseError(`"${s.value}" can't appear here`, s);
        state = ss.term;
        break;
      case tc.ident:
        if(state === ss.base || state === ss.oper) {
          if(s.value === 'true' || s.value === 'false') {
            term = new Atom(s.value === 'true');
            state = ss.term;
          } else {
            term = new Node(s.value, s);
            state = ss.sym;
          }
        } else
          throw new ParseError(`"${s.value}" can't appear here`, s);
        break;
      case tc.spec:
        if(state === ss.base || state === ss.oper) {
          if(s.value === '#')
            term = new Node('#id', s);
          else if(s.value === '##')
            term = new Node('#in', s, null, []);
          else if(s.value === '$')
            term = new Node('#history', s, null, []);
          else {
            const ix = Number(s.value.substr(1));
            if(Number.isNaN(ix) || ix === 0)
              throw new ParseError(`malformed identifier "${s.value}"`, s);
            else
              term = new Node(s.value[0] === '#' ? '#in' : '#history', s, null, [new Atom(ix)]);
          }
          state = ss.term;
        } else
          throw new ParseError(`"${s.value}" can't appear here`, s);
        break;
      case tc.open:
        if(state === ss.base || state === ss.oper) {
          switch(s.value) {
            case '[': {
              const args = parse0(iter, s, ']', true);
              term = new Node('array', s, null, args);
              state = ss.term;
              break; }
            case '(':
              if(state === ss.oper && stack.topOper === '@') {
                const args = parse0(iter, s, ')', true);
                term = stack.addArgs(args);
              } else
                term = parse0(iter, s, ')', false);
              state = ss.term;
              break;
            case '{': {
              const body = parse0(iter, s, '}', false);
              term = new Block('block', s, body);
              state = ss.sym;
              break; }
            default:
              throw new Error(`internal parser error: tc.open "${s.value}"`);
          }
        } else if(state === ss.sym && s.value === '(') {
          const args = parse0(iter, s, ')', true);
          term = term.modify({args});
          state = ss.term;
        } else if(s.value === '{' && state === ss.oper) {
          const body = parse0(iter, s, '}', false);
          term = new Block('block', s, body);
          state = ss.sym;
        } else if(s.value === '[' && (state === ss.sym || state === ss.term)) {
          const args = parse0(iter, s, ']', true);
          term = new Node('part', s, null, [term, ...args]);
          state = ss.term;
        } else
          throw new ParseError(`"${s.value}" can't appear here`, s);
        break;
      case tc.close:
        if(s.value !== close)
          throw s.value
            ? new ParseError(`unexpected "${s.value}"`, s)
            : new ParseError(`unfinished expression`, open, s);
        if(state === ss.base) {
          if(!array)
            throw new ParseError(`empty input not allowed here`, open, s);
          else if(ret.length !== 0)
            throw new ParseError(`"${s.value}" can't appear here`, s);
          else
            return [];
        } else if(state === ss.oper)
          throw new ParseError(`unfinished expression`, open, s);
        else {
          term = stack.flatten(term);
          if(array) {
            ret.push(term);
            return ret;
          } else
            return term;
        }
      case tc.oper:
        if(state === ss.sym || state === ss.term)
          stack.addOper(s, term);
        else if(state === ss.base && s.value === '-')
          // Unary minus
          stack.addOper(s, new Atom(0));
        else
          throw new ParseError(`"${s.value}" can't appear here`, s);
        term = null;
        state = ss.oper;
        break;
      case ',':
        if(!array)
          throw new ParseError(`multi-part expression not allowed here`, s);
        else if(state === ss.sym || state === ss.term)
          ret.push(stack.flatten(term));
        else
          throw new ParseError(`"${s.value}" can't appear here`, s);
        state = ss.base;
        term = null;
        break;
      default:
        throw new ParseError(`unknown token "${s.value}"`, s);
    }
  }
}

export default function parse(str) {
  try {
    return parse0(tokenize(str), 0, '', false);
  } catch(e) {
    if(e instanceof ParseError)
      e.str = str;
    throw e;
  }
}
