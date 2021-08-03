import StreamSession from './interface.js';
import {help} from './help.js';

import repl from 'repl';
import * as fs from 'fs/promises';

const savedVars = await fs.readFile('.stream_vars')
  .then(cont => JSON.parse(cont))
  .catch(_ => {{}});

const sess = new StreamSession(savedVars);

const prompt = repl.start({eval: str => {
  str = str.replace(/[\n\r]+$/, '');
  if(!str.replace(/[ \t\n\r]/g, ''))
    return;
  const helpMatch = /^\?\s*(\w+)\s*$/.exec(str);
  if(helpMatch) {
    const topic = helpMatch[1];
    help.dumpTopic(topic);
    return;
  } else if(str === '?' || str === 'help') {
    console.log('Use \'? topic\' to see help on a specific command.');
    console.log('For general information visit: https://vasekp.github.io/spa3/js/stream/help.html');
    return;
  }
  const res = sess.eval(str);
  switch(res.result) {
    case 'ok':
      console.log(`${res.histName}: ${res.output}`);
      break;
    case 'error':
      if(res.errPos >= 0) {
        console.log(res.input);
        console.error(' '.repeat(res.errPos) + '^'.repeat(res.errLen));
      }
      console.error(res.errNode ? `${res.errNode}: ${res.error}` : res.error);
      break;
  }
}});

prompt.on('exit', e => {
  fs.open('.stream_vars', 'w')
    .then(f => f.writeFile(JSON.stringify(sess.close())))
    .catch(console.error);
});
