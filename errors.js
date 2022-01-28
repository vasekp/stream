export class BaseError extends Error {
  constructor(msg) {
    super();
    this.msg = msg;
  }
}

export class StreamError extends BaseError {
  constructor(msg, node) {
    super(msg);
    if(!node)
      throw new Error('StreamError created without node');
    this.node = node;
    this.pos = node.token.pos;
    this.len = node.token.value.length;
    this.desc = node.toString();
  }
}

export class TimeoutError extends BaseError {
  constructor(count) {
    super('Timed out');
    this.count = count;
  }
}

export class ParseError extends BaseError {
  constructor(msg, a1, a2) {
    super(msg);
    this.name = 'ParseError';
    this.pos = typeof a1 === 'object' ? a1.pos : a1;
    this.len = typeof a2 === 'object' ? a2.pos + a2.value.length - this.pos
      : typeof a2 === 'number' ? a2 - this.pos
      : typeof a1 === 'object' ? a1.value.length
      : 1;
  }
}
