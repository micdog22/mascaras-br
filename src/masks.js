/**
 * Máscaras BR: a lógica das máscaras, sem DOM.
 *
 * Padrões personalizados usam os símbolos:
 *   9  dígito        A  letra (A–Z)        *  letra ou dígito        \  escapa o próximo caractere
 * Qualquer outro caractere é fixo (separador).
 */

const MASK = Symbol('mascara');

const isDigit = (c) => c >= '0' && c <= '9';
const isLetter = (c) => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
const isAlphanumeric = (c) => isDigit(c) || isLetter(c);
const SYMBOLS = { 9: isDigit, A: isLetter, '*': isAlphanumeric };

const CPF = '999.999.999-99';
const CNPJ = '**.***.***/****-99';
const LANDLINE = '(99) 9999-9999';
const MOBILE = '(99) 99999-9999';
const OLD_PLATE = 'AAA-9999';
const MERCOSUL_PLATE = 'AAA9A99';
const CARD = '9999 9999 9999 9999';
const AMEX_CARD = '9999 999999 99999';

const PATTERN_MASKS = {
  cpf: { pattern: CPF, hints: { inputmode: 'numeric' } },
  // CNPJ alfanumérico: as 12 primeiras posições aceitam A–Z e 0–9; os 2 dígitos verificadores são números.
  cnpj: { pattern: CNPJ, uppercase: true, hints: { inputmode: 'text', autocapitalize: 'characters' } },
  cpfcnpj: {
    patterns: [CPF, CNPJ],
    choose: (chars) => (chars.length > 11 || /[A-Z]/.test(chars) ? CNPJ : CPF),
    uppercase: true,
    hints: { inputmode: 'text', autocapitalize: 'characters' },
  },
  cep: { pattern: '99999-999', hints: { inputmode: 'numeric', autocomplete: 'postal-code' } },
  // Celular tem 9 dígitos e começa com 9; o formato muda assim que dá para saber.
  telefone: {
    patterns: [LANDLINE, MOBILE],
    choose: (digits) => (digits.length > 10 || digits[2] === '9' ? MOBILE : LANDLINE),
    hints: { inputmode: 'tel', autocomplete: 'tel-national' },
  },
  data: { pattern: '99/99/9999', hints: { inputmode: 'numeric' } },
  hora: { pattern: '99:99', hints: { inputmode: 'numeric' } },
  // O 5º caractere decide: número no padrão antigo (ABC-1234), letra no Mercosul (ABC1D23).
  placa: {
    patterns: [OLD_PLATE, MERCOSUL_PLATE],
    choose: (chars) => {
      const { raw } = applyPattern(chars, compile('AAA9*99'), (c) => c);
      return raw.length >= 5 && isDigit(raw[4]) ? OLD_PLATE : MERCOSUL_PLATE;
    },
    uppercase: true,
    hints: { inputmode: 'text', autocapitalize: 'characters' },
  },
  // American Express (começa com 34 ou 37) tem 15 dígitos.
  cartao: {
    patterns: [CARD, AMEX_CARD],
    choose: (digits) => (/^3[47]/.test(digits) ? AMEX_CARD : CARD),
    hints: { inputmode: 'numeric', autocomplete: 'cc-number' },
  },
};

const NUMERIC_MASKS = {
  moeda: { prefixo: 'R$ ', sufixo: '', casas: 2, maxDigitos: 15 },
  porcentagem: { prefixo: '', sufixo: '%', casas: 2, maxDigitos: 5 },
};

/** Nomes das máscaras prontas. */
export const MASCARAS = Object.freeze([
  'cpf',
  'cnpj',
  'cpfCnpj',
  'cep',
  'telefone',
  'data',
  'hora',
  'placa',
  'cartao',
  'moeda',
  'porcentagem',
]);

const compiledPatterns = new Map();

function compile(pattern) {
  let tokens = compiledPatterns.get(pattern);
  if (tokens) return tokens;
  tokens = [];
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\' && i + 1 < pattern.length) {
      tokens.push({ literal: pattern[++i] });
    } else if (SYMBOLS[c]) {
      tokens.push({ accepts: SYMBOLS[c] });
    } else {
      tokens.push({ literal: c });
    }
  }
  compiledPatterns.set(pattern, tokens);
  return tokens;
}

/**
 * Encaixa o texto no padrão. Caracteres que não cabem na posição são ignorados; os separadores
 * só entram quando existe um caractere depois deles. Um separador que já vem no texto, na posição
 * esperada, é lido como separador (assim "+55 (19" não vira "+55 (55"). `map[i]` diz onde o
 * caractere i do texto foi parar no resultado (-1 se não é um dado).
 */
function applyPattern(text, tokens, transform) {
  let value = '';
  let raw = '';
  let next = 0;
  let literalsRead = 0;
  const map = new Array(text.length).fill(-1);
  for (let i = 0; i < text.length; i++) {
    let j = next;
    while (j < tokens.length && tokens[j].literal !== undefined) j++;
    if (next + literalsRead < j && text[i] === tokens[next + literalsRead].literal) {
      literalsRead++;
      continue;
    }
    if (j >= tokens.length) break;
    const c = transform(text[i]);
    if (!tokens[j].accepts(c)) continue;
    for (let k = next; k < j; k++) value += tokens[k].literal;
    map[i] = value.length;
    value += c;
    raw += c;
    next = j + 1;
    literalsRead = 0;
  }
  return { value, raw, map };
}

const countSymbols = (pattern) => compile(pattern).filter((t) => t.accepts).length;

function normalizeName(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s_-]/g, '');
}

function createPatternMask(name, { pattern, patterns, choose, uppercase, hints }) {
  const list = patterns ?? [pattern];
  const acceptors = [...new Set(list.flatMap((p) => compile(p).filter((t) => t.accepts).map((t) => t.accepts)))];
  return {
    [MASK]: true,
    kind: 'pattern',
    name,
    choose: choose ?? (() => pattern),
    transform: uppercase ? (c) => c.toUpperCase() : (c) => c,
    accepts: (c) => acceptors.some((accepts) => accepts(c)),
    capacity: Math.max(...list.map(countSymbols)),
    hints: { ...hints },
  };
}

function createNumericMask(name, defaults, options) {
  const o = { ...defaults, ...options };
  if (!Number.isInteger(o.casas) || o.casas < 0 || o.casas > 6) {
    throw new RangeError('A opção "casas" deve ser um inteiro de 0 a 6.');
  }
  if (!Number.isInteger(o.maxDigitos) || o.maxDigitos < 1 || o.maxDigitos > 15) {
    throw new RangeError('A opção "maxDigitos" deve ser um inteiro de 1 a 15.');
  }
  return {
    [MASK]: true,
    kind: 'numeric',
    name,
    prefix: String(o.prefixo ?? ''),
    suffix: String(o.sufixo ?? ''),
    decimals: o.casas,
    maxDigits: o.maxDigitos,
    negative: Boolean(o.negativo),
    // o teclado numérico do iPhone não tem a tecla de menos
    hints: o.negativo ? {} : { inputmode: 'numeric' },
  };
}

/**
 * Transforma o nome ("cpf", "telefone", "moeda"...) ou um padrão personalizado ("999-AAA")
 * na definição usada pelas outras funções. Útil para resolver uma vez e reaproveitar.
 * Opções: { negativo, casas, prefixo, sufixo, maxDigitos } para moeda e porcentagem;
 * { maiusculas } para padrões personalizados.
 */
export function resolverMascara(mask, options) {
  if (mask && typeof mask === 'object' && mask[MASK]) return mask;
  options = options ?? {};
  if (typeof mask !== 'string' || mask === '') {
    throw new TypeError('Informe a máscara: um nome, como "cpf", ou um padrão, como "999-AAA".');
  }
  const key = normalizeName(mask);
  if (NUMERIC_MASKS[key]) return createNumericMask(key, NUMERIC_MASKS[key], options);
  if (PATTERN_MASKS[key]) return createPatternMask(key, PATTERN_MASKS[key]);
  if (!/[9A*]/.test(mask.replace(/\\./g, ''))) {
    throw new TypeError(`Máscara desconhecida: "${mask}". Use ${MASCARAS.join(', ')} ou um padrão com 9, A e *.`);
  }
  const digitsOnly = compile(mask).every((t) => t.literal !== undefined || t.accepts === isDigit);
  return createPatternMask('personalizada', {
    pattern: mask,
    uppercase: Boolean(options.maiusculas),
    hints: digitsOnly
      ? { inputmode: 'numeric' }
      : { inputmode: 'text', ...(options.maiusculas ? { autocapitalize: 'characters' } : {}) },
  });
}

function candidates(text, mask) {
  let chars = '';
  for (const c of text) {
    const t = mask.transform(c);
    if (mask.accepts(t)) chars += t;
  }
  return chars;
}

function apply(text, mask) {
  return applyPattern(text, compile(mask.choose(candidates(text, mask))), mask.transform);
}

function toText(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

// ---------- máscaras numéricas (moeda e porcentagem), preenchidas da direita para a esquerda

function numericDigits(value, mask) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { digits: '', negative: false };
    const digits = Math.abs(value).toFixed(mask.decimals).replace('.', '');
    if (Math.abs(value) >= 1e21 || digits.replace(/^0+/, '').length > mask.maxDigits) {
      throw new RangeError(`O valor tem mais dígitos do que a máscara permite (${mask.maxDigits}).`);
    }
    return { digits, negative: mask.negative && value < 0 };
  }
  const text = toText(value);
  return { digits: text.replace(/\D/g, ''), negative: mask.negative && text.includes('-') };
}

function adjustDigits(digits, mask) {
  return digits.replace(/^0+/, '').slice(0, mask.maxDigits).padStart(mask.decimals + 1, '0');
}

function buildNumber(digits, negative, mask) {
  if (digits === '' && !negative) return '';
  const d = adjustDigits(digits, mask);
  const cut = d.length - mask.decimals;
  const integer = d.slice(0, cut).replace(/\B(?=(\d{3})+$)/g, '.');
  const number = mask.decimals ? `${integer},${d.slice(cut)}` : integer;
  return `${negative ? '-' : ''}${mask.prefix}${number}${mask.suffix}`;
}

const count = (text, character) => text.split(character).length - 1;

function processNumeric(previous, current, cursor, mask, backwards) {
  const minusBefore = count(previous, '-');
  const minusAfter = count(current, '-');
  let negative = false;
  if (mask.negative) {
    if (minusAfter > minusBefore) negative = minusBefore === 0; // digitou "-": inverte o sinal
    else if (count(current, '+') > count(previous, '+')) negative = false;
    else negative = minusAfter > 0;
  }

  let text = current;
  const deleting = current.length < previous.length;
  const onlyDigits = (t) => t.replace(/\D/g, '');
  // Apagou só separador (vírgula, ponto, prefixo): apaga o dígito vizinho.
  if (deleting && minusAfter === minusBefore && onlyDigits(current) === onlyDigits(previous)) {
    if (backwards) {
      let i = cursor - 1;
      while (i >= 0 && !isDigit(text[i])) i--;
      if (i >= 0) {
        text = text.slice(0, i) + text.slice(i + 1);
        cursor = i;
      }
    } else {
      let j = cursor;
      while (j < text.length && !isDigit(text[j])) j++;
      if (j < text.length) text = text.slice(0, j) + text.slice(j + 1);
    }
  }

  const digits = onlyDigits(text);
  if (digits.replace(/^0+/, '').length > mask.maxDigits && current.length > previous.length) {
    // campo cheio: ignora o que foi digitado
    const value = buildNumber(onlyDigits(previous), mask.negative && previous.includes('-'), mask);
    return { valor: value, cursor: Math.min(Math.max(cursor - (current.length - previous.length), 0), value.length) };
  }
  if (deleting && !/[1-9]/.test(digits)) return { valor: '', cursor: 0 };

  const value = buildNumber(digits, negative, mask);
  const start = (negative ? 1 : 0) + mask.prefix.length;
  let position = value.length - mask.suffix.length;
  let digitsToTheRight = onlyDigits(text.slice(cursor)).length;
  while (digitsToTheRight > 0 && position > start) {
    position--;
    if (isDigit(value[position])) digitsToTheRight--;
  }
  return { valor: value, cursor: Math.max(position, Math.min(start, value.length)) };
}

// ---------- API

/**
 * Formata um valor com a máscara.
 * Para moeda e porcentagem, um number é lido como valor (1234.5 → "R$ 1.234,50") e uma string
 * como dígitos digitados, da direita para a esquerda ("123456" → "R$ 1.234,56").
 */
export function formatar(value, mask, options) {
  const m = resolverMascara(mask, options);
  if (m.kind === 'numeric') {
    const { digits, negative } = numericDigits(value, m);
    return buildNumber(digits, negative, m);
  }
  return apply(toText(value), m).value;
}

/**
 * Valor sem a máscara: "123.456.789-09" → "12345678909".
 * Para moeda e porcentagem devolve o número com ponto decimal: "R$ 1.234,56" → "1234.56".
 */
export function limpar(value, mask, options) {
  const m = resolverMascara(mask, options);
  if (m.kind === 'numeric') {
    const { digits, negative } = numericDigits(value, m);
    if (digits === '') return '';
    const d = adjustDigits(digits, m);
    const number = m.decimals ? `${d.slice(0, -m.decimals)}.${d.slice(-m.decimals)}` : d;
    return (negative && /[1-9]/.test(d) ? '-' : '') + number;
  }
  return apply(toText(value), m).raw;
}

/**
 * Aplica a máscara durante a digitação, preservando a posição do cursor.
 * Recebe o valor antes e depois da edição e o cursor depois dela (input.selectionStart).
 * Trata digitação no meio, Backspace e Delete sobre separadores, colagem e campo cheio.
 *
 * @param {string} previous  valor antes da edição
 * @param {string} current   valor depois da edição
 * @param {number} cursor    posição do cursor depois da edição
 * @param {string|object} mask
 * @param {object} [options]  opções da máscara e `inputType` do evento ("deleteContentForward" indica Delete)
 * @returns {{valor: string, cursor: number}}
 */
export function processar(previous, current, cursor, mask, options) {
  const { inputType = '', ...maskOptions } = options ?? {};
  const m = resolverMascara(mask, maskOptions);
  const before = toText(previous);
  let text = toText(current);
  let position = Number.isInteger(cursor) ? Math.min(Math.max(cursor, 0), text.length) : text.length;
  const backwards = !/Forward/.test(inputType);

  if (m.kind === 'numeric') return processNumeric(before, text, position, m, backwards);

  const removed = before.length - text.length;
  if (removed > 0 && before.slice(0, position) + before.slice(position + removed) === text) {
    const { map } = apply(before, m);
    let removedData = false;
    for (let i = position; i < position + removed; i++) if (map[i] !== -1) removedData = true;
    if (!removedData) {
      // Só separadores saíram: apaga o caractere vizinho, senão o separador voltaria na hora.
      if (backwards) {
        let i = position - 1;
        while (i >= 0 && map[i] === -1) i--;
        if (i >= 0) {
          text = text.slice(0, i) + text.slice(i + 1);
          position = i;
        }
      } else {
        let j = position + removed;
        while (j < before.length && map[j] === -1) j++;
        if (j < before.length) {
          const k = j - removed;
          text = text.slice(0, k) + text.slice(k + 1);
        }
      }
    }
  }

  if (text.length > before.length) {
    const previousResult = apply(before, m);
    if (previousResult.raw.length >= m.capacity && candidates(text, m).length > previousResult.raw.length) {
      // campo cheio: ignora o que foi digitado
      const back = Math.max(position - (text.length - before.length), 0);
      return { valor: previousResult.value, cursor: Math.min(back, previousResult.value.length) };
    }
  }

  // O cursor fica logo depois do último dado que estava antes dele.
  const { value, map } = apply(text, m);
  let last = -1;
  for (let i = Math.min(position, text.length) - 1; i >= 0; i--) {
    if (map[i] !== -1) {
      last = i;
      break;
    }
  }
  if (last === -1) {
    const first = map.find((p) => p !== -1);
    return { valor: value, cursor: first === undefined ? 0 : first };
  }
  let end = map[last] + 1;
  if (position > last + 1) {
    // o cursor estava depois de um separador: continua depois dele
    const taken = new Set(map);
    while (end < value.length && !taken.has(end)) end++;
  }
  return { valor: value, cursor: end };
}
