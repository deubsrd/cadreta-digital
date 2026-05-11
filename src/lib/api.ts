import { supabase } from "@/integrations/supabase/client";

export type Militar = {
  id: string;
  nome_guerra: string;
  posto: string;
  telefone: string;
  ativo: boolean;
  created_at: string;
};

export const militarLabel = (m?: Pick<Militar, "posto" | "nome_guerra"> | null) =>
  m ? `${m.posto} ${m.nome_guerra}` : "—";

export type Compra = {
  id: string;
  militar_id: string;
  data_compra: string;
  itens: string;
  valor: number;
  observacoes: string | null;
  created_at: string;
  item_id: string | null;
  quantidade: number;
  pago_na_hora: boolean;
  militares?: Pick<Militar, "id" | "nome_guerra" | "posto" | "telefone"> | null;
};

export type Item = {
  id: string;
  nome: string;
  categoria: string | null;
  preco_avista: number;
  preco_fiado: number;
  ativo: boolean;
  observacoes: string | null;
  created_at: string;
};

export type ItemPriceHistory = {
  id: string;
  item_id: string;
  preco_avista: number;
  preco_fiado: number;
  changed_at: string;
};

export async function listItens() {
  const { data, error } = await supabase.from("itens").select("*").order("nome");
  if (error) throw error;
  return data as Item[];
}

export async function upsertItem(i: Partial<Item> & { nome: string; preco_avista: number; preco_fiado: number }) {
  const payload = {
    nome: i.nome,
    categoria: i.categoria ?? null,
    preco_avista: i.preco_avista,
    preco_fiado: i.preco_fiado,
    ativo: i.ativo ?? true,
    observacoes: i.observacoes ?? null,
  };
  if (i.id) {
    const { error } = await supabase.from("itens").update(payload).eq("id", i.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("itens").insert(payload);
    if (error) throw error;
  }
}

export async function deleteItem(id: string) {
  const { error } = await supabase.from("itens").delete().eq("id", id);
  if (error) throw error;
}

export async function listItemPriceHistory(item_id: string) {
  const { data, error } = await supabase.from("item_price_history").select("*").eq("item_id", item_id).order("changed_at", { ascending: false });
  if (error) throw error;
  return data as ItemPriceHistory[];
}

export type Pagamento = {
  id: string;
  militar_id: string;
  periodo: string;
  valor: number;
  pago_em: string;
  observacoes: string | null;
};

export type Configuracoes = {
  id: number;
  pix_key: string;
  pix_nome: string;
  mensagem_template: string;
  frequencia_cobranca_dias: number;
  horario_cobranca: string;
  z_api_instance: string;
  z_api_token: string;
  z_api_client_token: string;
  proxima_cobranca: string | null;
};

export async function listMilitares() {
  const { data, error } = await supabase.from("militares").select("*").order("nome_guerra");
  if (error) throw error;
  return data as Militar[];
}

export async function upsertMilitar(m: Partial<Militar> & { nome_guerra: string; posto: string; telefone: string }) {
  if (m.id) {
    const { error } = await supabase.from("militares").update({
      nome_guerra: m.nome_guerra, posto: m.posto, telefone: m.telefone, ativo: m.ativo ?? true,
    }).eq("id", m.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("militares").insert({
      nome_guerra: m.nome_guerra, posto: m.posto, telefone: m.telefone, ativo: m.ativo ?? true,
    });
    if (error) throw error;
  }
}

export async function bulkInsertMilitares(rows: { nome_guerra: string; posto: string; telefone: string }[]) {
  if (!rows.length) return;
  const { error } = await supabase.from("militares").insert(rows);
  if (error) throw error;
}

export async function deleteMilitar(id: string) {
  const { error } = await supabase.from("militares").delete().eq("id", id);
  if (error) throw error;
}

export async function listCompras(opts?: { from?: string; to?: string }) {
  let q = supabase.from("compras").select("*, militares(id,nome_guerra,posto,telefone)").order("data_compra", { ascending: false });
  if (opts?.from) q = q.gte("data_compra", opts.from);
  if (opts?.to) q = q.lte("data_compra", opts.to);
  const { data, error } = await q;
  if (error) throw error;
  return data as unknown as Compra[];
}

export async function createCompra(c: { militar_id: string; data_compra: string; itens: string; valor: number; observacoes?: string | null; item_id?: string | null; quantidade?: number; pago_na_hora?: boolean }) {
  const { error } = await supabase.from("compras").insert(c);
  if (error) throw error;
}

export async function createComprasBulk(rows: { militar_id: string; data_compra: string; itens: string; valor: number; observacoes?: string | null; item_id?: string | null; quantidade?: number; pago_na_hora?: boolean }[]) {
  if (!rows.length) return;
  const { error } = await supabase.from("compras").insert(rows);
  if (error) throw error;
}

export async function updateCompra(id: string, c: { militar_id?: string; data_compra?: string; itens?: string; valor?: number; observacoes?: string | null; item_id?: string | null; quantidade?: number; pago_na_hora?: boolean }) {
  const { error } = await supabase.from("compras").update(c).eq("id", id);
  if (error) throw error;
}

export async function deleteCompra(id: string) {
  const { error } = await supabase.from("compras").delete().eq("id", id);
  if (error) throw error;
}

export async function listPagamentos() {
  const { data, error } = await supabase.from("pagamentos").select("*").order("pago_em", { ascending: false });
  if (error) throw error;
  return data as Pagamento[];
}

export async function marcarPago(p: { militar_id: string; periodo: string; valor: number; observacoes?: string }) {
  const { error } = await supabase.from("pagamentos").upsert(p, { onConflict: "militar_id,periodo" });
  if (error) throw error;
}

export async function desmarcarPago(militar_id: string, periodo: string) {
  const { error } = await supabase.from("pagamentos").delete().eq("militar_id", militar_id).eq("periodo", periodo);
  if (error) throw error;
}

export async function getConfig() {
  const { data, error } = await supabase.from("configuracoes").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  return data as Configuracoes | null;
}

export async function saveConfig(c: Partial<Configuracoes>) {
  const { error } = await supabase.from("configuracoes").update(c).eq("id", 1);
  if (error) throw error;
}
