/**
 * Máscaras BR: ligação com campos <input> do navegador.
 */
import { resolverMascara, processar, formatar } from './masks.js';

const bindings = new WeakMap();

/**
 * Aplica a máscara a um <input>. Formata o valor atual, acompanha a digitação (inclusive colar e
 * teclados com composição, como os de celular) e define dicas como inputmode e autocomplete
 * quando o campo ainda não as tem.
 *
 * @param {HTMLInputElement} input
 * @param {string|object} mask   nome ("cpf", "moeda"...) ou padrão ("999-AAA")
 * @param {object} [options]     opções da máscara, como { negativo: true }
 * @returns {() => void} função que remove a máscara
 */
export function aplicarMascara(input, mask, options) {
  if (!input || typeof input.addEventListener !== 'function') {
    throw new TypeError('aplicarMascara precisa de um elemento <input>.');
  }
  const m = resolverMascara(mask, options);
  bindings.get(input)?.();

  const addedAttributes = [];
  const setHint = (name, value) => {
    if (value && !input.hasAttribute(name)) {
      input.setAttribute(name, value);
      addedAttributes.push(name);
    }
  };
  setHint('inputmode', m.hints.inputmode);
  setHint('autocomplete', m.hints.autocomplete);
  setHint('autocapitalize', m.hints.autocapitalize);
  if (m.hints.autocapitalize) setHint('spellcheck', 'false');

  let previous = input.value;
  let inputType = '';
  let composing = false;

  const update = () => {
    const cursor = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
    const r = processar(previous, input.value, cursor, m, { inputType });
    if (input.value !== r.valor) input.value = r.valor;
    const doc = input.ownerDocument;
    if (doc && doc.activeElement === input && typeof input.setSelectionRange === 'function') {
      input.setSelectionRange(r.cursor, r.cursor);
    }
    previous = r.valor;
  };

  const onBeforeInput = (event) => {
    if (composing || event.isComposing) return;
    previous = input.value;
    inputType = event.inputType || '';
  };
  const onInput = (event) => {
    if (composing || event.isComposing) return;
    if (event.inputType) inputType = event.inputType;
    update();
  };
  const onCompositionStart = () => {
    composing = true;
    previous = input.value;
  };
  const onCompositionEnd = () => {
    composing = false;
    inputType = 'insertCompositionText';
    update();
  };

  if (input.value) {
    input.value = formatar(input.value, m);
    previous = input.value;
  }

  const listeners = [
    ['beforeinput', onBeforeInput],
    ['input', onInput],
    ['compositionstart', onCompositionStart],
    ['compositionend', onCompositionEnd],
  ];
  for (const [type, listener] of listeners) input.addEventListener(type, listener);

  const remove = () => {
    for (const [type, listener] of listeners) input.removeEventListener(type, listener);
    for (const name of addedAttributes) input.removeAttribute(name);
    if (bindings.get(input) === remove) bindings.delete(input);
  };
  bindings.set(input, remove);
  return remove;
}

/**
 * Aplica as máscaras em todos os campos com o atributo data-mascara dentro de `root`.
 * <input data-mascara="cpf">, <input data-mascara="moeda" data-negativo>, <input data-mascara="999-AAA">
 * @returns {() => void} função que remove todas as máscaras aplicadas
 */
export function iniciarMascaras(root = globalThis.document) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError('iniciarMascaras precisa de um elemento ou documento.');
  }
  const removers = [];
  for (const input of root.querySelectorAll('[data-mascara]')) {
    const options = {};
    if (input.hasAttribute('data-negativo')) options.negativo = true;
    if (input.hasAttribute('data-maiusculas')) options.maiusculas = true;
    if (input.hasAttribute('data-casas')) options.casas = Number(input.getAttribute('data-casas'));
    try {
      removers.push(aplicarMascara(input, input.getAttribute('data-mascara'), options));
    } catch (error) {
      console.warn(`Máscaras BR: ${error.message}`, input);
    }
  }
  return () => {
    for (const remove of removers) remove();
  };
}
