import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatar, limpar, processar, resolverMascara, MASCARAS } from '../src/index.js';

/** Simula a digitação de cada caractere na posição do cursor. */
function type(text, mask, options, start = { valor: '', cursor: 0 }) {
  let { valor: value, cursor } = start;
  for (const c of text) {
    const next = value.slice(0, cursor) + c + value.slice(cursor);
    ({ valor: value, cursor } = processar(value, next, cursor + 1, mask, options));
  }
  return { valor: value, cursor };
}

/** Simula um Backspace com o cursor em `cursor` (sem seleção). */
function backspace(value, cursor, mask, options) {
  const next = value.slice(0, cursor - 1) + value.slice(cursor);
  return processar(value, next, cursor - 1, mask, { ...options, inputType: 'deleteContentBackward' });
}

/** Simula um Delete com o cursor em `cursor`. */
function forwardDelete(value, cursor, mask, options) {
  const next = value.slice(0, cursor) + value.slice(cursor + 1);
  return processar(value, next, cursor, mask, { ...options, inputType: 'deleteContentForward' });
}

describe('formatar e limpar', () => {
  const cases = [
    ['cpf', '12345678909', '123.456.789-09'],
    ['cpf', '123.456.789-09', '123.456.789-09'],
    ['cnpj', '11222333000181', '11.222.333/0001-81'],
    ['cep', '13480000', '13480-000'],
    ['telefone', '1934567890', '(19) 3456-7890'],
    ['telefone', '19987654321', '(19) 98765-4321'],
    ['data', '25122026', '25/12/2026'],
    ['hora', '0930', '09:30'],
    ['placa', 'abc1234', 'ABC-1234'],
    ['placa', 'abc1d23', 'ABC1D23'],
    ['cartao', '4111111111111111', '4111 1111 1111 1111'],
    ['cartao', '378282246310005', '3782 822463 10005'],
    ['cartao', '341111111111111', '3411 111111 11111'],
  ];
  for (const [mask, input, expected] of cases) {
    test(`${mask}: ${input} → ${expected}`, () => {
      assert.equal(formatar(input, mask), expected);
      assert.equal(formatar(expected, mask), expected);
      assert.equal(formatar(limpar(expected, mask), mask), expected);
    });
  }

  test('limpar devolve só os caracteres digitados', () => {
    assert.equal(limpar('123.456.789-09', 'cpf'), '12345678909');
    assert.equal(limpar('(19) 98765-4321', 'telefone'), '19987654321');
    assert.equal(limpar('13480-000', 'cep'), '13480000');
    assert.equal(limpar('ABC-1234', 'placa'), 'ABC1234');
    assert.equal(limpar('25/12/2026', 'data'), '25122026');
    assert.equal(limpar('', 'cpf'), '');
  });

  test('entrada parcial não ganha separador no fim', () => {
    assert.equal(formatar('123', 'cpf'), '123');
    assert.equal(formatar('1234', 'cpf'), '123.4');
    assert.equal(formatar('1', 'telefone'), '(1');
    assert.equal(formatar('19', 'telefone'), '(19');
    assert.equal(formatar('193', 'telefone'), '(19) 3');
    assert.equal(formatar('2512', 'data'), '25/12');
    assert.equal(formatar('13480', 'cep'), '13480');
    assert.equal(formatar('134800', 'cep'), '13480-0');
  });

  test('caracteres fora do padrão são ignorados e o excesso é cortado', () => {
    assert.equal(formatar('12a3b4', 'cpf'), '123.4');
    assert.equal(formatar('123456789091234', 'cpf'), '123.456.789-09');
    assert.equal(formatar('1abc', 'placa'), 'ABC');
    assert.equal(formatar('ABCD', 'placa'), 'ABC');
    assert.equal(formatar(null, 'cpf'), '');
    assert.equal(formatar(undefined, 'cep'), '');
  });
});

describe('telefone fixo ou celular', () => {
  test('fixo enquanto o número não começa com 9', () => {
    assert.equal(formatar('1934', 'telefone'), '(19) 34');
    assert.equal(formatar('193456789', 'telefone'), '(19) 3456-789');
  });
  test('celular quando o número começa com 9 ou passa de 10 dígitos', () => {
    assert.equal(formatar('199', 'telefone'), '(19) 9');
    assert.equal(formatar('1998765', 'telefone'), '(19) 98765');
    assert.equal(formatar('19987654', 'telefone'), '(19) 98765-4');
    assert.equal(formatar('19987654321', 'telefone'), '(19) 98765-4321');
    assert.equal(formatar('19345678901', 'telefone'), '(19) 34567-8901');
  });
});

describe('placa antiga ou Mercosul', () => {
  test('sem hífen até o 5º caractere decidir', () => {
    assert.equal(formatar('ABC1', 'placa'), 'ABC1');
    assert.equal(formatar('ABC12', 'placa'), 'ABC-12');
    assert.equal(formatar('ABC1D', 'placa'), 'ABC1D');
  });
  test('maiúsculas e posições', () => {
    assert.equal(formatar('abc-1d23', 'placa'), 'ABC1D23');
    assert.equal(formatar('abc1dd3', 'placa'), 'ABC1D3');
    assert.equal(limpar('abc1d23', 'placa'), 'ABC1D23');
  });
});

describe('CNPJ alfanumérico', () => {
  test('letras nas 12 primeiras posições, em maiúsculas', () => {
    assert.equal(formatar('12abc34501de35', 'cnpj'), '12.ABC.345/01DE-35');
    assert.equal(limpar('12.abc.345/01de-35', 'cnpj'), '12ABC34501DE35');
    assert.equal(formatar('AAAAAAAAAAAA00', 'cnpj'), 'AA.AAA.AAA/AAAA-00');
  });
  test('os dois últimos são só números', () => {
    assert.equal(formatar('12ABC34501DEXY', 'cnpj'), '12.ABC.345/01DE');
    assert.equal(formatar('12ABC34501DEX5Y6', 'cnpj'), '12.ABC.345/01DE-56');
  });
  test('caracteres especiais e acentos não entram', () => {
    assert.equal(formatar('12.ÁBC', 'cnpj'), '12.BC');
  });
});

describe('cpfCnpj', () => {
  test('CPF até 11 dígitos, CNPJ depois', () => {
    assert.equal(formatar('12345678909', 'cpfCnpj'), '123.456.789-09');
    assert.equal(formatar('112223330001', 'cpfCnpj'), '11.222.333/0001');
    assert.equal(formatar('11222333000181', 'cpfCnpj'), '11.222.333/0001-81');
  });
  test('uma letra indica CNPJ alfanumérico', () => {
    assert.equal(formatar('12a', 'cpfCnpj'), '12.A');
    assert.equal(formatar('12ABC34501DE35', 'cpfCnpj'), '12.ABC.345/01DE-35');
  });
  test('nome aceita variações', () => {
    assert.equal(formatar('12345678909', 'cpf-cnpj'), '123.456.789-09');
    assert.equal(formatar('12345678909', 'CPFCNPJ'), '123.456.789-09');
  });
});

describe('moeda', () => {
  test('digitar 1, 2, 3, 4 resulta em R$ 12,34', () => {
    const steps = [];
    let state = { valor: '', cursor: 0 };
    for (const c of '1234') {
      state = type(c, 'moeda', undefined, state);
      steps.push(state.valor);
    }
    assert.deepEqual(steps, ['R$ 0,01', 'R$ 0,12', 'R$ 1,23', 'R$ 12,34']);
    assert.equal(state.cursor, 'R$ 12,34'.length);
  });
  test('milhares e limpeza', () => {
    assert.equal(formatar('123456789', 'moeda'), 'R$ 1.234.567,89');
    assert.equal(limpar('R$ 1.234.567,89', 'moeda'), '1234567.89');
    assert.equal(formatar(limpar('R$ 1.234.567,89', 'moeda'), 'moeda'), 'R$ 1.234.567,89');
  });
  test('zeros à esquerda', () => {
    assert.equal(formatar('0005', 'moeda'), 'R$ 0,05');
    assert.equal(formatar('000', 'moeda'), 'R$ 0,00');
    assert.equal(type('005', 'moeda').valor, 'R$ 0,05');
    assert.equal(type('0', 'moeda').valor, 'R$ 0,00');
    assert.equal(limpar('R$ 0,05', 'moeda'), '0.05');
    assert.equal(limpar('', 'moeda'), '');
  });
  test('number é lido como valor', () => {
    assert.equal(formatar(1234.5, 'moeda'), 'R$ 1.234,50');
    assert.equal(formatar(0, 'moeda'), 'R$ 0,00');
    assert.equal(formatar(0.1 + 0.2, 'moeda'), 'R$ 0,30');
    assert.equal(limpar(19.9, 'moeda'), '19.90');
    assert.equal(formatar(NaN, 'moeda'), '');
    assert.throws(() => formatar(1e20, 'moeda'), RangeError);
  });
  test('limite de dígitos', () => {
    assert.equal(type('1234567', 'moeda', { maxDigitos: 6 }).valor, 'R$ 1.234,56');
    const full = processar('R$ 9.999,99', 'R$ 9.999,991', 12, 'moeda', { maxDigitos: 6 });
    assert.deepEqual(full, { valor: 'R$ 9.999,99', cursor: 11 });
    assert.equal(formatar('1234567890123456789', 'moeda'), 'R$ 1.234.567.890.123,45');
    assert.throws(() => formatar('1', 'moeda', { maxDigitos: 16 }), RangeError);
  });
  test('negativo opcional', () => {
    assert.equal(formatar('-1234', 'moeda'), 'R$ 12,34');
    assert.equal(formatar('-1234', 'moeda', { negativo: true }), '-R$ 12,34');
    assert.equal(formatar('R$ -12,34', 'moeda', { negativo: true }), '-R$ 12,34');
    assert.equal(formatar(-5, 'moeda', { negativo: true }), '-R$ 5,00');
    assert.equal(limpar('-R$ 12,34', 'moeda', { negativo: true }), '-12.34');
    assert.equal(limpar('-R$ 0,00', 'moeda', { negativo: true }), '0.00');
  });
  test('o sinal de menos alterna e o de mais tira', () => {
    const negativeOption = { negativo: true };
    let r = type('-', 'moeda', negativeOption);
    assert.equal(r.valor, '-R$ 0,00');
    r = type('15', 'moeda', negativeOption, r);
    assert.equal(r.valor, '-R$ 0,15');
    r = type('-', 'moeda', negativeOption, r);
    assert.equal(r.valor, 'R$ 0,15');
    r = type('-', 'moeda', negativeOption, r);
    assert.equal(r.valor, '-R$ 0,15');
    r = type('+', 'moeda', negativeOption, r);
    assert.equal(r.valor, 'R$ 0,15');
    // sem a opção, o menos é ignorado
    assert.equal(type('-15', 'moeda').valor, 'R$ 0,15');
  });
  test('apagar o sinal deixa positivo', () => {
    const r = backspace('-R$ 12,34', 1, 'moeda', { negativo: true });
    assert.deepEqual(r, { valor: 'R$ 12,34', cursor: 3 });
  });
  test('apagar até zerar limpa o campo', () => {
    let r = backspace('R$ 0,05', 7, 'moeda');
    assert.deepEqual(r, { valor: '', cursor: 0 });
    r = backspace('R$ 0,10', 7, 'moeda');
    assert.deepEqual(r, { valor: 'R$ 0,01', cursor: 7 });
  });
});

describe('porcentagem', () => {
  test('da direita para a esquerda, com %', () => {
    assert.equal(formatar('1250', 'porcentagem'), '12,50%');
    assert.equal(formatar('5', 'porcentagem'), '0,05%');
    assert.equal(limpar('12,50%', 'porcentagem'), '12.50');
    assert.equal(formatar(7.5, 'porcentagem'), '7,50%');
    assert.equal(formatar('1250', 'porcentagem', { casas: 1 }), '125,0%');
  });
  test('cursor fica antes do %', () => {
    const r = type('125', 'porcentagem');
    assert.deepEqual(r, { valor: '1,25%', cursor: 4 });
  });
  test('limite padrão de 5 dígitos', () => {
    assert.equal(type('123456', 'porcentagem').valor, '123,45%');
  });
});

describe('processar: cursor', () => {
  test('digitação contínua deixa o cursor no fim', () => {
    assert.deepEqual(type('12345678909', 'cpf'), { valor: '123.456.789-09', cursor: 14 });
    assert.deepEqual(type('19987654321', 'telefone'), { valor: '(19) 98765-4321', cursor: 15 });
    assert.deepEqual(type('abc1d23', 'placa'), { valor: 'ABC1D23', cursor: 7 });
  });

  test('inserir no meio mantém o cursor logo depois do caractere digitado', () => {
    // "124.56", cursor depois do "2", digita "3"
    assert.deepEqual(processar('124.56', '1234.56', 3, 'cpf'), { valor: '123.456', cursor: 3 });
    // "123.456", cursor depois do ".", digita "9"
    assert.deepEqual(processar('123.456', '123.9456', 5, 'cpf'), { valor: '123.945.6', cursor: 5 });
  });

  test('Backspace logo depois de um separador apaga o dígito anterior', () => {
    assert.deepEqual(backspace('123.4', 4, 'cpf'), { valor: '124', cursor: 2 });
    assert.deepEqual(backspace('123.456.789-09', 12, 'cpf'), { valor: '123.456.780-9', cursor: 10 });
    assert.deepEqual(backspace('(19) 3456-7890', 5, 'telefone'), { valor: '(13) 4567-890', cursor: 2 });
  });

  test('Delete antes de um separador apaga o dígito seguinte', () => {
    assert.deepEqual(forwardDelete('123.456', 3, 'cpf'), { valor: '123.56', cursor: 3 });
    assert.deepEqual(forwardDelete('13480-000', 5, 'cep'), { valor: '13480-00', cursor: 5 });
  });

  test('Backspace e Delete sobre dígitos', () => {
    assert.deepEqual(backspace('123.456', 5, 'cpf'), { valor: '123.56', cursor: 4 });
    assert.deepEqual(forwardDelete('123.456', 4, 'cpf'), { valor: '123.56', cursor: 4 });
  });

  test('colar no meio', () => {
    assert.deepEqual(processar('123.4', '123999.4', 6, 'cpf'), { valor: '123.999.4', cursor: 7 });
    // texto colado já formatado
    assert.deepEqual(processar('', '123.456.789-09', 14, 'cpf'), { valor: '123.456.789-09', cursor: 14 });
    assert.deepEqual(processar('', '(19) 98765-4321', 15, 'telefone'), { valor: '(19) 98765-4321', cursor: 15 });
  });

  test('colar texto maior que o campo corta o excesso', () => {
    assert.deepEqual(processar('123', '12345678909999', 14, 'cpf'), { valor: '123.456.789-09', cursor: 14 });
  });

  test('campo cheio ignora o que foi digitado', () => {
    assert.deepEqual(processar('123.456.789-09', '1235.456.789-09', 4, 'cpf'), {
      valor: '123.456.789-09',
      cursor: 3,
    });
    assert.deepEqual(processar('123.456.789-09', '123.456.789-091', 15, 'cpf'), {
      valor: '123.456.789-09',
      cursor: 14,
    });
  });

  test('caractere inválido some e o cursor não anda', () => {
    assert.deepEqual(processar('123', '123a', 4, 'cpf'), { valor: '123', cursor: 3 });
    assert.deepEqual(processar('(19', '(1x9', 3, 'telefone'), { valor: '(19', cursor: 2 });
  });

  test('cursor antes do primeiro dígito fica depois do separador inicial', () => {
    assert.deepEqual(processar('', '1', 1, 'telefone'), { valor: '(1', cursor: 2 });
    assert.deepEqual(backspace('(19) 3', 2, 'telefone'), { valor: '(93', cursor: 1 });
  });

  test('substituir uma seleção', () => {
    // seleciona "456" em "123.456.789-09" e digita "7"
    assert.deepEqual(processar('123.456.789-09', '123.7.789-09', 5, 'cpf'), { valor: '123.778.909', cursor: 5 });
  });

  test('moeda: inserir no meio e Backspace na vírgula', () => {
    assert.deepEqual(processar('R$ 12,34', 'R$ 152,34', 5, 'moeda'), { valor: 'R$ 152,34', cursor: 5 });
    assert.deepEqual(backspace('R$ 12,34', 6, 'moeda'), { valor: 'R$ 1,34', cursor: 5 });
    assert.deepEqual(backspace('R$ 12,34', 3, 'moeda'), { valor: 'R$ 12,34', cursor: 3 });
    assert.deepEqual(forwardDelete('R$ 1.234,56', 4, 'moeda'), { valor: 'R$ 134,56', cursor: 4 });
  });

  test('valor vazio', () => {
    assert.deepEqual(processar('1', '', 0, 'cpf'), { valor: '', cursor: 0 });
    assert.deepEqual(processar('R$ 0,01', '', 0, 'moeda'), { valor: '', cursor: 0 });
  });
});

describe('padrões personalizados', () => {
  test('9, A e *', () => {
    assert.equal(formatar('123abc', '999-AAA'), '123-abc');
    assert.equal(formatar('12a4', '999-AAA'), '124');
    assert.equal(formatar('x1y2', '**-**'), 'x1-y2');
    assert.equal(limpar('123-abc', '999-AAA'), '123abc');
  });
  test('maiúsculas opcionais', () => {
    assert.equal(formatar('123abc', '999-AAA', { maiusculas: true }), '123-ABC');
  });
  test('barra invertida escapa os símbolos', () => {
    assert.equal(formatar('12', '\\A\\9-99'), 'A9-12');
    assert.equal(formatar('1234', 'NF \\9 999-9'), 'NF 9 123-4');
    assert.equal(formatar('5', 'R\\*9'), 'R*5');
  });
  test('separadores no início e no meio', () => {
    assert.equal(formatar('1234567', '+55 (99) 9999-9'), '+55 (12) 3456-7');
    assert.equal(processar('', '1', 1, '+55 (99) 9999-9').cursor, 6);
  });
  test('separadores que são dígitos não viram dados ao reformatar', () => {
    const pattern = '+55 (99) 9999-9';
    assert.equal(formatar('+55 (12) 3456-7', pattern), '+55 (12) 3456-7');
    assert.equal(limpar('+55 (12) 3456-7', pattern), '1234567');
    assert.deepEqual(type('12', pattern), { valor: '+55 (12', cursor: 7 });
    assert.equal(formatar('BR-1234', 'BR-9999'), 'BR-1234');
  });
  test('máscara desconhecida', () => {
    assert.throws(() => formatar('1', 'cfp'), /Máscara desconhecida: "cfp"/);
    assert.throws(() => formatar('1', ''), TypeError);
    assert.throws(() => formatar('1', null), TypeError);
  });
});

describe('resolverMascara', () => {
  test('lista de nomes', () => {
    assert.deepEqual(
      [...MASCARAS],
      ['cpf', 'cnpj', 'cpfCnpj', 'cep', 'telefone', 'data', 'hora', 'placa', 'cartao', 'moeda', 'porcentagem'],
    );
    for (const name of MASCARAS) assert.equal(typeof resolverMascara(name), 'object');
  });
  test('nomes com acento e maiúsculas', () => {
    assert.equal(formatar('4111111111111111', 'cartão'), '4111 1111 1111 1111');
    assert.equal(formatar('12345678909', 'CPF'), '123.456.789-09');
  });
  test('dicas para o teclado', () => {
    assert.equal(resolverMascara('cpf').hints.inputmode, 'numeric');
    assert.equal(resolverMascara('telefone').hints.inputmode, 'tel');
    assert.equal(resolverMascara('telefone').hints.autocomplete, 'tel-national');
    assert.equal(resolverMascara('cep').hints.autocomplete, 'postal-code');
    assert.equal(resolverMascara('cartao').hints.autocomplete, 'cc-number');
    assert.equal(resolverMascara('cnpj').hints.inputmode, 'text');
    assert.equal(resolverMascara('placa').hints.autocapitalize, 'characters');
    assert.equal(resolverMascara('999-999').hints.inputmode, 'numeric');
    assert.equal(resolverMascara('moeda', { negativo: true }).hints.inputmode, undefined);
  });
  test('opções inválidas', () => {
    assert.throws(() => resolverMascara('moeda', { casas: -1 }), RangeError);
    assert.throws(() => resolverMascara('porcentagem', { maxDigitos: 0 }), RangeError);
  });
});
