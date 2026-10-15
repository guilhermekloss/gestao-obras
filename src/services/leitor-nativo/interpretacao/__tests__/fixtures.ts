/**
 * Documentos sintéticos (dados fictícios, DVs calculados) no formato em que
 * o OCR devolve as linhas: colunas separadas por vãos, rótulos de caixa em
 * cima e valores embaixo.
 */

export const CHAVE_NFE = "35260911222333000181550010000123451876543218";
export const CHAVE_NFCE = "35261011222333000181650010000007891135724688";
export const CHAVE_NFSE = "35503082211222333000181000000000012326101234567898";
export const QR_NFCE = `https://www.nfce.fazenda.sp.gov.br/qrcode?p=${CHAVE_NFCE}|2|1|1|DBC72319076AE674E49D848CD22C7DBC374663B9`;

/** DANFE em uma linha por faixa (especificação §9.1): 3 itens, frete, 2 duplicatas. */
export const DANFE = `RECEBEMOS DE DEPOSITO DE MATERIAIS FICTICIOS LTDA OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL
ELETRÔNICA INDICADA AO LADO. EMISSÃO: 15/09/2026 VALOR TOTAL: R$ 1.675,50 DESTINATÁRIO: CONSTRUTORA EXEMPLO LTDA
DATA DE RECEBIMENTO IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR NF-e Nº 000.012.345 SÉRIE 001
DEPOSITO DE MATERIAIS FICTICIOS LTDA          DANFE                    CHAVE DE ACESSO
RUA DAS PEDRAS, 100 - CENTRO                  DOCUMENTO AUXILIAR DA    3526 0911 2223 3300 0181 5500 1000 0123 4518 7654 3218
SAO PAULO - SP CEP 01001-000                  NOTA FISCAL ELETRÔNICA   Consulta de autenticidade no portal nacional da NF-e
FONE: (11) 3333-4444                          0 - ENTRADA 1 - SAÍDA 1  www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora
                                              Nº 000.012.345 SÉRIE 001 FOLHA 1/1
NATUREZA DA OPERAÇÃO                          PROTOCOLO DE AUTORIZAÇÃO DE USO
VENDA DE MERCADORIA                           135260001234567 15/09/2026 10:21:33
INSCRIÇÃO ESTADUAL  INSCRIÇÃO ESTADUAL DO SUBST. TRIB.  CNPJ
110.042.490.114                                         11.222.333/0001-81
DESTINATÁRIO / REMETENTE
NOME / RAZÃO SOCIAL                             CNPJ / CPF            DATA DA EMISSÃO
CONSTRUTORA EXEMPLO LTDA                        98.765.432/0001-98    15/09/2026
ENDEREÇO                          BAIRRO / DISTRITO   CEP         DATA DA SAÍDA/ENTRADA
AV. DO CANTEIRO, 500              JARDIM OBRA         04001-000   15/09/2026
MUNICÍPIO          FONE / FAX       UF   INSCRIÇÃO ESTADUAL   HORA DA SAÍDA/ENTRADA
SAO PAULO          (11)5555-6666    SP   ISENTO               10:30:00
FATURA / DUPLICATA
Num. 001 Venc. 15/10/2026 Valor R$ 837,75   Num. 002 Venc. 14/11/2026 Valor R$ 837,75
CÁLCULO DO IMPOSTO
BASE DE CÁLC. DO ICMS  VALOR DO ICMS  BASE DE CÁLC. ICMS S.T.  VALOR DO ICMS SUBST.  V. TOTAL PRODUTOS
937,50                 168,75         0,00                     0,00                  1.595,50
VALOR DO FRETE  VALOR DO SEGURO  DESCONTO  OUTRAS DESPESAS  VALOR TOTAL IPI  V. TOTAL DA NOTA
80,00           0,00             0,00      0,00             0,00             1.675,50
TRANSPORTADOR / VOLUMES TRANSPORTADOS
NOME / RAZÃO SOCIAL          FRETE POR CONTA     CÓDIGO ANTT  PLACA DO VEÍCULO  UF  CNPJ / CPF
DEPOSITO DE MATERIAIS FICTICIOS LTDA  0-Emitente                ABC1D23           SP  11.222.333/0001-81
DADOS DO PRODUTO / SERVIÇO
CÓDIGO PRODUTO DESCRIÇÃO DO PRODUTO / SERVIÇO NCM/SH O/CST CFOP UN QUANT VALOR UNIT VALOR TOTAL BC ICMS VALOR ICMS VALOR IPI ALÍQ. ICMS ALÍQ. IPI
000123 CIMENTO CP II-F-32 50KG 25232910 060 5405 SC 20,0000 32,9000 658,00 0,00 0,00 0,00 0,00 0,00
000456 VERGALHAO CA-50 10,0MM BARRA 12M 72142000 000 5102 BR 15,0000 38,5000 577,50 577,50 103,95 0,00 18,00 0,00
       NERVURADO
000789 AREIA MEDIA LAVADA 25051000 000 5102 M3 3,0000 120,0000 360,00 360,00 64,80 0,00 18,00 0,00
DADOS ADICIONAIS
INFORMAÇÕES COMPLEMENTARES                                     RESERVADO AO FISCO
PAGAMENTO VIA BOLETO BANCARIO. PEDIDO 4471.`;

/**
 * DANFE com caixas empilhadas (rótulo em cima, valor embaixo), 7 itens,
 * IPI, transportadora com outro CNPJ e fatura em caixas lado a lado.
 */
export const DANFE_EMPILHADO = `RECEBEMOS DE DEPOSITO DE MATERIAIS FICTICIOS LTDA OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL    NF-e
ELETRÔNICA INDICADA AO LADO. EMISSÃO: 15/09/2026 VALOR TOTAL: R$ 3.355,32 DESTINATÁRIO: CONSTRUTORA        Nº 000.012.345
EXEMPLO LTDA - AV. DO CANTEIRO, 500 JARDIM OBRA SAO PAULO-SP                                                SÉRIE 001
DATA DE RECEBIMENTO              IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR
IDENTIFICAÇÃO DO EMITENTE                 DANFE                      CHAVE DE ACESSO
DEPOSITO DE MATERIAIS FICTICIOS LTDA      DOCUMENTO AUXILIAR DA      3526 0911 2223 3300 0181 5500 1000 0123 4518 7654 3218
RUA DAS PEDRAS, 100 - CENTRO              NOTA FISCAL ELETRÔNICA     Consulta de autenticidade no portal nacional da NF-e
SAO PAULO - SP CEP 01001-000              0 - ENTRADA                www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora
FONE: (11) 3333-4444                      1 - SAÍDA  1
                                          Nº 000.012.345
                                          SÉRIE 001
                                          FOLHA 1/1
NATUREZA DA OPERAÇÃO                                           PROTOCOLO DE AUTORIZAÇÃO DE USO
VENDA DE MERCADORIA                                            135260001234567 15/09/2026 10:21:33
INSCRIÇÃO ESTADUAL         INSCRIÇÃO ESTADUAL DO SUBST. TRIB.  CNPJ
110.042.490.114                                                11.222.333/0001-81
DESTINATÁRIO / REMETENTE
NOME / RAZÃO SOCIAL                                 CNPJ / CPF                DATA DA EMISSÃO
CONSTRUTORA EXEMPLO LTDA                            98.765.432/0001-98        15/09/2026
ENDEREÇO                          BAIRRO / DISTRITO   CEP          DATA DA SAÍDA/ENTRADA
AV. DO CANTEIRO, 500              JARDIM OBRA         04001-000    15/09/2026
MUNICÍPIO          FONE / FAX       UF   INSCRIÇÃO ESTADUAL   HORA DA SAÍDA/ENTRADA
SAO PAULO          (11) 5555-6666   SP   ISENTO               10:30:00
FATURA / DUPLICATA
Num. 001                 Num. 002
Venc. 15/10/2026         Venc. 14/11/2026
Valor R$ 1.677,66        Valor R$ 1.677,66
CÁLCULO DO IMPOSTO
BASE DE CÁLC. DO ICMS   VALOR DO ICMS   BASE DE CÁLC. ICMS S.T.   VALOR DO ICMS SUBST.   V. TOTAL PRODUTOS
2.557,85                460,41          0,00                      0,00                   3.215,85
VALOR DO FRETE   VALOR DO SEGURO   DESCONTO   OUTRAS DESPESAS   VALOR TOTAL IPI   V. TOTAL DA NOTA
120,00           0,00              0,00       0,00              19,47             3.355,32
TRANSPORTADOR / VOLUMES TRANSPORTADOS
NOME / RAZÃO SOCIAL          FRETE POR CONTA     CÓDIGO ANTT   PLACA DO VEÍCULO   UF   CNPJ / CPF
TRANSPORTES FICTICIOS LTDA   0-Remetente (CIF)                 ABC1D23            SP   45.678.901/0001-75
QUANTIDADE   ESPÉCIE   MARCA   NUMERAÇÃO   PESO BRUTO   PESO LÍQUIDO
1            CARGA                         4.870,000    4.850,000
DADOS DO PRODUTO / SERVIÇO
CÓDIGO    DESCRIÇÃO DO PRODUTO / SERVIÇO        NCM/SH    O/CST  CFOP  UN   QUANT     VALOR UNIT  VALOR TOTAL  BC ICMS  VALOR ICMS  VALOR IPI  ALÍQ.  ALÍQ.
PRODUTO                                                                                                                                  ICMS   IPI
000123    CIMENTO CP II-F-32 50KG               25232910  060    5405  SC   20,0000   32,9000     658,00       0,00     0,00        0,00       0,00   0,00
000456    VERGALHAO CA-50 10,0MM BARRA 12M      72142000  000    5102  BR   15,0000   38,5000     577,50       577,50   103,95      0,00       18,00  0,00
          NERVURADO - FEIXE COM 10 BARRAS
000789    AREIA MEDIA LAVADA                    25051000  000    5102  M3   3,5000    120,0000    420,00       420,00   75,60       0,00       18,00  0,00
001010    BLOCO CONCRETO ESTRUTURAL             68101100  000    5102  UN   200,0000  3,8500      770,00       770,00   138,60      0,00       18,00  0,00
          14X19X39CM
001122    TUBO PVC ESGOTO SERIE NORMAL 100MM    39172300  000    5102  BR   6,0000    64,9000     389,40       389,40   70,09       19,47      18,00  5,00
          6M
001234    ARGAMASSA AC-II CINZA 20KG            32149000  000    5102  SC   12,0000   24,7500     297,00       297,00   53,46       0,00       18,00  0,00
001300    PREGO 17X21 COM CABECA                73170020  000    5102  KG   5,5000    18,9000     103,95       103,95   18,71       0,00       18,00  0,00
DADOS ADICIONAIS
INFORMAÇÕES COMPLEMENTARES                                                         RESERVADO AO FISCO
PAGAMENTO VIA BOLETO BANCARIO EM 2 PARCELAS (VER FATURA). PEDIDO 4471 - OBRA RESIDENCIAL JARDIM.
Valor aproximado dos tributos: R$ 546,25 (16,28%) Fonte: IBPT.
ICMS recolhido por substituição tributária no item 000123 (CST 060).`;

/** NFC-e com itens em duas linhas, desconto no total e PIX. */
export const NFCE = `FERRAGENS FICTICIAS COMERCIO LTDA
CNPJ: 11.222.333/0001-81 IE: 110.042.490.114
RUA DO TUBO, 45 - VILA HIDRAULICA
SAO PAULO - SP  FONE: (11) 2222-3333
Documento Auxiliar da Nota Fiscal de
Consumidor Eletrônica
# CÓDIGO DESCRIÇÃO QTD UN VL UNIT VL TOTAL
001 7891000100103 FITA VEDA ROSCA 18MMX25M
                       2 UN x 6,90      13,80
002 7896543210987 LUVA PVC SOLDAVEL 25MM
                      10 UN x 1,85      18,50
003 7890000000017 REGISTRO ESFERA 3/4 BRUTO 1 UN x 42,70 42,70
004 7891234567895 ADESIVO PVC 175G
                       1 UN x 19,90     19,90
005 7899876543210 JOELHO PVC 90 GRAUS 25MM
                       4 UN x 2,15       8,60
Qtde. total de itens               5
Valor total R$                103,50
Descontos R$                    5,00
Valor a Pagar R$               98,50
FORMA PAGAMENTO          VALOR PAGO R$
Pagamento Instantâneo (PIX)      98,50
Troco R$                         0,00
Consulte pela Chave de Acesso em
https://www.nfce.fazenda.sp.gov.br/consulta
3526 1011 2223 3300 0181 6500 1000 0007 8911 3572 4688
CONSUMIDOR - CPF 123.456.789-09
NFC-e nº 000000789 Série 001 15/10/2026 14:32:10
Protocolo de Autorização: 135260004567890
Data de Autorização: 15/10/2026 14:32:12
Tributos Totais Incidentes (Lei Federal 12.741/2012): R$ 15,23
Obrigado pela preferência! Volte sempre.`;

/** DANFSe padrão nacional (especificação §9.3). */
export const NFSE_NACIONAL = `DANFSe v1.0     Documento Auxiliar da NFS-e     PREFEITURA DO MUNICÍPIO DE SÃO PAULO
Chave de Acesso da NFS-e
35503082211222333000181000000000012326101234567898
Número da NFS-e    Competência da NFS-e    Data e Hora da emissão da NFS-e
123                01/10/2026              15/10/2026 09:12:45
Número da DPS      Série da DPS            Data e Hora da emissão da DPS
57                 1                       15/10/2026 09:12:40
EMITENTE DA NFS-e  Prestador do Serviço
CNPJ / CPF / NIF       Inscrição Municipal   Telefone
11.222.333/0001-81     1.234.567-8           (11) 3333-4444
Nome / Nome Empresarial                      E-mail
ENGENHARIA FICTICIA SERVICOS LTDA            contato@exemplo.com.br
TOMADOR DO SERVIÇO
CNPJ / CPF / NIF       Inscrição Municipal   Telefone
98.765.432/0001-98     -                     (11) 5555-6666
Nome / Nome Empresarial
CONSTRUTORA EXEMPLO LTDA
INTERMEDIÁRIO DO SERVIÇO NÃO IDENTIFICADO NA NFS-e
SERVIÇO PRESTADO
Código de Tributação Nacional  Código de Tributação Municipal  Local da Prestação
07.02.01                        -                               São Paulo - SP
Descrição do Serviço
EXECUCAO DE FUNDACOES TIPO ESTACA HELICE CONTINUA - OBRA RESIDENCIAL JARDIM CNO 90.000.12345/67 - MEDICAO 03
(01/09/2026 A 30/09/2026)
TRIBUTAÇÃO MUNICIPAL
Valor do Serviço  BC ISSQN     Alíquota Aplicada  Retenção do ISSQN          ISSQN Apurado
R$ 5.000,00       R$ 5.000,00  5,00%              Retido pelo Tomador        R$ 250,00
TRIBUTAÇÃO FEDERAL
IRRF  Contribuição Previdenciária - Retida  Contribuições Sociais - Retidas
-     R$ 550,00                             -
VALOR TOTAL DA NFS-E
Valor do Serviço  Desconto Condicionado  Desconto Incondicionado  ISSQN Retido  Total das Retenções Federais  Valor Líquido da NFS-e
R$ 5.000,00       -                      -                        R$ 250,00     R$ 550,00                     R$ 4.200,00
INFORMAÇÕES COMPLEMENTARES
Retenção de 11% de INSS conforme IN RFB 2.110/2022. Pagamento por transferência ao prestador em até 10 dias.`;

/** NFS-e da Prefeitura de São Paulo (especificação §9.4, com dados de pagamento após a discriminação). */
export const NFSE_SP = `PREFEITURA DO MUNICÍPIO DE SÃO PAULO
SECRETARIA MUNICIPAL DA FAZENDA
NOTA FISCAL ELETRÔNICA DE SERVIÇOS - NFS-e
Número da Nota 00004567
Data e Hora de Emissão 08/10/2026 10:15:22
Código de Verificação AB1C-2D3E
PRESTADOR DE SERVIÇOS
CPF/CNPJ: 11.222.333/0001-81 Inscrição Municipal: 1.234.567-8
Nome/Razão Social: LOCADORA FICTICIA DE EQUIPAMENTOS LTDA
Endereço: R DAS PEDRAS 00100 - CENTRO - CEP: 01001-000
Município: São Paulo UF: SP
TOMADOR DE SERVIÇOS
Nome/Razão Social: CONSTRUTORA EXEMPLO LTDA
CPF/CNPJ: 98.765.432/0001-98 Inscrição Municipal: ----
Endereço: AV DO CANTEIRO 00500 - JARDIM OBRA - CEP: 04001-000
Município: São Paulo UF: SP E-mail: compras@exemplo.com.br
INTERMEDIÁRIO DE SERVIÇOS
CPF/CNPJ: ---- Nome/Razão Social: ----
DISCRIMINAÇÃO DOS SERVIÇOS
LOCACAO DE BETONEIRA 400L COM OPERADOR - PERIODO 15/09/2026 A 30/09/2026 - OBRA RESIDENCIAL JARDIM
PEDIDO DE COMPRA 2026/0915.
DADOS BANCARIOS PARA PAGAMENTO: BANCO 341 AG 1234 CC 56789-0.
VALOR TOTAL DO SERVIÇO = R$ 1.800,00
INSS (R$) IRRF (R$) CSLL (R$) COFINS (R$) PIS/PASEP (R$)
- - - - -
Código do Serviço
07102 - Execução por administração, empreitada ou subempreitada de obras de construção civil
Valor Total das Deduções (R$) Base de Cálculo (R$) Alíquota (%) Valor do ISS (R$) Crédito (R$)
0,00 1.800,00 5,00% 90,00 0,00
Município da Prestação do Serviço Número Inscrição da Obra
São Paulo -
OUTRAS INFORMAÇÕES
(1) Esta NFS-e foi emitida com respaldo na Lei nº 14.097/2005; (2) Esta NFS-e não gera crédito;
(3) Data de vencimento do ISS desta NFS-e: 10/11/2026; (4) O ISS desta NFS-e não foi retido pelo tomador.`;

export const LINHA_BOLETO = "34191.09123 34567.821235 45678.900007 1 16150000123456";

/** Boleto Itaú (especificação §9.5). */
export const BOLETO = `Banco Itaú  341-7  Recibo do Pagador
Beneficiário: DEPOSITO DE MATERIAIS FICTICIOS LTDA   CPF/CNPJ do Beneficiário: 11.222.333/0001-81
Pagador: CONSTRUTORA EXEMPLO LTDA - CNPJ 98.765.432/0001-98
Nosso Número 109/12345678-2   Vencimento 30/10/2026   Valor do Documento R$ 1.234,56
----------------------------------------------------------------
341-7 | ${LINHA_BOLETO}
Local de Pagamento                                          Vencimento
PAGÁVEL EM QUALQUER BANCO ATÉ O VENCIMENTO                  30/10/2026
Beneficiário                                                Agência/Código do Beneficiário
DEPOSITO DE MATERIAIS FICTICIOS LTDA - CNPJ 11.222.333/0001-81   1234/56789-0
Data do Documento  Nº do Documento  Espécie Doc.  Aceite  Data do Processamento  Nosso Número
15/09/2026         12345/002        DM            N       15/09/2026             109/12345678-2
Uso do Banco  Carteira  Espécie  Quantidade  Valor        (=) Valor do Documento
              109       R$                                1.234,56
Instruções (Texto de responsabilidade do beneficiário)    (-) Desconto / Abatimento
APOS O VENCIMENTO COBRAR MULTA DE 2% E JUROS DE 1% AM     (+) Mora / Multa
                                                          (=) Valor Cobrado
Pagador: CONSTRUTORA EXEMPLO LTDA CNPJ: 98.765.432/0001-98
AV. DO CANTEIRO, 500 - JARDIM OBRA - SAO PAULO/SP - 04001-000
Sacador/Avalista:                                         Autenticação Mecânica - Ficha de Compensação`;

export const LINHA_DAS = "85800000004-6 56780328072-9 02609123456-9 78901234567-5";

/** DAS (especificação §9.6). */
export const DAS = `Documento de Arrecadação do Simples Nacional
CNPJ                 Razão Social
11.222.333/0001-81   ENGENHARIA FICTICIA SERVICOS LTDA
Período de Apuração  Data de Vencimento  Número do Documento
Setembro/2026        20/10/2026          07.20.26291.2345678-9
Pagar este documento até  20/10/2026          Valor Total do Documento  456,78
Composição do Documento de Arrecadação
Código Denominação                         Principal  Multa  Juros  Total
1001   IRPJ - SIMPLES NACIONAL                 25,12      -      -   25,12
1002   CSLL - SIMPLES NACIONAL                 15,99      -      -   15,99
1004   COFINS - SIMPLES NACIONAL               58,47      -      -   58,47
1005   PIS - SIMPLES NACIONAL                  12,67      -      -   12,67
1006   INSS - SIMPLES NACIONAL                194,13      -      -  194,13
1010   ISS - SIMPLES NACIONAL                 150,40      -      -  150,40
Totais                                        456,78      -      -  456,78
${LINHA_DAS}
Este documento deve ser pago até a data indicada em "Pagar este documento até".`;

/** Recibo de mão de obra, com o corpo quebrado em várias linhas. */
export const RECIBO = `RECIBO
Nº 042
VALOR R$ 1.500,00
Recebi de CONSTRUTORA EXEMPLO LTDA, CNPJ 98.765.432/0001-98, a importância de R$ 1.500,00 (mil e
quinhentos reais), referente a mão de obra de assentamento de piso cerâmico na Obra Residencial
Jardim, medição de 01/10/2026 a 10/10/2026. Pagamento efetuado via PIX. Para maior clareza, firmo o
presente recibo, dando plena e geral quitação.
São Paulo, 10 de outubro de 2026.
______________________________
JOSÉ DA SILVA PEREIRA
CPF 529.982.247-25
Fone: (11) 98888-7777`;

/** Texto qualquer que não é documento de despesa. */
export const NAO_DOCUMENTO = `Reunião de obra — pauta
1. Andamento da alvenaria do bloco B
2. Cronograma de concretagem das lajes
3. Segurança do canteiro e uso de EPI
Próxima reunião na segunda-feira às 8h.`;
