import type { TableFrameExpression } from "../../../../contracts/index.js";

type TableFormulaToken =
  | { type: "number"; value: number }
  | { type: "field"; value: string }
  | { type: "identifier"; value: string }
  | { type: "operator"; value: "+" | "-" | "*" | "/" }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "comma" };

export interface TableFormulaCompileResult {
  expression: TableFrameExpression | null;
  error?: string;
}

type TableFormulaParserState = {
  index: number;
  tokens: TableFormulaToken[];
};

function tokenizeTableFormulaExpression(expression: string): TableFormulaToken[] | null {
  const tokens: TableFormulaToken[] = [];
  let index = 0;

  while (index < expression.length) {
    const character = expression[index];

    if (!character) {
      break;
    }

    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    if (character === "[") {
      const endIndex = expression.indexOf("]", index + 1);

      if (endIndex < 0) {
        return null;
      }

      const field = expression.slice(index + 1, endIndex).trim();

      if (!field) {
        return null;
      }

      tokens.push({ type: "field", value: field });
      index = endIndex + 1;
      continue;
    }

    if (character === "(") {
      tokens.push({ type: "lparen" });
      index += 1;
      continue;
    }

    if (character === ")") {
      tokens.push({ type: "rparen" });
      index += 1;
      continue;
    }

    if (character === ",") {
      tokens.push({ type: "comma" });
      index += 1;
      continue;
    }

    if (character === "+" || character === "-" || character === "*" || character === "/") {
      tokens.push({ type: "operator", value: character });
      index += 1;
      continue;
    }

    if (/\d|\./.test(character)) {
      const match = expression.slice(index).match(/^(?:\d+(?:\.\d+)?|\.\d+)/);

      if (!match) {
        return null;
      }

      const numericValue = Number(match[0]);

      if (!Number.isFinite(numericValue)) {
        return null;
      }

      tokens.push({ type: "number", value: numericValue });
      index += match[0].length;
      continue;
    }

    if (/[A-Za-z_]/.test(character)) {
      const match = expression.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);

      if (!match) {
        return null;
      }

      tokens.push({ type: "identifier", value: match[0] });
      index += match[0].length;
      continue;
    }

    return null;
  }

  return tokens;
}

function currentToken(state: TableFormulaParserState) {
  return state.tokens[state.index] ?? null;
}

function consumeToken<TType extends TableFormulaToken["type"]>(
  state: TableFormulaParserState,
  type: TType,
) {
  const token = currentToken(state);

  if (!token || token.type !== type) {
    return null;
  }

  state.index += 1;
  return token as Extract<TableFormulaToken, { type: TType }>;
}

function combineAdditiveExpressions(
  left: TableFrameExpression,
  right: TableFrameExpression,
): TableFrameExpression {
  if ("op" in left && left.op === "add") {
    return {
      op: "add",
      args: [...left.args, right],
    };
  }

  return {
    op: "add",
    args: [left, right],
  };
}

function combineMultiplicativeExpressions(
  left: TableFrameExpression,
  right: TableFrameExpression,
): TableFrameExpression {
  if ("op" in left && left.op === "multiply") {
    return {
      op: "multiply",
      args: [...left.args, right],
    };
  }

  return {
    op: "multiply",
    args: [left, right],
  };
}

function parseFunctionExpression(
  identifier: string,
  state: TableFormulaParserState,
): TableFrameExpression | null {
  if (!consumeToken(state, "lparen")) {
    return null;
  }

  const args: TableFrameExpression[] = [];
  const closingParen = consumeToken(state, "rparen");

  if (!closingParen) {
    while (true) {
      const argument = parseAdditiveExpression(state);

      if (!argument) {
        return null;
      }

      args.push(argument);

      if (consumeToken(state, "comma")) {
        continue;
      }

      if (!consumeToken(state, "rparen")) {
        return null;
      }

      break;
    }
  }

  const functionName = identifier.toUpperCase();

  if (functionName === "PERCENT_CHANGE" && args.length === 2) {
    return {
      op: "percentChange",
      current: args[0],
      reference: args[1],
    };
  }

  if ((functionName === "DIFFERENCE" || functionName === "SUBTRACT") && args.length === 2) {
    return {
      op: "subtract",
      left: args[0],
      right: args[1],
    };
  }

  if ((functionName === "RATIO" || functionName === "DIVIDE") && args.length === 2) {
    return {
      op: "divide",
      numerator: args[0],
      denominator: args[1],
    };
  }

  if (functionName === "ADD" && args.length > 0) {
    return {
      op: "add",
      args,
    };
  }

  if (functionName === "MULTIPLY" && args.length > 0) {
    return {
      op: "multiply",
      args,
    };
  }

  return null;
}

function parsePrimaryExpression(
  state: TableFormulaParserState,
): TableFrameExpression | null {
  const token = currentToken(state);

  if (!token) {
    return null;
  }

  if (token.type === "number") {
    state.index += 1;
    return { value: token.value };
  }

  if (token.type === "field") {
    state.index += 1;
    return { field: token.value };
  }

  if (token.type === "identifier") {
    state.index += 1;
    return parseFunctionExpression(token.value, state);
  }

  if (token.type === "operator" && token.value === "-") {
    state.index += 1;
    const right = parsePrimaryExpression(state);

    return right
      ? {
          op: "multiply",
          args: [{ value: -1 }, right],
        }
      : null;
  }

  if (token.type === "lparen") {
    state.index += 1;
    const expression = parseAdditiveExpression(state);

    if (!expression || !consumeToken(state, "rparen")) {
      return null;
    }

    return expression;
  }

  return null;
}

function parseMultiplicativeExpression(
  state: TableFormulaParserState,
): TableFrameExpression | null {
  let left = parsePrimaryExpression(state);

  if (!left) {
    return null;
  }

  while (true) {
    const token = currentToken(state);

    if (!token || token.type !== "operator" || (token.value !== "*" && token.value !== "/")) {
      return left;
    }

    state.index += 1;
    const right = parsePrimaryExpression(state);

    if (!right) {
      return null;
    }

    left =
      token.value === "*"
        ? combineMultiplicativeExpressions(left, right)
        : {
            op: "divide",
            numerator: left,
            denominator: right,
          };
  }
}

function parseAdditiveExpression(
  state: TableFormulaParserState,
): TableFrameExpression | null {
  let left = parseMultiplicativeExpression(state);

  if (!left) {
    return null;
  }

  while (true) {
    const token = currentToken(state);

    if (!token || token.type !== "operator" || (token.value !== "+" && token.value !== "-")) {
      return left;
    }

    state.index += 1;
    const right = parseMultiplicativeExpression(state);

    if (!right) {
      return null;
    }

    left =
      token.value === "+"
        ? combineAdditiveExpressions(left, right)
        : {
            op: "subtract",
            left,
            right,
          };
  }
}

export function compileTableFormulaExpression(
  rawExpression: string | undefined,
): TableFormulaCompileResult {
  const expression = rawExpression?.trim();

  if (!expression) {
    return {
      expression: null,
      error: "Enter a formula expression.",
    };
  }

  const tokens = tokenizeTableFormulaExpression(expression);

  if (!tokens || tokens.length === 0) {
    return {
      expression: null,
      error:
        "Formula syntax is invalid. Wrap field names in brackets, for example [last_price] * 10 or PERCENT_CHANGE([last_price], [yearStart]).",
    };
  }

  const state: TableFormulaParserState = {
    index: 0,
    tokens,
  };
  const compiled = parseAdditiveExpression(state);

  if (!compiled || state.index !== tokens.length) {
    return {
      expression: null,
      error:
        "Formula syntax is invalid. Wrap field names in brackets, for example [last_price] * 10. Functions must also use bracketed fields, for example PERCENT_CHANGE([last_price], [yearStart]).",
    };
  }

  return {
    expression: compiled,
  };
}
