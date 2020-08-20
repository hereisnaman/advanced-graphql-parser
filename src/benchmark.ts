import * as fs from 'fs';
import * as path from 'path';
import * as Benchmark from 'benchmark';
import { parse as gqlParser } from 'graphql';
import { Parser } from './parser';
import { CharacterStream, onlineParser } from 'graphql-language-service-parser';

const source = fs.readFileSync(
  path.resolve(__dirname, './kitchen-sink.graphql'),
  {
    encoding: 'utf8',
  },
);

const results = [];

const advancedParserSuite = new Benchmark.Suite('advanced parser suite', {
  onComplete: e =>
    console.log('advanced parser suite', results.push(e.target.stats)),
});

let a = 1;

advancedParserSuite.add(() => {
  const parser = new Parser({ source });
  let token = { kind: '<SOF>' };

  while (token.kind !== 'Invalid' && token.kind !== '<EOF>') {
    token = parser.parseToken();
  }

  console.log('done ', a);
  a++;
});

advancedParserSuite.run();

const graphqlParserSuite = new Benchmark.Suite('graphql parser suite', {
  onComplete: e =>
    console.log('graphql parser suite', results.push(e.target.stats)),
});

a = 1;

graphqlParserSuite.add(() => {
  gqlParser(source);

  console.log('done ', a);
  a++;
});

graphqlParserSuite.run();

const graphiqlParserSuite = new Benchmark.Suite('graphiql parser suite', {
  onComplete: e =>
    console.log('graphiql parser suite', results.push(e.target.stats)),
});

a = 1;

graphiqlParserSuite.add(() => {
  const parser = onlineParser();
  const state = parser.startState();
  const stream = new CharacterStream(source);

  while (parser.token(stream, state) !== 'invalidchar');

  console.log('done ', a);
  a++;
});

graphiqlParserSuite.run();

console.log(results);
