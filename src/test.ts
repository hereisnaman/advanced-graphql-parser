import { Language } from './language';
import { Parser } from './parser';

const parser = new Parser({
  state: { rules: [] as any[] },
  source: `
    query SomeQuery {
      some_field(some_arg: 123)
    }
    query SomeQuery {
      some_field(some_arg: 123)
    }
  `,
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

log('final result:', parser.state, tokens);
