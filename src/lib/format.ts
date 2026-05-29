export const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

export const monthLabel = (d: Date) =>
  d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

export const ymd = (d: Date) => d.toISOString().slice(0, 10);

export const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
export const endOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

export const onlyDigits = (s: string) => s.replace(/\D/g, "");

/**
 * Normaliza um número de telefone brasileiro para o padrão canônico:
 *   +55 DD NNNNNNNNN  (com espaço após o DDI e após o DDD)
 *
 * Aceita qualquer formato de entrada, por exemplo:
 *   "92991176452"          → "+55 92 991176452"
 *   "(92) 99117-6452"      → "+55 92 991176452"
 *   "92 99117 6452"        → "+55 92 991176452"
 *   "+55 (92) 99117-6452"  → "+55 92 991176452"
 *   "5592991176452"        → "+55 92 991176452"
 *
 * Retorna null se o número não for válido (menos de 10 ou mais de 11 dígitos
 * após remover o DDI 55).
 */
export function formatBrazilPhone(raw: string): string | null {
  if (!raw) return null;

  // 1. Remove tudo que não for dígito
  let digits = onlyDigits(raw);

  // 2. Remove o DDI 55 se presente no início (pode ter chegado como "55..." ou "+55...")
  if (digits.startsWith("55") && digits.length > 11) {
    digits = digits.slice(2);
  }

  // 3. Valida: número local deve ter 10 (fixo) ou 11 dígitos (celular com 9)
  if (digits.length < 10 || digits.length > 11) return null;

  // 4. Extrai DDD (2 dígitos) e número local
  const ddd = digits.slice(0, 2);
  const numero = digits.slice(2);

  // 5. DDD deve ser entre 11 e 99
  const dddNum = parseInt(ddd, 10);
  if (dddNum < 11 || dddNum > 99) return null;

  return `+55 ${ddd} ${numero}`;
}

/**
 * Retorna true se o número puder ser formatado corretamente.
 * Útil para validações de formulário.
 */
export function isValidBrazilPhone(raw: string): boolean {
  return formatBrazilPhone(raw) !== null;
}
