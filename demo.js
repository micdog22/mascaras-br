import { iniciarMascaras, aplicarMascara, limpar } from './src/index.js';

const form = document.getElementById('fields');
const customField = document.getElementById('field-custom');
const patternInput = document.getElementById('pattern');
const patternError = document.getElementById('pattern-error');

iniciarMascaras(form);

function showRawValue(input) {
  const output = form.querySelector(`output[for="${input.id}"]`);
  if (!output) return;
  const mask = input.dataset.mascara || patternInput.value;
  const options = input.hasAttribute('data-negativo') ? { negativo: true } : undefined;
  try {
    output.textContent = limpar(input.value, mask, options);
  } catch {
    output.textContent = '';
  }
}

let removeCustomMask = null;
function applyCustomPattern() {
  removeCustomMask?.();
  removeCustomMask = null;
  try {
    removeCustomMask = aplicarMascara(customField, patternInput.value);
    patternError.textContent = '';
    customField.disabled = false;
  } catch (error) {
    patternError.textContent = error.message;
    customField.disabled = true;
  }
  showRawValue(customField);
}

form.addEventListener('input', (event) => {
  if (event.target instanceof HTMLInputElement) showRawValue(event.target);
});
form.addEventListener('compositionend', (event) => showRawValue(event.target));
form.addEventListener('submit', (event) => event.preventDefault());
patternInput.addEventListener('input', applyCustomPattern);

customField.value = 'abc1234xy';
applyCustomPattern();
for (const input of form.querySelectorAll('input')) showRawValue(input);
