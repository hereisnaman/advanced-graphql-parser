import { Lexer, Source } from 'graphql';
import Language from './language';
import {
  Token,
  LexerToken,
  TokenKind,
  RuleKind,
  Styles,
  ParserRule,
  ParserState,
  ParserConfig,
  Rule,
  RuleName,
  RuleConstraint,
  TokenConstraint,
  OfTypeConstraint,
  ListOfTypeConstraint,
  PeekConstraint,
  ConstraintsSet,
  TokenParserRule,
  OfTypeParserRule,
  ListOfTypeParserRule,
  PeekParserRule,
  ConstraintsSetRule,
} from './types';

export class Parser {
  state: ParserState;
  lexer: Lexer;
  styles: Styles;
  config: ParserConfig;

  constructor({
    state = Parser.startState(),
    styles = {},
    config = {},
    source,
  }: {
    state?: ParserState;
    styles?: Styles;
    config?: ParserConfig;
    source: string;
  }) {
    this.state = state;
    this.styles = styles;
    this.config = { tabSize: 2, ...config };
    this.lexer = new Lexer(new Source(source));
  }

  static startState(): ParserState {
    return {
      rules: [
        {
          name: 'Document',
          state: 'Document',
          kind: 'ListOfTypeConstraint',
          ...(Language.rules.Document as ListOfTypeConstraint),
          expanded: false,
          depth: 1,
          step: 1,
        },
      ],
      levels: [],
      indentLevel: undefined,
      get kind(): string {
        return this.rules[this.rules.length - 1]?.state || '';
      },
      get step(): number {
        return this.rules[this.rules.length - 1]?.step || 0;
      },
    };
  }

  sol(): boolean {
    return (
      this.lexer.source.locationOffset.line === 1 &&
      this.lexer.source.locationOffset.column === 1
    );
  }

  parseToken(): Token {
    const rule = this.getNextRule();

    if (this.sol()) {
      this.state.indentLevel = Math.floor(
        this.indentation() / this.config.tabSize,
      );
    }

    if (!rule)
      return { kind: TokenKind.INVALID, style: this.styles[TokenKind.INVALID] };

    let token;

    if (this.lookAhead().kind === '<EOF>') {
      return { kind: TokenKind.EOF, style: this.styles[TokenKind.EOF] };
    }

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
        return { kind: TokenKind.INVALID };
    }

    if (token && token.kind === TokenKind.INVALID) {
      if (rule.optional) {
        this.state.rules.pop();
      } else {
        this.rollbackRule();
      }

      return this.parseToken() || token;
    }

    return token;
  }

  indentation(): number {
    const match = this.lexer.source.body.match(/\s*/);
    let indent = 0;

    if (match && match.length === 0) {
      const whitespaces = match[0];
      let pos = 0;
      while (whitespaces.length > pos) {
        if (whitespaces.charCodeAt(pos) === 9) {
          indent += 2;
        } else {
          indent++;
        }
        pos++;
      }
    }

    return indent;
  }

  private parseTokenConstraint(rule: TokenParserRule): Token {
    rule.expanded = true;

    const token: LexerToken = this.lookAhead();

    if (!this.matchToken(token, rule)) {
      return { kind: TokenKind.INVALID };
    }

    this.advanceToken();
    this.popMatchedRule();

    return this.transformLexerToken(token, rule);
  }

  private parseListOfTypeConstraint(rule: ListOfTypeParserRule): Token {
    this.pushRule(
      Language.rules[rule.listOfType],
      rule.depth + 1,
      rule.listOfType,
      1,
      rule.state,
    );

    rule.expanded = true;

    const token = this.parseToken();

    return token;
  }

  private parseOfTypeConstraint(rule: OfTypeParserRule): Token {
    if (rule.expanded) {
      this.popMatchedRule();
      return this.parseToken();
    }

    console.log('pushing', rule, rule.tokenName);
    this.pushRule(rule.ofType, rule.depth + 1, rule.tokenName, 1, rule.state);
    console.log('pushing of type complete');
    rule.expanded = true;

    const token = this.parseToken();

    return token;
  }

  private parsePeekConstraint(rule: PeekParserRule): Token {
    if (rule.expanded) {
      this.popMatchedRule();
      return this.parseToken();
    }

    while (!rule.matched && rule.index < rule.peek.length - 1) {
      rule.index++;
      const constraint = rule.peek[rule.index];

      let { ifCondition } = constraint;
      if (typeof ifCondition === 'string') {
        ifCondition = Language.rules[ifCondition] as TokenConstraint;
      }

      let token = this.lookAhead();
      if (ifCondition && this.matchToken(token, ifCondition)) {
        rule.matched = true;
        rule.expanded = true;
        this.pushRule(constraint.expect, rule.depth + 1, '', 1, rule.state);

        token = this.parseToken();

        return token;
      }
    }

    return { kind: TokenKind.INVALID };
  }

  private parseConstraintsSetRule(rule: ConstraintsSetRule): Token {
    if (rule.expanded) {
      this.popMatchedRule();
      return this.parseToken();
    }

    for (let index = rule.constraints.length - 1; index >= 0; index--) {
      this.pushRule(
        rule.constraints[index],
        rule.depth + 1,
        '',
        index + 1,
        rule.state,
      );
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

  private transformLexerToken(lexerToken: LexerToken, rule: ParserRule): Token {
    let token;

    if (lexerToken.kind === '<EOF>' || lexerToken.value !== undefined) {
      token = {
        kind: lexerToken.kind,
        value: lexerToken.value,
        style:
          this.styles[(rule as TokenParserRule).tokenName] ||
          this.styles[rule.name] ||
          this.styles[lexerToken.kind],
      };
    } else {
      token = {
        kind: TokenKind.PUNCTUATION,
        value: lexerToken.kind,
        style:
          this.styles[(rule as TokenParserRule).tokenName] ||
          this.styles[rule.name] ||
          this.styles[TokenKind.PUNCTUATION],
      };

      if (/^[{([]/.test(token.value)) {
        if (this.state.indentLevel !== undefined) {
          this.state.levels = this.state.levels.concat(
            this.state.indentLevel + 1,
          );
        }
      } else if (/^[})\]]/.test(token.value)) {
        this.state.levels.pop();
      }
    }

    return token;
  }

  private getNextRule(): ParserRule | null {
    return this.state.rules[this.state.rules.length - 1] || null;
  }

  private popMatchedRule() {
    const rule = this.state.rules.pop();

    const nextRule = this.getNextRule();

    if (
      nextRule.depth === rule.depth - 1 &&
      nextRule.expanded &&
      nextRule.kind === RuleKind.CONSTRAINTS_SET_ROOT
    )
      this.state.rules.pop();

    if (
      nextRule.depth === rule.depth - 1 &&
      nextRule.expanded &&
      nextRule.kind === RuleKind.LIST_OF_TYPE_CONSTRAINT
    ) {
      nextRule.expanded = false;
      nextRule.optional = true;
    }
  }

  private rollbackRule() {
    if (!this.state.rules.length) return;

    const popRule = () => {
      const lastPoppedRule = this.state.rules.pop();

      if (lastPoppedRule?.eatNextOnFail) {
        this.state.rules.pop();
      }
    };

    const poppedRule = this.state.rules.pop();

    let popped = 0;
    let nextRule = this.getNextRule();
    while (
      (poppedRule.kind !== RuleKind.LIST_OF_TYPE_CONSTRAINT ||
        nextRule?.expanded) &&
      nextRule?.depth > poppedRule.depth - 1
    ) {
      this.state.rules.pop();
      popped++;
      nextRule = this.getNextRule();
    }

    if (nextRule && nextRule.expanded) {
      if (nextRule.optional) {
        popRule();
      } else {
        if (
          nextRule.kind === RuleKind.LIST_OF_TYPE_CONSTRAINT &&
          popped === 1
        ) {
          this.state.rules.pop();
          return;
        }
        this.rollbackRule();
      }
    }
  }

  pushRule(
    rule: Rule,
    depth: number,
    name: string = '',
    step?: number,
    state?: string,
  ) {
    switch (this.getRuleKind(rule)) {
      case RuleKind.RULE_NAME:
        this.pushRule(
          Language.rules[rule as string],
          depth,
          name || (rule as string),
          step,
          state,
        );
        break;
      case RuleKind.CONSTRAINTS_SET:
        this.state.rules.push({
          name,
          depth,
          expanded: false,
          constraints: rule as ConstraintsSet,
          constraintsSet: true,
          kind: RuleKind.CONSTRAINTS_SET_ROOT,
          state: name || state || this.getNextRule().state,
          step: step || this.getNextRule().step + 1,
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
          state: name || state || this.getNextRule().state,
          step: step || this.getNextRule().step + 1,
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
          state: name || state || this.getNextRule().state,
          step: step || this.getNextRule().step + 1,
        });
        break;
      case RuleKind.TOKEN_CONSTRAINT:
        rule = rule as TokenConstraint;
        console.log('pushing token', rule, name);
        this.state.rules.push({
          ...rule,
          name,
          depth,
          expanded: false,
          kind: RuleKind.TOKEN_CONSTRAINT,
          state: rule.tokenName || state || this.getNextRule().state,
          step: step || this.getNextRule().step + 1,
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
          state: state || this.getNextRule().state,
          step: step || this.getNextRule().step + 1,
        });
        break;
    }
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
