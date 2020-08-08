const Language: LanguageType = require('./rules.json');

interface LanguageType {
  rules: Rules;
}

interface Rules {
  [name: string]: Rule;
}

type RuleName = string;

type Rule = RuleName | RuleConstraint | ConstraintsSet;

type ConstraintsSet = (RuleName | RuleConstraint)[];

type RuleConstraint =
  | TokenConstraint
  | OfTypeConstraint
  | ListOfTypeConstraint
  | PeekConstraint;

interface BaseRuleConstraint {
  butNot?: TokenConstraint | TokenConstraint[];
  optional?: boolean;
  eatNextOnFail?: boolean;
}

interface TokenConstraint extends BaseRuleConstraint {
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

interface OfTypeConstraint extends BaseRuleConstraint {
  ofType: Rule;
}

interface ListOfTypeConstraint extends BaseRuleConstraint {
  listOfType: RuleName;
}

interface PeekConstraint extends BaseRuleConstraint {
  peek: PeekCondition[];
}

interface PeekCondition {
  ifCondition?: TokenConstraint;
  expect: Rule;
  end?: boolean;
}

export {
  Language,
  LanguageType,
  Rules,
  Rule,
  RuleName,
  RuleConstraint,
  ConstraintsSet,
  TokenConstraint,
  OfTypeConstraint,
  ListOfTypeConstraint,
  PeekConstraint,
  PeekCondition,
};
