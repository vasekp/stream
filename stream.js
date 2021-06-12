import {parse} from './parser.js';

import repl from 'repl';

repl.start({eval: parse});
