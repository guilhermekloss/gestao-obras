import type { PassoTour, Tour } from "./tipos";

const menu = (rota: string) => `[data-assistente="menu:${rota}"]`;

const PASSO_CONTA: PassoTour = {
  alvo: '[data-assistente="conta"]',
  titulo: "Minha conta",
  texto: "Aqui você troca a senha e vê seus acessos recentes.",
};

const PASSO_BOTAO: PassoTour = {
  alvo: '[data-assistente="botao"]',
  titulo: "O assistente",
  texto: "Este botão abre a ajuda a qualquer momento: guias, tour desta tela e perguntas.",
};

// Passos do menu do escritório; o Admin ganha também Usuários, Empresa e Captura Sefaz.
const MENU_GESTAO: PassoTour[] = [
  { alvo: menu("/dashboard"), titulo: "Dashboard", texto: "O resumo do dia: o que vence, o que está fora do lugar e como vão as obras." },
  { alvo: menu("/obras"), titulo: "Obras", texto: "Cadastre as obras e suas etapas. Cada obra tem resumo, cronograma, diário e equipe." },
  { alvo: menu("/fornecedores"), titulo: "Fornecedores", texto: "Quem vende para a empresa e o quanto você depende de cada um." },
  { alvo: menu("/materiais"), titulo: "Materiais", texto: "O catálogo de materiais, para o mesmo item ter sempre o mesmo nome." },
  { alvo: menu("/notas"), titulo: "Lançamentos", texto: "Registre notas, recibos, folhas e guias, e divida o custo entre as obras." },
  { alvo: menu("/contas"), titulo: "Contas a pagar", texto: "As parcelas por vencimento. Marque como paga quando o dinheiro sair." },
  { alvo: menu("/diario"), titulo: "Diário de obra", texto: "Os RDOs: o registro do dia em cada obra, com fotos." },
  { alvo: menu("/cronograma"), titulo: "Cronograma", texto: "As datas previstas e o avanço de cada etapa." },
  { alvo: menu("/orcamento"), titulo: "Orçamento", texto: "O previsto contra o realizado por etapa, e a curva ABC dos insumos." },
];

const MENU_USUARIOS: PassoTour = {
  alvo: menu("/usuarios"),
  titulo: "Usuários",
  texto: "Convide a equipe por link e escolha o que cada pessoa pode ver.",
};

const MENU_EMPRESA: PassoTour = {
  alvo: menu("/empresa"),
  titulo: "Empresa",
  texto: "Os dados da empresa, os CNPJs e o certificado digital usado para buscar as NF-e na Sefaz.",
};

const MENU_SEFAZ: PassoTour = {
  alvo: menu("/sefaz"),
  titulo: "Captura Sefaz",
  texto: "Acompanhe a busca automática das NF-e emitidas contra o CNPJ da empresa.",
};

const BOAS_VINDAS = (papel: "ADMIN" | "ESCRITORIO"): Tour => ({
  id: papel === "ADMIN" ? "boas-vindas-admin" : "boas-vindas-escritorio",
  papeis: [papel],
  rotas: [],
  passos: [
    {
      titulo: "Bem-vindo",
      texto:
        "Vamos ver o app em poucos passos. No celular, alguns itens do menu ficam em \"Mais\". Você pode refazer este tour quando quiser.",
    },
    ...MENU_GESTAO,
    ...(papel === "ADMIN" ? [MENU_USUARIOS, MENU_EMPRESA, MENU_SEFAZ] : []),
    PASSO_CONTA,
    PASSO_BOTAO,
  ],
});

export const TOURS: Tour[] = [
  BOAS_VINDAS("ADMIN"),
  BOAS_VINDAS("ESCRITORIO"),
  {
    id: "boas-vindas-campo",
    papeis: ["CAMPO"],
    rotas: [],
    passos: [
      {
        titulo: "Bem-vindo",
        texto: "Aqui você registra o dia da obra e o avanço das etapas. Você pode refazer este tour quando quiser.",
      },
      { alvo: menu("/obras"), titulo: "Obras", texto: "As obras liberadas para você, com as etapas e o avanço de cada uma." },
      { alvo: menu("/diario"), titulo: "Diário de obra", texto: "Registre o RDO do dia: clima, equipe, atividades e fotos." },
      { alvo: menu("/cronograma"), titulo: "Cronograma", texto: "Veja o previsto e informe quanto de cada etapa já foi feito." },
      PASSO_CONTA,
      PASSO_BOTAO,
    ],
  },
  {
    id: "tela-dashboard",
    papeis: ["ADMIN", "ESCRITORIO"],
    rotas: ["/dashboard"],
    passos: [
      {
        alvo: "#pede-acao",
        titulo: "Pede ação hoje",
        texto: "O que vence em 7 dias e as notas com divergência. Comece por aqui.",
      },
      {
        alvo: "#panorama",
        titulo: "Como estão as obras",
        texto: "O gasto do mês, as obras ativas e o avanço de cada obra.",
      },
      {
        alvo: "#graficos",
        titulo: "Gráficos",
        texto: "Compare o gasto mensal e o orçamento. São para analisar, não para decidir o dia.",
      },
    ],
  },
  {
    id: "tela-novo-lancamento",
    papeis: ["ADMIN", "ESCRITORIO"],
    rotas: ["/notas/nova"],
    passos: [
      {
        alvo: "#secao-documento",
        titulo: "Documento",
        texto: "Escolha o tipo, o fornecedor, o número, a data e o valor total.",
      },
      {
        alvo: "#secao-itens",
        titulo: "Itens",
        texto: "Liste o que foi comprado. A soma dos itens deve bater com o total da nota.",
      },
      {
        alvo: "#secao-rateio",
        titulo: "Rateio entre obras",
        texto: "Divida o custo entre as obras. A soma precisa dar exatamente 100%.",
      },
      {
        alvo: "#secao-pagamento",
        titulo: "Pagamento",
        texto: "Escolha a forma e o número de parcelas e clique em \"Gerar parcelas\". Depois salve o lançamento.",
      },
    ],
  },
  {
    id: "tela-contas",
    papeis: ["ADMIN", "ESCRITORIO"],
    rotas: ["/contas"],
    passos: [
      {
        titulo: "Abas de vencimento",
        texto: "Troque entre Vence hoje, Próximos 7 dias, Até o fim da semana, Até o fim do mês, Vencidas, Todas abertas e Pagas.",
      },
      {
        alvo: "#filtro-obra",
        titulo: "Filtros",
        texto: "Filtre por obra, fornecedor e tipo de documento e clique em \"Filtrar\".",
      },
      {
        titulo: "Pagar em lote",
        texto: "Marque as parcelas e clique em \"Marcar como pagas\". Confira a data e clique em \"Confirmar pagamento\".",
      },
    ],
  },
  {
    id: "tela-cronograma",
    papeis: ["ADMIN", "ESCRITORIO", "CAMPO"],
    rotas: ["/cronograma"],
    passos: [
      {
        alvo: "#filtro-obra",
        titulo: "Escolha a obra",
        texto: "Selecione a obra e clique em \"Ver\". O cronograma e o avanço são de uma obra por vez.",
      },
      {
        titulo: "Planejamento e Avanço",
        texto: "Em Planejamento você vê o Gantt e a Curva S. Em Avanço você informa quanto de cada etapa já foi feito.",
      },
    ],
  },
  {
    id: "tela-empresa",
    papeis: ["ADMIN"],
    rotas: ["/empresa"],
    passos: [
      {
        alvo: "#secao-dados-empresa",
        titulo: "1. Dados da empresa",
        texto: "Preencha razão social, CNPJ da matriz, filiais (um por linha) e UF. Clique em \"Salvar dados\". Sem isso, o certificado não pode ser enviado.",
      },
      {
        alvo: "#arquivo",
        titulo: "2. Arquivo do certificado",
        texto: "Escolha o arquivo .pfx ou .p12 do certificado e-CNPJ A1 da empresa. Não tem? Peça ao contador ou compre de uma Autoridade Certificadora.",
      },
      {
        alvo: "#senha",
        titulo: "3. Senha",
        texto: "Digite a senha do certificado e clique em \"Enviar certificado\". O sistema confere senha, validade e CNPJ. A senha não fica guardada.",
      },
      {
        alvo: "#secao-certificado",
        titulo: "Certificado guardado",
        texto: "Aqui aparecem o titular e a validade. O sistema avisa 30 dias antes de vencer: para renovar, envie o arquivo novo aqui.",
      },
      {
        alvo: "#secao-captura",
        titulo: "4. Ligar a captura",
        texto: "Marque a busca automática, deixe em Homologação e clique em \"Salvar captura\". Depois de conferir em Captura Sefaz, troque para Produção.",
      },
    ],
  },
  {
    id: "tela-captura-sefaz",
    papeis: ["ADMIN"],
    rotas: ["/sefaz"],
    passos: [
      {
        alvo: "#sefaz-indicadores",
        titulo: "Resumo",
        texto: "Quantas NF-e estão prontas para lançar, quantas esperam o XML e se alguma Ciência deu erro.",
      },
      {
        alvo: "#sefaz-cnpjs",
        titulo: "CNPJs consultados",
        texto: "A última e a próxima consulta de cada CNPJ. Clique em \"Consultar agora\" para buscar na hora; se a Sefaz ainda não liberou, o sistema avisa o horário.",
      },
      {
        alvo: "#sefaz-certificado",
        titulo: "Certificado A1",
        texto: "Titular, validade e ambiente. Para trocar o certificado, use o botão que leva à tela Empresa.",
      },
      {
        titulo: "Execuções e Documentos",
        texto: "Na aba Execuções fica cada consulta e o retorno da Sefaz. Em Documentos, todas as notas recebidas e as Ciências com erro.",
      },
    ],
  },
  {
    id: "tela-novo-rdo",
    papeis: ["ADMIN", "ESCRITORIO", "CAMPO"],
    rotas: ["/diario/novo"],
    passos: [
      {
        alvo: "#rdo-data",
        titulo: "Data do RDO",
        texto: "Escolha o dia. Só pode haver um RDO por obra por dia.",
      },
      {
        alvo: "#rdo-atividades",
        titulo: "Atividades",
        texto: "Descreva o que foi feito hoje. É o único campo obrigatório além da obra e da data.",
      },
      {
        titulo: "Rascunho automático",
        texto: "O que você escreve fica guardado no aparelho por 7 dias. Se faltar sinal, nada se perde.",
      },
    ],
  },
];
