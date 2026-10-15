/**
 * Política de senha (OWASP ASVS 2.1 / NIST 800-63B): comprimento é o que mais
 * pesa, sem exigir mistura de símbolos; bloqueia as senhas mais óbvias e as
 * que repetem o e-mail ou o nome. Vale para senhas novas — as atuais seguem
 * funcionando até a próxima troca.
 */
export const SENHA_MINIMA = 10;

/** O bcrypt ignora tudo depois de 72 bytes: senha maior daria a falsa impressão de ser mais forte. */
const SENHA_MAXIMA_BYTES = 72;

/** Custo do bcrypt para hashes novos (~250 ms num vCPU do Cloud Run). */
export const CUSTO_BCRYPT = 12;

export const DICA_SENHA =
  "Dica: não precisa de símbolos nem maiúsculas — uma frase fácil de lembrar, como “tijolo azul na janela”, é mais forte que uma palavra curta cheia de símbolos.";

/** As mais usadas em vazamentos (e variações do próprio sistema). Comparadas sem acento e minúsculas. */
const SENHAS_COMUNS = new Set([
  "1234567890",
  "12345678910",
  "0123456789",
  "0987654321",
  "1111111111",
  "123123123123",
  "1q2w3e4r5t",
  "q1w2e3r4t5",
  "qwertyuiop",
  "asdfghjkl1",
  "password123",
  "password1234",
  "senha12345",
  "senha123456",
  "minhasenha",
  "minhasenha1",
  "minhasenha123",
  "mudar12345",
  "mudar123456",
  "trocar12345",
  "admin12345",
  "admin123456",
  "administrador",
  "iloveyou123",
  "brasil1234",
  "brasil12345",
  "flamengo123",
  "corinthians",
  "palmeiras123",
  "obras12345",
  "obras123456",
  "gestaodeobras",
  "gestaoobras",
  "construtora",
  "construcao123",
  "engenharia123",
]);

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

type Contexto = { email?: string; nome?: string };

function bytes(senha: string): number {
  return new TextEncoder().encode(senha).length;
}

/** Senha óbvia: um caractere repetido ou da lista das mais usadas. */
function ehComum(senha: string): boolean {
  const n = normalizar(senha);
  return new Set(n).size <= 2 || SENHAS_COMUNS.has(n) || SENHAS_COMUNS.has(n.replace(/[^a-z0-9]/g, ""));
}

function contemEmail(senha: string, contexto: Contexto): boolean {
  const usuarioEmail = contexto.email ? normalizar(contexto.email.split("@")[0]) : "";
  return usuarioEmail.length >= 4 && normalizar(senha).includes(usuarioEmail);
}

function ehNome(senha: string, contexto: Contexto): boolean {
  const n = normalizar(senha);
  const nomes = contexto.nome ? normalizar(contexto.nome).split(/\s+/).filter((p) => p.length >= 4) : [];
  return nomes.some((p) => n === p || n.replace(/[^a-z]/g, "") === p);
}

type RequisitoSenha = { chave: "tamanho" | "comum" | "pessoal"; rotulo: string; ok: boolean };

/**
 * Regras da senha como lista para mostrar ao usuário enquanto ele digita
 * (componente `RequisitosSenha`). As mesmas checagens de `problemaSenha`.
 */
export function requisitosSenha(senha: string, contexto: Contexto = {}): RequisitoSenha[] {
  return [
    {
      chave: "tamanho",
      rotulo: `De ${SENHA_MINIMA} a ${SENHA_MAXIMA_BYTES} caracteres`,
      ok: senha.length >= SENHA_MINIMA && bytes(senha) <= SENHA_MAXIMA_BYTES,
    },
    {
      chave: "comum",
      rotulo: "Não é uma senha óbvia (como 1234567890, senha123456 ou letras repetidas)",
      ok: senha.length > 0 && !ehComum(senha),
    },
    {
      chave: "pessoal",
      rotulo: "Não contém o seu e-mail nem é o seu nome",
      ok: senha.length > 0 && !contemEmail(senha, contexto) && !ehNome(senha, contexto),
    },
  ];
}

/** Mensagem do primeiro problema da senha nova, ou `null` se ela é aceitável. */
export function problemaSenha(senha: string, contexto: Contexto = {}): string | null {
  if (senha.length < SENHA_MINIMA) return `A senha precisa ter no mínimo ${SENHA_MINIMA} caracteres`;
  if (bytes(senha) > SENHA_MAXIMA_BYTES) return `A senha pode ter no máximo ${SENHA_MAXIMA_BYTES} caracteres`;
  const n = normalizar(senha);
  if (new Set(n).size <= 2) return "A senha não pode ser um caractere repetido";
  if (ehComum(senha)) return "Esta senha é muito comum — escolha outra";
  if (contemEmail(senha, contexto)) return "A senha não pode conter o seu e-mail";
  if (ehNome(senha, contexto)) return "A senha não pode ser o seu nome";
  return null;
}
