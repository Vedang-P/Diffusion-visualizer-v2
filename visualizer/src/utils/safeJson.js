function isBoundary(character) {
  return character == null || /[\s\[\]\{\}:,]/.test(character);
}

function startsWithToken(input, index, token) {
  if (!input.startsWith(token, index)) {
    return false;
  }

  const before = index === 0 ? null : input[index - 1];
  const afterIndex = index + token.length;
  const after = afterIndex >= input.length ? null : input[afterIndex];
  return isBoundary(before) && isBoundary(after);
}

export function sanitizeInvalidJsonNumbers(input) {
  let result = '';
  let index = 0;
  let inString = false;
  let escaped = false;

  while (index < input.length) {
    const character = input[index];

    if (inString) {
      result += character;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      index += 1;
      continue;
    }

    if (character === '"') {
      inString = true;
      result += character;
      index += 1;
      continue;
    }

    if (startsWithToken(input, index, '-Infinity')) {
      result += 'null';
      index += 9;
      continue;
    }

    if (startsWithToken(input, index, 'Infinity')) {
      result += 'null';
      index += 8;
      continue;
    }

    if (startsWithToken(input, index, 'NaN')) {
      result += 'null';
      index += 3;
      continue;
    }

    result += character;
    index += 1;
  }

  return result;
}

export function parseJsonWithSanitization(text, sourceLabel = 'JSON') {
  try {
    return JSON.parse(text);
  } catch (error) {
    const sanitized = sanitizeInvalidJsonNumbers(text);
    try {
      return JSON.parse(sanitized);
    } catch {
      throw new Error(`Failed to parse ${sourceLabel}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
