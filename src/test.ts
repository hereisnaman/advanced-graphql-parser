import * as fs from 'fs';
import * as path from 'path';
import { Language } from './language';
import { Parser } from './parser';

const source = fs.readFileSync(
  path.resolve(__dirname, './github.graphql'),
  { encoding: 'utf8' },
);

const parser = new Parser({
  state: { rules: [] as any[] },
  source,
  /*`
    query SomeQuery {
      some_field(some_arg: 123, another_arg: 456)
    }
    query SomeQuery {
      some_field(some_arg: 123, another_arg: 456)
      ... SomeFragment
    }
  `,*/
});

parser.pushRule('Document', 1);

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
  tokens.push(token);

  //  console.log(token, parser.state.rules);
}

log('final result:', parser.state);
tokens.forEach((token, index) => log(index, token));
