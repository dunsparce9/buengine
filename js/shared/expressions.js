/** Restricted value expressions shared by runtime and editor; never executes JS. */
export const COMPARISON_OPERATORS = [
  ['==', 'is equal to'], ['!=', 'is not equal to'],
  ['>', 'is greater than'], ['>=', 'is greater than or equal to'],
  ['<', 'is less than'], ['<=', 'is less than or equal to'],
  ['truthy', 'is truthy'], ['falsy', 'is falsy'],
];
export const SET_OPERATIONS = [['set', 'set to'], ['add', 'increment by'], ['subtract', 'decrement by']];
const precedence = { '||': 1, '&&': 2, '==': 3, '!=': 3, '>': 4, '>=': 4, '<': 4, '<=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };

export function parseExpression(source) {
  if (typeof source !== 'string' || source.length > 4096) throw new Error('Expression must be text of at most 4096 characters.');
  const tokens = [];
  let offset = 0;
  while (offset < source.length) {
    if (/\s/.test(source[offset])) { offset++; continue; }
    const rest = source.slice(offset);
    const match = /^(\{[^{}]+\}|"(?:[^"\\]|\\.)*"|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|true\b|false\b|null\b|==|!=|>=|<=|&&|\|\||[()+\-*/%!<>])/.exec(rest);
    if (!match) throw new Error(`Unexpected text at position ${offset + 1}. Use {flag} for variables and "quotes" for text.`);
    tokens.push(match[0]);
    offset += match[0].length;
    if (tokens.length > 512) throw new Error('Expression is too complex.');
  }
  let index = 0;
  function expression(minimum = 0, depth = 0) {
    if (depth > 64) throw new Error('Expression is nested too deeply.');
    const token = tokens[index++];
    let node;
    if (token === undefined) throw new Error('Expected a value.');
    if (token === '!' || token === '+' || token === '-') {
      node = { op: token, value: expression(7, depth + 1) };
    } else if (token === '(') {
      node = expression(0, depth + 1);
      if (tokens[index++] !== ')') throw new Error('Expected a closing parenthesis.');
    } else if (token.startsWith('{')) {
      const name = token.slice(1, -1).trim();
      if (!name) throw new Error('Variable name cannot be empty.');
      node = { reference: name };
    } else if (token.startsWith('"')) {
      node = { literal: JSON.parse(token) };
    } else if (token === 'null') {
      node = { literal: null };
    } else if (token === 'true' || token === 'false') {
      node = { literal: token === 'true' };
    } else if (Number.isFinite(Number(token))) {
      node = { literal: Number(token) };
    } else throw new Error('Expected a number, boolean, quoted text, or {variable}.');
    while (Object.hasOwn(precedence, tokens[index]) && precedence[tokens[index]] >= minimum) {
      const op = tokens[index++];
      node = { op, left: node, right: expression(precedence[op] + 1, depth + 1) };
    }
    return node;
  }
  const tree = expression();
  if (index !== tokens.length) throw new Error(`Unexpected token: ${tokens[index]}.`);
  return tree;
}

/** Preserve the engine's numeric/boolean and string comparison semantics. */
export function compareValues(left, operator, right) {
  const lNum = Number(left), rNum = Number(right);
  if (Number.isNaN(lNum) && Number.isNaN(rNum) && typeof left === 'string' && typeof right === 'string') {
    // Both nonnumeric strings compare as text.
  } else {
    if (Number.isNaN(lNum) || Number.isNaN(rNum)) return false;
    left = lNum; right = rNum;
  }
  switch (operator) {
    case '==': return left === right;
    case '!=': return left !== right;
    case '>': return left > right;
    case '>=': return left >= right;
    case '<': return left < right;
    case '<=': return left <= right;
    default: throw new Error(`Unknown comparison: ${operator}`);
  }
}

export function numericValue(value) {
  if (typeof value !== 'number' && typeof value !== 'boolean') throw new Error('Arithmetic requires a number or boolean.');
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('Arithmetic must produce a finite number.');
  return number;
}

export function evaluateExpression(source, resolve) {
  function evaluate(node) {
    if (Object.hasOwn(node, 'literal')) return node.literal;
    if (Object.hasOwn(node, 'reference')) return resolve(node.reference) ?? 0;
    if (node.value) {
      const value = evaluate(node.value);
      if (node.op === '!') return !value;
      return numericValue(value) * (node.op === '-' ? -1 : 1);
    }
    const left = evaluate(node.left);
    if (node.op === '&&') return Boolean(left) && Boolean(evaluate(node.right));
    if (node.op === '||') return Boolean(left) || Boolean(evaluate(node.right));
    const right = evaluate(node.right);
    if (['==', '!=', '>', '>=', '<', '<='].includes(node.op)) return compareValues(left, node.op, right);
    const a = numericValue(left), b = numericValue(right);
    let result;
    switch (node.op) {
      case '+': result = a + b; break;
      case '-': result = a - b; break;
      case '*': result = a * b; break;
      case '/': result = a / b; break;
      case '%': result = a % b; break;
    }
    return numericValue(result);
  }
  return evaluate(parseExpression(source));
}

export function formatCondition(condition) {
  if (!condition || typeof condition !== 'object') return String(condition ?? '');
  if (!condition.left) return '';
  if (condition.operator === 'truthy') return condition.left;
  if (condition.operator === 'falsy') return `!(${condition.left})`;
  return `${condition.left} ${condition.operator} ${condition.right}`;
}

export function formatSetValue(value) {
  if (value && typeof value === 'object') {
    let description;
    if (Object.hasOwn(value, 'expr')) {
      const operation = SET_OPERATIONS.find(([key]) => key === (value.operation || 'set'))?.[1] || value.operation;
      description = `${operation} ${value.expr}`;
    } else if ('add' in value) description = `increment by ${value.add}`;
    else return JSON.stringify(value);
    if (value.min != null) description += `, min ${value.min}`;
    if (value.max != null) description += `, max ${value.max}`;
    return description;
  }
  return String(value);
}
