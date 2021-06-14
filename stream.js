import './filters/basic.js';
import {parse} from './parser.js';

import repl from 'repl';

repl.start({eval: e => console.log(parse(e).writeout())});
