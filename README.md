# Máscaras BR — máscaras de input para formulários brasileiros (JavaScript)

Biblioteca sem dependências com as máscaras que todo formulário brasileiro precisa: CPF, CNPJ (inclusive o novo CNPJ alfanumérico), CEP, telefone, data, hora, placa, cartão, moeda e porcentagem. O cursor fica no lugar certo quando a pessoa digita no meio, apaga um separador ou cola um texto. As funções de formatação são puras e funcionam também no Node.js.

**Demonstração online:** https://micdog22.github.io/mascaras-br/

## Recursos

- Máscaras prontas: `cpf`, `cnpj`, `cpfCnpj`, `cep`, `telefone`, `data`, `hora`, `placa`, `cartao`, `moeda` e `porcentagem`.
- CNPJ alfanumérico: as 12 primeiras posições aceitam letras e números (as letras viram maiúsculas) e os 2 dígitos verificadores são numéricos.
- Máscaras que se ajustam sozinhas: telefone fixo ou celular, placa antiga ou Mercosul, cartão com 16 dígitos ou American Express com 15, CPF ou CNPJ.
- Moeda e porcentagem preenchidas da direita para a esquerda, como em app de banco: digitar 1, 2, 3, 4 resulta em "R$ 12,34". Negativo opcional.
- Padrões personalizados com `9` (dígito), `A` (letra), `*` (letra ou dígito) e `\` (escape).
- Cursor preservado ao digitar no meio, ao apagar separadores com Backspace ou Delete e ao colar.
- Funciona com teclados de celular que usam composição de texto (IME).
- Define `inputmode`, `autocomplete` e `autocapitalize` adequados quando o campo ainda não tem.

## Instalação

```bash
npm install github:micdog22/mascaras-br
```

## Como usar

### No HTML, com atributos

```html
<input data-mascara="cpf">
<input data-mascara="telefone">
<input data-mascara="moeda" data-negativo>
<input data-mascara="AAA-9999" data-maiusculas>

<script type="module">
  import { iniciarMascaras } from 'mascaras-br';
  iniciarMascaras(); // aplica em todos os [data-mascara] da página
</script>
```

Sem bundler, importe direto o arquivo: `import { iniciarMascaras } from './caminho/para/mascaras-br/src/index.js'`.

Atributos de opção: `data-negativo` (moeda e porcentagem aceitam valor negativo), `data-casas="3"` (casas decimais) e `data-maiusculas` (padrões personalizados em maiúsculas). `iniciarMascaras(raiz)` aceita um elemento para limitar a busca e devolve uma função que remove todas as máscaras.

### Em um campo específico

```js
import { aplicarMascara } from 'mascaras-br';

const remover = aplicarMascara(document.querySelector('#cnpj'), 'cnpj');
// ...
remover(); // tira a máscara e os atributos que ela criou
```

### Funções puras (navegador e Node.js)

```js
import { formatar, limpar, processar } from 'mascaras-br';

formatar('12345678909', 'cpf');        // '123.456.789-09'
formatar('12abc34501de35', 'cnpj');    // '12.ABC.345/01DE-35'
formatar('19987654321', 'telefone');   // '(19) 98765-4321'
formatar('1934567890', 'telefone');    // '(19) 3456-7890'
formatar('abc1d23', 'placa');          // 'ABC1D23'
formatar('378282246310005', 'cartao'); // '3782 822463 10005'
formatar('123456', 'moeda');           // 'R$ 1.234,56'
formatar(1234.5, 'moeda');             // 'R$ 1.234,50'
formatar('1250', 'porcentagem');       // '12,50%'
formatar('123abc', '999-AAA', { maiusculas: true }); // '123-ABC'

limpar('123.456.789-09', 'cpf');       // '12345678909'
limpar('R$ 1.234,56', 'moeda');        // '1234.56'

// durante a digitação: valor anterior, valor novo e cursor depois da edição
processar('123.4', '1234', 3, 'cpf', { inputType: 'deleteContentBackward' });
// { valor: '124', cursor: 2 }  (o Backspace no ponto apagou o "3")
```

`processar(anterior, novo, cursor, mascara, opcoes)` é o que `aplicarMascara` usa por baixo. Ela serve para integrar a máscara em frameworks (React, Vue, Svelte) com campos controlados. Em `opcoes.inputType` vai o `inputType` do evento; `'deleteContentForward'` indica a tecla Delete.

### Máscaras prontas

| Nome | Formato |
| --- | --- |
| `cpf` | 000.000.000-00 |
| `cnpj` | 00.000.000/0000-00 (posições 1 a 12 aceitam letras) |
| `cpfCnpj` | CPF até 11 dígitos; CNPJ com mais dígitos ou com letra |
| `cep` | 00000-000 |
| `telefone` | (00) 0000-0000 ou (00) 00000-0000 (celular começa com 9) |
| `data` | 00/00/0000 |
| `hora` | 00:00 |
| `placa` | AAA-0000 ou AAA0A00 (o 5º caractere decide) |
| `cartao` | 0000 0000 0000 0000 ou 0000 000000 00000 (Amex: 34 ou 37) |
| `moeda` | R$ 0,00, da direita para a esquerda |
| `porcentagem` | 0,00%, da direita para a esquerda |

Opções de `moeda` e `porcentagem`: `negativo` (padrão `false`), `casas` (padrão 2), `prefixo`, `sufixo` e `maxDigitos` (padrão 15 para moeda e 5 para porcentagem). Com `negativo`, digitar "-" inverte o sinal e "+" deixa positivo.

Em `moeda` e `porcentagem`, um `number` é lido como valor (`formatar(10, 'moeda')` resulta em "R$ 10,00") e uma string como dígitos digitados (`formatar('10', 'moeda')` resulta em "R$ 0,10"). `limpar` sempre devolve o número com ponto decimal, pronto para enviar a uma API.

## Como rodar localmente

Sirva a pasta do projeto e acesse http://localhost:8000 (módulos ES não carregam via `file://`):

```bash
python3 -m http.server 8000
```

## Testes

```bash
npm test
```

Os testes cobrem formatação e limpeza de cada máscara, entradas parciais, posição do cursor (digitar no meio, Backspace e Delete em separadores, colar), moeda (zeros à esquerda, limite de dígitos, negativo), CNPJ alfanumérico, padrões personalizados e a ligação com o campo, usando um campo simulado.

## Observações

As máscaras só cuidam do formato. Elas não verificam dígitos verificadores de CPF e CNPJ, nem se a data existe; faça essa validação à parte.

## Contribuindo

Issues e pull requests são bem-vindos.

## Licença

MIT — veja [LICENSE](LICENSE).
