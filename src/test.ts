import * as fs from 'fs';
import * as path from 'path';
import Language from './language';
import { Parser } from './parser';

const source = fs.readFileSync(path.resolve(__dirname, './github.graphql'), {
  encoding: 'utf8',
});

const parser = new Parser({
  source: `
    fragment SomeFragment on SomeType @SomeDirective {
      some_field(a: null)
    }
  `,
  styles: require('./styles.json'),
});

//parser.pushRule('Document', 1, '', 1);

console.log(parser.state);
const tokens = [];

const log = global.console.log;
//global.console.log = () => {};

while (
  !tokens.length ||
  (tokens[tokens.length - 1]?.kind !== '<EOF>' &&
    tokens[tokens.length - 1]?.kind !== 'Invalid')
) {
  const token = parser.parseToken();
  tokens.push({
    ...token,
    type: parser.state.kind,
    step: parser.state.step,
    levels: parser.state.levels,
  });

  //  console.log(token, parser.state.rules);
}

log('final result:', parser.state);
tokens.forEach((token, index) => log(index, token));
