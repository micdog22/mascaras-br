import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarMascara, iniciarMascaras } from '../src/index.js';

/** Campo de texto falso que imita a sequência de eventos do navegador. */
class FakeInput {
  constructor(value = '', attributes = {}) {
    this.value = value;
    this.selectionStart = value.length;
    this.selectionEnd = value.length;
    this.attributes = new Map(Object.entries(attributes));
    this.listeners = {};
    this.ownerDocument = { activeElement: this };
    this.cursorMoves = 0;
  }
  hasAttribute(name) {
    return this.attributes.has(name);
  }
  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  addEventListener(type, listener) {
    (this.listeners[type] ??= new Set()).add(listener);
  }
  removeEventListener(type, listener) {
    this.listeners[type]?.delete(listener);
  }
  get listenerCount() {
    return Object.values(this.listeners).reduce((total, set) => total + set.size, 0);
  }
  dispatch(type, data = {}) {
    for (const listener of this.listeners[type] ?? []) listener({ type, isComposing: false, ...data });
  }
  setSelectionRange(start, end) {
    this.selectionStart = start;
    this.selectionEnd = end;
    this.cursorMoves++;
  }
  select(start, end = start) {
    this.selectionStart = start;
    this.selectionEnd = end;
  }
  insert(text, inputType = 'insertText') {
    this.dispatch('beforeinput', { inputType, data: text });
    const { selectionStart: a, selectionEnd: b } = this;
    this.value = this.value.slice(0, a) + text + this.value.slice(b);
    this.select(a + text.length);
    this.dispatch('input', { inputType, data: text });
  }
  typeText(text) {
    for (const c of text) this.insert(c);
  }
  backspace() {
    this.dispatch('beforeinput', { inputType: 'deleteContentBackward' });
    let { selectionStart: a, selectionEnd: b } = this;
    if (a === b) a = Math.max(a - 1, 0);
    this.value = this.value.slice(0, a) + this.value.slice(b);
    this.select(a);
    this.dispatch('input', { inputType: 'deleteContentBackward' });
  }
  delete() {
    this.dispatch('beforeinput', { inputType: 'deleteContentForward' });
    let { selectionStart: a, selectionEnd: b } = this;
    if (a === b) b = Math.min(b + 1, this.value.length);
    this.value = this.value.slice(0, a) + this.value.slice(b);
    this.select(a);
    this.dispatch('input', { inputType: 'deleteContentForward' });
  }
}

describe('aplicarMascara', () => {
  test('formata enquanto digita e mantém o cursor no fim', () => {
    const input = new FakeInput();
    aplicarMascara(input, 'cpf');
    input.typeText('12345678909');
    assert.equal(input.value, '123.456.789-09');
    assert.equal(input.selectionStart, 14);
  });

  test('Backspace sobre o separador apaga o dígito anterior', () => {
    const input = new FakeInput();
    aplicarMascara(input, 'cpf');
    input.typeText('12345678909');
    input.select(12);
    input.backspace();
    assert.equal(input.value, '123.456.780-9');
    assert.equal(input.selectionStart, 10);
  });

  test('Delete sobre o separador apaga o dígito seguinte', () => {
    const input = new FakeInput('13480000');
    aplicarMascara(input, 'cep');
    assert.equal(input.value, '13480-000');
    input.select(5);
    input.delete();
    assert.equal(input.value, '13480-00');
    assert.equal(input.selectionStart, 5);
  });

  test('colar no meio', () => {
    const input = new FakeInput();
    aplicarMascara(input, 'telefone');
    input.typeText('1934');
    assert.equal(input.value, '(19) 34');
    input.select(5);
    input.insert('98765-43', 'insertFromPaste');
    assert.equal(input.value, '(19) 98765-4334');
    assert.equal(input.selectionStart, 13);
  });

  test('formata o valor que já estava no campo', () => {
    const input = new FakeInput('abc1234');
    aplicarMascara(input, 'placa');
    assert.equal(input.value, 'ABC-1234');
  });

  test('moeda da direita para a esquerda', () => {
    const input = new FakeInput();
    aplicarMascara(input, 'moeda');
    input.typeText('1234');
    assert.equal(input.value, 'R$ 12,34');
    input.backspace();
    assert.equal(input.value, 'R$ 1,23');
  });

  test('durante a composição (teclados de celular) só formata no fim', () => {
    const input = new FakeInput();
    aplicarMascara(input, 'placa');
    input.dispatch('compositionstart');
    input.value = 'a';
    input.select(1);
    input.dispatch('input', { inputType: 'insertCompositionText', isComposing: true });
    assert.equal(input.value, 'a');
    input.value = 'abc';
    input.select(3);
    input.dispatch('input', { inputType: 'insertCompositionText', isComposing: true });
    assert.equal(input.value, 'abc');
    input.dispatch('compositionend');
    assert.equal(input.value, 'ABC');
    input.typeText('1d23');
    assert.equal(input.value, 'ABC1D23');
  });

  test('define dicas de teclado sem sobrescrever as do campo', () => {
    const phone = new FakeInput();
    aplicarMascara(phone, 'telefone');
    assert.equal(phone.getAttribute('inputmode'), 'tel');
    assert.equal(phone.getAttribute('autocomplete'), 'tel-national');

    const plate = new FakeInput();
    aplicarMascara(plate, 'placa');
    assert.equal(plate.getAttribute('autocapitalize'), 'characters');
    assert.equal(plate.getAttribute('spellcheck'), 'false');

    const cep = new FakeInput('', { autocomplete: 'shipping postal-code' });
    aplicarMascara(cep, 'cep');
    assert.equal(cep.getAttribute('autocomplete'), 'shipping postal-code');
    assert.equal(cep.getAttribute('inputmode'), 'numeric');
  });

  test('a função devolvida remove a máscara e as dicas que ela criou', () => {
    const input = new FakeInput('', { autocomplete: 'off' });
    const remove = aplicarMascara(input, 'cep');
    assert.equal(input.listenerCount, 4);
    remove();
    assert.equal(input.listenerCount, 0);
    assert.equal(input.hasAttribute('inputmode'), false);
    assert.equal(input.getAttribute('autocomplete'), 'off');
    input.typeText('13480000');
    assert.equal(input.value, '13480000');
  });

  test('aplicar de novo substitui a máscara anterior', () => {
    const input = new FakeInput();
    aplicarMascara(input, 'cpf');
    aplicarMascara(input, 'cep');
    assert.equal(input.listenerCount, 4);
    input.typeText('13480000');
    assert.equal(input.value, '13480-000');
  });

  test('não mexe no cursor de um campo sem foco', () => {
    const input = new FakeInput();
    input.ownerDocument = { activeElement: null };
    aplicarMascara(input, 'cpf');
    input.typeText('1234');
    assert.equal(input.value, '123.4');
    assert.equal(input.cursorMoves, 0);
  });

  test('erros de uso', () => {
    assert.throws(() => aplicarMascara(null, 'cpf'), TypeError);
    assert.throws(() => aplicarMascara(new FakeInput(), 'cfp'), /Máscara desconhecida/);
  });
});

describe('iniciarMascaras', () => {
  function rootWith(...inputs) {
    return { querySelectorAll: (selector) => (selector === '[data-mascara]' ? inputs : []) };
  }

  test('aplica pelo atributo data-mascara e lê as opções', () => {
    const cpf = new FakeInput('', { 'data-mascara': 'cpf' });
    const money = new FakeInput('', { 'data-mascara': 'moeda', 'data-negativo': '' });
    const code = new FakeInput('', { 'data-mascara': 'AAA-999', 'data-maiusculas': '' });
    const remove = iniciarMascaras(rootWith(cpf, money, code));
    cpf.typeText('12345678909');
    money.typeText('-150');
    code.typeText('abc123');
    assert.equal(cpf.value, '123.456.789-09');
    assert.equal(money.value, '-R$ 1,50');
    assert.equal(code.value, 'ABC-123');
    remove();
    assert.equal(cpf.listenerCount + money.listenerCount + code.listenerCount, 0);
  });

  test('máscara desconhecida gera um aviso e não impede as outras', () => {
    const warnings = [];
    const original = console.warn;
    console.warn = (text) => warnings.push(text);
    try {
      const wrong = new FakeInput('', { 'data-mascara': 'cfp' });
      const right = new FakeInput('', { 'data-mascara': 'cep' });
      iniciarMascaras(rootWith(wrong, right));
      right.typeText('13480000');
      assert.equal(right.value, '13480-000');
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /Máscara desconhecida: "cfp"/);
    } finally {
      console.warn = original;
    }
  });

  test('raiz inválida', () => {
    assert.throws(() => iniciarMascaras(null), TypeError);
  });
});
