# Identidade visual: "Prancheta"

Papel frio, tinta nanquim e azul de planta heliográfica. A estrutura visual carrega informação como numa planta: linhas de cota, réguas e etiquetas.

## Cores (tokens em `src/app/globals.css`)
| Token | Hex | Uso |
|---|---|---|
| `background` (Papel) | `#f3f5f6` | fundo |
| `card` (Folha) | `#ffffff` | cartões, tabelas, menu |
| `foreground` (Nanquim) | `#14202b` | texto |
| `muted-foreground` (Grafite) | `#4a5967` | texto secundário |
| `primary` (Azul-planta) | `#0f4c81` | ação principal, foco, links |
| `border` (Cota) | `#c5cfd6` | bordas e réguas |
| `input` | `#7c8b97` | borda de campo (3:1 contra a Folha) |

## Estados
Estado = fundo claro + borda + ícone + palavra. A cor nunca vai sozinha. **Preenchimento sólido é só para ação** (botão), nunca para estado.
Use sempre `StatusBadge` (`src/components/status-badge.tsx`); não crie cores de estado novas.

| Estado | Token | Onde |
|---|---|---|
| No prazo | `estado-no-prazo` | etapa em dia, condição praticável |
| Atenção | `estado-atencao` | alertas, obra pausada, condição parcial |
| Atrasado | `estado-atrasado` | etapa atrasada |
| Vencido | `estado-vencido` | parcela vencida, alerta crítico, condição impraticável |
| Pago | `estado-pago` | parcela paga, obra ou etapa concluída (resolvido, recua) |
| Em andamento | `estado-andamento` | obra em andamento |
| Neutro | `estado-neutro` | planejamento, não iniciada, aberta |

Cada token tem três variações: `estado-x` (fundo), `estado-x-fg` (texto) e `estado-x-borda`.

## Tipografia
Uma família só, **Archivo** variável, e a largura (`font-stretch`) separa os papéis:
- texto e interface: largura 100;
- títulos (`h1`–`h4`, título de cartão e de diálogo): largura 112, peso 600, aplicado em `globals.css`;
- números e cotas: classe `num` (largura 80, algarismos tabulares).

## Forma
- Raio: controle 6 px (`--radius`), cartão ~8 px (`rounded-xl`), etiqueta ~4 px (`rounded-sm`). Sem pílulas.
- Sem sombra decorativa; separação por borda.
- **Régua de cota** (`src/components/regua-cota.tsx`) é a barra de avanço: traço fino com marca nas pontas e no valor atual.

## Regras de interface
- Alvo de toque ≥ 44 px: `Button` sobe para 45 px em ponteiro grosso (`pointer-coarse:`). Ícones pequenos e checkboxes ganham área de toque maior que o desenho.
- Foco de teclado: anel de 3 px em azul-planta, nunca removido.
- Movimento só em resposta a ação do usuário; `prefers-reduced-motion` zera animações e transições.
- Botão com verbo: "Salvar lançamento", "Registrar RDO", "Marcar como pagas".
- Só tema claro: o modo escuro nunca esteve ativo e foi removido do CSS.
