import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ListaDeDados, type ColunaDados } from "../lista-de-dados";

type Linha = { id: string; nome: string; total: number; obs: string | null; pago: boolean };

const LINHAS: Linha[] = [
  { id: "1", nome: "Cimento", total: 123456, obs: "Obra A", pago: true },
  { id: "2", nome: "Areia", total: 9000, obs: null, pago: false },
];

const COLUNAS: ColunaDados<Linha>[] = [
  { id: "obs", titulo: "Obra", celula: (l) => l.obs },
  { id: "nome", titulo: "Nome", papel: "titulo", celula: (l) => l.nome },
  { id: "total", titulo: "Total", papel: "valor", numerica: true, celula: (l) => `R$ ${l.total}` },
  { id: "estado", titulo: "Situação", papel: "estado", celula: (l) => (l.pago ? "Paga" : "Aberta") },
  { id: "forma", titulo: "Forma", semCartao: true, celula: () => "PIX" },
];

function renderizar(extra: Partial<React.ComponentProps<typeof ListaDeDados<Linha>>> = {}) {
  return renderToStaticMarkup(
    <ListaDeDados legenda="Lançamentos" linhas={LINHAS} chave={(l) => l.id} colunas={COLUNAS} {...extra} />,
  );
}

describe("ListaDeDados", () => {
  it("mantém a semântica de tabela com papéis explícitos (o CSS troca o display)", () => {
    const html = renderizar();
    expect(html).toContain('role="table"');
    expect(html).toContain('aria-label="Lançamentos"');
    expect(html).toContain('role="columnheader"');
    expect(html).toContain('role="row"');
    expect(html).toContain('role="cell"');
    // uma linha de cabeçalho + uma por registro
    expect(html.match(/role="row"/g)).toHaveLength(3);
  });

  it("renderiza cada célula uma vez só (sem versão duplicada para o celular)", () => {
    const html = renderizar();
    expect(html.match(/Cimento/g)).toHaveLength(1);
    expect(html.match(/Areia/g)).toHaveLength(1);
  });

  it("dá rótulo às células de detalhe para o cartão e esconde o que é só da tabela", () => {
    const html = renderizar();
    expect(html).toContain('data-rotulo="Obra:"');
    expect(html).toMatch(/class="[^"]*cartao:hidden[^"]*"[^>]*data-rotulo="Forma:"/);
  });

  it("alinha valores à direita com algarismos tabulares", () => {
    const html = renderizar();
    expect(html).toMatch(/<th[^>]*tabela:text-right[^>]*>Total/);
    expect(html).toMatch(/<td[^>]*class="[^"]*\bnum\b[^"]*tabela:text-right[^"]*"[^>]*>R\$ 123456/);
  });

  it("sem valor: traço na tabela e célula escondida no cartão", () => {
    const html = renderizar();
    expect(html).toMatch(/class="[^"]*cartao:hidden[^"]*"[^>]*data-rotulo="Obra:"[^>]*>—</);
  });

  it("posiciona a seleção à esquerda quando existe coluna de seleção", () => {
    const html = renderizar({
      colunas: [{ id: "sel", titulo: "Selecionar", papel: "selecao", tituloOculto: true, celula: () => "x" }, ...COLUNAS],
    });
    expect(html).toContain("grid-cols-[auto_minmax(0,1fr)_auto]");
    expect(html).toContain("col-start-2 row-start-1");
    expect(html).toContain('<span class="sr-only">Selecionar</span>');
  });

  it("modo rolagem: região focável e primeira coluna fixa", () => {
    const html = renderizar({ modo: "rolagem" });
    expect(html).toContain('role="region"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("sticky left-0");
    expect(html).toContain("Role para o lado");
    expect(html.match(/sticky left-0/g)).toHaveLength(3); // cabeçalho + 2 linhas
    // linhas não viram cartões
    expect(html).not.toContain("grid-cols-[minmax(0,1fr)_auto]");
  });

  it("mostra o texto de vazio no lugar da tabela", () => {
    const html = renderizar({ linhas: [], vazio: "Nenhum lançamento encontrado." });
    expect(html).toContain("Nenhum lançamento encontrado.");
    expect(html).not.toContain("<table");
  });

  it("linha extra e rodapé ficam no mesmo grupo do registro", () => {
    const html = renderizar({
      linhaExtra: (l) => (l.pago ? <em>extra-{l.id}</em> : null),
      rodape: <b>Total da nota</b>,
    });
    expect(html).toContain("extra-1");
    expect(html).not.toContain("extra-2");
    expect(html).toContain("Total da nota");
    expect(html.match(/<tbody/g)).toHaveLength(2);
    expect(html).toContain("<tfoot");
  });

  it("aplica a classe da linha (destaque de vencida)", () => {
    const html = renderizar({ classeDaLinha: (l) => (l.pago ? undefined : "linha-destaque") });
    expect(html.match(/linha-destaque/g)).toHaveLength(1);
  });
});
