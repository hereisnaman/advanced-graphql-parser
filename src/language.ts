const language: Language = require('./language.json');

interface Language {
  rules: Rules;
}

interface Rules {
  [name: string]: Rule;
}

export type RuleName = keyof Rules;

export type Rule = RuleName | RuleConstraint | (RuleName | RuleConstraint)[];

export type RuleConstraint =
  | TokenConstraint
  | OfTypeConstraint
  | ListOfTypeConstraint
  | PeekConstraint;

interface BaseRuleConstraint {
  butNot?: TokenConstraint | TokenConstraint[];
  optional?: boolean;
}

export interface TokenConstraint extends BaseRuleConstraint {
  token:
    | '!'
    | '$'
    | '&'
    | '('
    | ')'
    | '...'
    | ':'
    | '='
    | '@'
    | '['
    | ']'
    | '{'
    | '}'
    | '|'
    | 'Name'
    | 'Int'
    | 'Float'
    | 'String'
    | 'BlockString'
    | 'Comment';
  ofValue?: string;
  oneOf?: string[];
}

export interface OfTypeConstraint extends BaseRuleConstraint {
  ofType: Rule;
}

export interface ListOfTypeConstraint extends BaseRuleConstraint {
  listOfType: RuleName;
}

export interface PeekConstraint {
  ifCondition?: RuleConstraint;
  expect: Rule;
  end?: boolean;
}

export { language as Language };
