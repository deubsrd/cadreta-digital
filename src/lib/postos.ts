// Postos/Graduações padronizados.
// ATENÇÃO: "SD" (Soldado Efetivo Profissional) e "SD EV" (Soldado Efetivo Variável)
// são graduações DIFERENTES e nunca devem ser tratadas como a mesma.

export const POSTOS = [
  "CEL",
  "TEN CEL",
  "MAJ",
  "CAP",
  "1º TEN",
  "2º TEN",
  "ASP",
  "ST",
  "1º SGT",
  "2º SGT",
  "3º SGT",
  "CB",
  "SD",
  "SD EV",
] as const;

export const POSTO_DESCRICAO: Record<string, string> = {
  SD: "Soldado Efetivo Profissional",
  "SD EV": "Soldado Efetivo Variável",
};

const strip = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[.\-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Converte qualquer escrita de posto/graduação para a forma canônica.
 * Distingue explicitamente SD de SD EV.
 */
export function normalizePosto(raw: string): string {
  const s = strip(raw ?? "");
  if (!s) return "";

  const isSoldado = /^(SD|SOLDADO|SLD)\b/.test(s);
  if (isSoldado) {
    const resto = s.replace(/^(SD|SOLDADO|SLD)\b/, "").trim();
    // Variável → SD EV
    if (/^(EV|E ?V|VAR|VARIAVEL|EFETIVO VARIAVEL|EFETIVA VARIAVEL)\b/.test(resto)) return "SD EV";
    // Profissional / efetivo profissional / sem sufixo → SD
    return "SD";
  }

  const map: Record<string, string> = {
    CORONEL: "CEL",
    CEL: "CEL",
    "TEN CEL": "TEN CEL",
    TC: "TEN CEL",
    "TENENTE CORONEL": "TEN CEL",
    MAJ: "MAJ",
    MAJOR: "MAJ",
    CAP: "CAP",
    CAPITAO: "CAP",
    "1 TEN": "1º TEN",
    "1º TEN": "1º TEN",
    "1 TENENTE": "1º TEN",
    "2 TEN": "2º TEN",
    "2º TEN": "2º TEN",
    "2 TENENTE": "2º TEN",
    ASP: "ASP",
    ASPIRANTE: "ASP",
    ST: "ST",
    "SUB TEN": "ST",
    SUBTENENTE: "ST",
    "1 SGT": "1º SGT",
    "1º SGT": "1º SGT",
    "2 SGT": "2º SGT",
    "2º SGT": "2º SGT",
    "3 SGT": "3º SGT",
    "3º SGT": "3º SGT",
    CB: "CB",
    CABO: "CB",
  };

  // "1o SGT" / "1ª SGT" etc.
  const semOrdinal = s.replace(/(\d)\s*[º°ªO]/g, "$1");
  return map[s] ?? map[semOrdinal] ?? s;
}

/** true quando os dois textos representam a mesma graduação. */
export function samePosto(a: string, b: string): boolean {
  const na = normalizePosto(a);
  const nb = normalizePosto(b);
  if (!na || !nb) return false;
  return na === nb;
}
