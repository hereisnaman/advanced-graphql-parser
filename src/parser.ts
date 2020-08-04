import {
  Language,
  Rule,
  RuleConstraint,
  RuleName,
  ListOfTypeConstraint,
} from './language';
import { Lexer, Source } from 'graphql';

interface ParserRule extends RuleConstraint {
  name: string;
  depth: number;
  nodeRoot: boolean = false;
  constraintsSet: boolean = false;
}

interface ParserState {
  rules: ParserRule[];
}

class Parser {
  constructor({ state: ParserState, source: string }) {
    this.state = state;
    this.lexer = new Lexer(new Source(source));
  }

  static intialState(): ParserState {
    return {
      rules: [
        { name: 'Document', ...Languages.Document, nodeRoot: true, depth: 1 },
      ],
    };
  }

  parseToken() {
    const rule = this.getNextRule();

    switch (this.getRuleKind(rule)) {
      case 'ListOfType':
        return this.parseListOfType();
      case 'TokenConstraint':
        return this.parseTokenConstraint(rule);
    }
  }

  private parseRuleName(ruleName: RuleName) {
    this.popRule();
    this.pushRule(Language.rules[ruleName]);
    return this.parseToken();
  }

  private parseListOfType(rule: ListOfTypeConstraint) {
    rule.nodeRoot = true;
    this.pushRule(Language.rules[rule.listOfType]);
    return this.parseToken();
  }

  private parseTokenConstraint(rule: ParserRule) {
    const token = this.lookAhead();

    if (
      (rule.ofValue && token.value !== rule.ofValue) ||
      (rule.oneOf && !rule.oneOf.includes(token.value))
    ) {
      if (rule.optional) {
        this.popRule(true);
        return this.parseToken();
      }

      return { kind: 'Invalid' };
    }

    this.advanceToken();

    this.popRule();

    return token;
  }

  private getNextRule(): ParserRule {
    return this.state.rules[this.state.rule.length - 1];
  }

  private getRuleKind(rule: Rule) {
    if (Array.isArray(rule)) {
      return 'ConstraintsSet';
    }

    if (typeof rule === 'string') {
      return 'RuleName';
    }

    if (Object.hasOwnProperty(rule, 'ofType')) {
      return 'OfType';
    }

    if (Object.hasOwnProperty(rule, 'listofType')) {
      return 'ListOfType';
    }

    if (Object.hasOwnProperty(rule, 'peek')) {
      return 'PeekConstraint';
    }

    if (Object.hasOwnProperty(rule, 'token')) {
      return 'TokenConstraint';
    }

    return 'Invalid';
  }

  private popRule(mismatch: boolean = false) {
    this.state.rules.pop();

    const nextRule = this.getNextRule();

    if (nextRule.nodeRoot) {
      if (this.getRuleKind(nextRule) === 'ListOfType') {
        if (mismatch) {
          this.popRule();
        }
      } else {
        this.popRule();
      }
    }
  }

  private pushRule(rule: Rule, depth: number, name: string = '') {
    switch (this.getRuleKind(rule)) {
      case 'RuleName':
        this.pushRule(Language.rules[rule], rule, depth);
        break;
      case 'ConstraintsSet':
        this.state.rules.push({
          name,
          depth,
          nodeRoot: true,
          constraintsSet: true,
        });

        for (let index = rule.length - 1; index >= 0; index--) {
          this.pushRule(rule[index], depth + 1);
        }
        break;
      case 'OfType':
        this.state.rules.push({
          name,
          depth,
          nodeRoot: true,
          ...rule,
        });
        this.pushRule(rule.ofType, depth + 1);
        break;
      case 'ListOfType':
        this.state.rules.push({
          name,
          depth,
          nodeRoot: true,
          ...rule,
        });
        this.pushRule(rule.listOfType, depth + 1, rule.listOfType);
        break;
      case 'TokenConstraint':
        this.state.rules.push({
          name,
          depth,
          nodeRoot: true,
          ...rule,
        });
        break;
    }
  }

  private advanceToken(): Token {
    return this.lexer.advance();
  }

  private lookAhead(): Token {
    return this.lexer.lookAhead();
  }
}
