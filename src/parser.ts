import {
  Language,
  Rule,
  RuleConstraint,
  ConstraintsSet,
  RuleName,
  TokenConstraint,
  OfTypeConstraint,
  ListOfTypeConstraint,
  PeekConstraint,
} from './language';
import { Lexer, Source } from 'graphql';

const RuleKind = {
  TOKEN_CONSTRAINT: 'TokenConstraint',
  OF_TYPE_CONSTRAINT: 'OfTypeConstraint',
  LIST_OF_TYPE_CONSTRAINT: 'ListOfTypeConstraint',
  PEEK_CONSTRAINT: 'PeekConstraint',
  CONSTRAINTS_SET: 'ConstraintsSet',
  CONSTRAINTS_SET_ROOT: 'ConstraintsSetRoot',
  RULE_NAME: 'RuleName',
  INVALID: 'Invalid',
};

interface BaseParserRule {
  kind: string;
  name: string;
  depth: number;
  nodeRoot?: boolean;
  optional?: boolean;
  expanded: boolean;
  eatNextOnFail?: boolean;
}

interface TokenParserRule extends BaseParserRule, TokenConstraint {}

interface OfTypeParserRule extends BaseParserRule, OfTypeConstraint {}

interface ListOfTypeParserRule extends BaseParserRule, ListOfTypeConstraint {}

interface PeekParserRule extends BaseParserRule, PeekConstraint {
  index: number;
  matched: boolean;
}

interface ConstraintsSetRule extends BaseParserRule {
  constraintsSet: boolean;
  constraints: ConstraintsSet;
}

export type ParserRule =
  | ConstraintsSetRule
  | TokenParserRule
  | OfTypeParserRule
  | ListOfTypeParserRule
  | PeekParserRule;

interface ParserState {
  rules: ParserRule[];
}

interface Token {
  kind: string;
  value?: string;
}

export class Parser {
  state: ParserState;
  lexer: Lexer;

  constructor({
    state = Parser.initialState(),
    source,
  }: {
    state: ParserState;
    source: string;
  }) {
    this.state = state;
    this.lexer = new Lexer(new Source(source));
  }

  static initialState(): ParserState {
    return {
      rules: [
        {
          name: 'Document',
          kind: 'ListOfTypeConstraint',
          ...(Language.rules.Document as ListOfTypeConstraint),
          nodeRoot: true,
          expanded: false,
          depth: 1,
        },
      ],
    };
  }

  parseToken() {
    console.log('parsing');
    const rule = this.getNextRule();

    if (!rule) return null;

    let token;

    switch (rule.kind) {
      case RuleKind.TOKEN_CONSTRAINT:
        token = this.parseTokenConstraint(rule as TokenParserRule);
        break;
      case RuleKind.LIST_OF_TYPE_CONSTRAINT:
        token = this.parseListOfTypeConstraint(rule as ListOfTypeParserRule);
        break;
      case RuleKind.OF_TYPE_CONSTRAINT:
        token = this.parseOfTypeConstraint(rule as OfTypeParserRule);
        break;
      case RuleKind.PEEK_CONSTRAINT:
        token = this.parsePeekConstraint(rule as PeekParserRule);
        break;
      case RuleKind.CONSTRAINTS_SET_ROOT:
        token = this.parseConstraintsSetRule(rule as ConstraintsSetRule);
        break;
      default:
        return { kind: '<EOF>' };
    }

    if (token && token.kind === 'Invalid') {
      if (rule.optional) {
        console.log('popped 1:', this.state.rules.pop());
      } else {
        this.rollbackRule();
      }

      return this.parseToken() || token;
    }

    console.log('returning token: ', token);

    return token;
  }

  private parseTokenConstraint(rule: TokenParserRule) {
    const token = this.lookAhead();

    if (!this.matchToken(token, rule)) {
      return { kind: 'Invalid' };
    }

    this.advanceToken();

    this.state.rules.pop();

    return token;
  }

  private parseListOfTypeConstraint(rule: ListOfTypeParserRule) {
    this.pushRule(
      Language.rules[rule.listOfType],
      rule.depth + 1,
      rule.listOfType,
    );
    rule.expanded = true;

    const token = this.parseToken();

    return token;
  }

  private parseOfTypeConstraint(rule: OfTypeParserRule) {
    this.pushRule(rule.ofType, rule.depth + 1);
    rule.expanded = true;

    const token = this.parseToken();

    return token;
  }

  private parsePeekConstraint(rule: PeekParserRule) {
    while (!rule.matched && rule.index < rule.peek.length - 1) {
      rule.index++;
      const constraint = rule.peek[rule.index];

      let { ifCondition } = constraint;
      if (typeof ifCondition === 'string') {
        ifCondition = Language.rules[ifCondition] as TokenConstraint;
      }

      let token = this.lookAhead();
      if (!ifCondition || this.matchToken(token, ifCondition)) {
        console.log('Matched condition', rule, constraint, token);
        rule.matched = true;
        rule.expanded = true;
        this.pushRule(constraint.expect, rule.depth + 1);

        token = this.parseToken();

        return token;
      }
    }

    return { kind: 'Invalid' };
  }

  private parseConstraintsSetRule(rule: ConstraintsSetRule) {
    for (let index = rule.constraints.length - 1; index >= 0; index--) {
      this.pushRule(rule.constraints[index], rule.depth + 1);
    }
    rule.expanded = true;

    return this.parseToken();
  }

  private matchToken(token: Token, rule: TokenConstraint): boolean {
    if (token.value) {
      if (
        (rule.ofValue && token.value !== rule.ofValue) ||
        (rule.oneOf && !rule.oneOf.includes(token.value)) ||
        (!rule.ofValue && !rule.oneOf && token.kind !== rule.token)
      ) {
        console.log(token, rule);
        return false;
      }

      return this.butNot(token, rule);
    }

    if (token.kind !== rule.token) {
      return false;
    }

    return this.butNot(token, rule);
  }

  private butNot(token: Token, rule: RuleConstraint): boolean {
    if (rule.butNot) {
      if (Array.isArray(rule.butNot)) {
        if (
          rule.butNot.reduce(
            (matched, constraint) =>
              matched || this.matchToken(token, constraint),
            false,
          )
        ) {
          return false;
        }

        return true;
      }

      return !this.matchToken(token, rule.butNot);
    }

    return true;
  }

  private getNextRule(): ParserRule | null {
    return this.state.rules[this.state.rules.length - 1] || null;
  }

  private rollbackRule() {
    if (!this.state.rules.length) return;

    const popRule = () => {
      const lastPoppedRule = this.state.rules.pop();

      console.log('popped2 : ', lastPoppedRule);

      if (lastPoppedRule?.eatNextOnFail) {
        console.log('popped3 : ', this.state.rules.pop());
        let i = 0;
        const log = console.log;
        global.console.log = (...args) => {
          i++;
          if (i < 50) {
            log(...args);
          }
        };
        //console.log('\n\n\n\n\n', this.state.rules);
      }
    };

    const poppedRule = this.state.rules.pop();
    console.log('popped4 : ', poppedRule);

    let popped = 0;
    while (this.getNextRule()?.depth > poppedRule.depth - 1) {
      console.log('popped5 : ', this.state.rules.pop());
      popped++;
    }

    const nextRule = this.getNextRule();

    if (nextRule && nextRule.expanded) {
      if (nextRule.optional) {
        popRule();
      } else {
        if (
          nextRule.kind === RuleKind.LIST_OF_TYPE_CONSTRAINT &&
          popped === 1
        ) {
          console.log('popped6 : ', this.state.rules.pop());
          return;
        }
        this.rollbackRule();
      }
    }
  }

  pushRule(rule: Rule, depth: number, name: string = '') {
    switch (this.getRuleKind(rule)) {
      case RuleKind.RULE_NAME:
        this.pushRule(Language.rules[rule as string], depth, rule as string);
        return;
      case RuleKind.CONSTRAINTS_SET:
        this.state.rules.push({
          name,
          depth,
          expanded: false,
          constraints: rule as ConstraintsSet,
          constraintsSet: true,
          kind: RuleKind.CONSTRAINTS_SET_ROOT,
        });
        break;
      case RuleKind.OF_TYPE_CONSTRAINT:
        rule = rule as OfTypeConstraint;
        this.state.rules.push({
          ...rule,
          name,
          depth,
          expanded: false,
          kind: RuleKind.OF_TYPE_CONSTRAINT,
        });
        break;
      case RuleKind.LIST_OF_TYPE_CONSTRAINT:
        rule = rule as ListOfTypeConstraint;
        this.state.rules.push({
          ...rule,
          name,
          depth,
          expanded: false,
          kind: RuleKind.LIST_OF_TYPE_CONSTRAINT,
        });
        break;
      case RuleKind.TOKEN_CONSTRAINT:
        rule = rule as TokenConstraint;
        this.state.rules.push({
          ...rule,
          name,
          depth,
          expanded: false,
          kind: RuleKind.TOKEN_CONSTRAINT,
        });
        break;
      case RuleKind.PEEK_CONSTRAINT:
        rule = rule as PeekConstraint;
        this.state.rules.push({
          ...rule,
          name,
          depth,
          index: -1,
          matched: false,
          expanded: false,
          kind: RuleKind.PEEK_CONSTRAINT,
        });
        break;
    }

    console.log('pushed', this.getNextRule());
  }

  private getRuleKind(rule: Rule | ParserRule): string {
    if (Array.isArray(rule)) {
      return RuleKind.CONSTRAINTS_SET;
    }

    if ((rule as ConstraintsSetRule).constraintsSet) {
      return RuleKind.CONSTRAINTS_SET_ROOT;
    }

    if (typeof rule === 'string') {
      return RuleKind.RULE_NAME;
    }

    if (rule.hasOwnProperty('ofType')) {
      return RuleKind.OF_TYPE_CONSTRAINT;
    }

    if (rule.hasOwnProperty('listOfType')) {
      return RuleKind.LIST_OF_TYPE_CONSTRAINT;
    }

    if (rule.hasOwnProperty('peek')) {
      return RuleKind.PEEK_CONSTRAINT;
    }

    if (rule.hasOwnProperty('token')) {
      return RuleKind.TOKEN_CONSTRAINT;
    }

    return RuleKind.INVALID;
  }

  private advanceToken(): Token {
    return this.lexer.advance();
  }

  private lookAhead(): Token {
    return this.lexer.lookahead();
  }
}
