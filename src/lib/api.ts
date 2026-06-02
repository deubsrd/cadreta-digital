import { supabase } from "@/integrations/supabase/client";
import { formatBrazilPhone } from "@/lib/format";

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


// Retorna o user_id do usuário autenticado (necessário para inserts multi-tenant)
async function getUid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Não autenticado");
  return data.user.id;
}

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
    const uid = await getUid();
    const { error } = await supabase.from("itens" as any).insert({ ...payload, user_id: uid });
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
  admin_phone: string;
};

export type CobrancaAgendamento = {
  id: number;
  ativo: boolean;
  scheduled_at: string | null;  // ISO timestamptz
  intervalo_min: number;
  intervalo_max: number;
  executado_at: string | null;
  updated_at: string;
};

export type CobrancaLog = {
  id: string;
  agendamento_id: number;
  militar_id: string;
  status: "enviado" | "pulado_pago" | "erro";
  erro_msg: string | null;
  enviado_at: string;
};

export type PixCobranca = {
  id: string;
  militar_id: string;
  periodo: string;
  valor: number;
  txid: string;
  mp_payment_id: string | null;
  qr_code_base64: string | null;
  copia_cola: string | null;
  ticket_url: string | null;
  status: string;
  paid_amount: number | null;
  paid_at: string | null;
  needs_review: boolean;
  created_at: string;
  updated_at: string;
};




export async function listMilitares() {
  const { data, error } = await supabase.from("militares").select("*").order("nome_guerra");
  if (error) throw error;
  return data as Militar[];
}

export async function upsertMilitar(m: Partial<Militar> & { nome_guerra: string; posto: string; telefone: string }) {
  // Normaliza o telefone para o padrão canônico "+55 DD NNNNNNNNN" antes de persistir.
  // Se o número for inválido, lança erro para que o formulário trate adequadamente.
  const telefone = formatBrazilPhone(m.telefone);
  if (!telefone) throw new Error("Telefone inválido. Use o formato: (92) 99117-6452");

  if (m.id) {
    const { error } = await supabase.from("militares").update({
      nome_guerra: m.nome_guerra, posto: m.posto, telefone, ativo: m.ativo ?? true,
    }).eq("id", m.id);
    if (error) throw error;
  } else {
    const uid = await getUid();
    const { error } = await supabase.from("militares" as any).insert({
      nome_guerra: m.nome_guerra, posto: m.posto, telefone, ativo: m.ativo ?? true, user_id: uid,
    });
    if (error) throw error;
  }
}

export async function bulkInsertMilitares(rows: { nome_guerra: string; posto: string; telefone: string }[]) {
  if (!rows.length) return;
  // Normaliza todos os telefones antes do insert em lote.
  // Linhas com telefone inválido lançam erro (o ImportDialog já filtra antes de chamar esta função,
  // mas mantemos a validação aqui como segunda camada de segurança).
  const normalized = rows.map((r) => {
    const telefone = formatBrazilPhone(r.telefone);
    if (!telefone) throw new Error(`Telefone inválido para ${r.nome_guerra}: "${r.telefone}"`);
    return { ...r, telefone };
  });
  const uid = await getUid();
  const withUid = normalized.map((r) => ({ ...r, user_id: uid }));
  const { error } = await supabase.from("militares" as any).insert(withUid);
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
  const uid = await getUid();
  const { error } = await supabase.from("compras" as any).insert({ ...c, user_id: uid });
  if (error) throw error;
}

export async function createComprasBulk(rows: { militar_id: string; data_compra: string; itens: string; valor: number; observacoes?: string | null; item_id?: string | null; quantidade?: number; pago_na_hora?: boolean }[]) {
  if (!rows.length) return;
  const uid = await getUid();
  const rowsWithUid = rows.map((r) => ({ ...r, user_id: uid }));
  const { error } = await supabase.from("compras" as any).insert(rowsWithUid);
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
  const uid = await getUid();
  const { error } = await supabase.from("pagamentos" as any).upsert({ ...p, user_id: uid }, { onConflict: "militar_id,periodo" });
  if (error) throw error;
}

export async function desmarcarPago(militar_id: string, periodo: string) {
  const { error } = await supabase.from("pagamentos").delete().eq("militar_id", militar_id).eq("periodo", periodo);
  if (error) throw error;
}

const DEFAULT_TEMPLATE = `Olá, {nome}. Sua fatura referente ao mês de {mes} já está disponível.\nValor total: R$ {valor}.\nResumo das compras:\n{resumo}\nPor favor realize o pagamento via PIX:\n{pix}\nApós o pagamento, envie o comprovante. Obrigado!`;

export async function getConfig(): Promise<Configuracoes> {
  const uid = await getUid();
  const { data, error } = await supabase.from("configuracoes" as any).select("*").eq("user_id", uid).maybeSingle();
  if (error) throw error;

  // Se não existe ainda (usuário criado antes do trigger), provisiona agora
  if (!data) {
    const defaults = {
      user_id: uid,
      pix_key: "", pix_nome: "",
      mensagem_template: DEFAULT_TEMPLATE,
      frequencia_cobranca_dias: 3,
      horario_cobranca: "09:00",
      z_api_instance: "", z_api_token: "", z_api_client_token: "",
      admin_phone: "", mp_access_token: "",
    };
    const { data: created, error: createErr } = await supabase
      .from("configuracoes" as any)
      .insert(defaults)
      .select()
      .maybeSingle();
    if (createErr) throw createErr;

    // Também provisiona 5 agendamentos se não existirem
    const { data: ags } = await supabase.from("cobranca_agendamentos" as any).select("id").eq("user_id", uid).limit(1);
    if (!ags || ags.length === 0) {
      await supabase.from("cobranca_agendamentos" as any).insert([
        { user_id: uid, ativo: false, scheduled_at: null, intervalo_min: 30, intervalo_max: 120 },
        { user_id: uid, ativo: false, scheduled_at: null, intervalo_min: 30, intervalo_max: 120 },
        { user_id: uid, ativo: false, scheduled_at: null, intervalo_min: 30, intervalo_max: 120 },
        { user_id: uid, ativo: false, scheduled_at: null, intervalo_min: 30, intervalo_max: 120 },
        { user_id: uid, ativo: false, scheduled_at: null, intervalo_min: 30, intervalo_max: 120 },
      ]);
    }

    return created as unknown as Configuracoes;
  }

  return data as unknown as Configuracoes;
}

export async function saveConfig(c: Partial<Configuracoes>) {
  const uid = await getUid();

  // Remove campos que não devem ser enviados ao banco
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, user_id: _uid, updated_at, proxima_cobranca, frequencia_cobranca_dias, horario_cobranca, mp_access_token, ...rest } = c as any;
  const payload = {
    pix_key: rest.pix_key ?? "",
    pix_nome: rest.pix_nome ?? "",
    mensagem_template: rest.mensagem_template ?? "",
    z_api_instance: rest.z_api_instance ?? "",
    z_api_token: rest.z_api_token ?? "",
    z_api_client_token: rest.z_api_client_token ?? "",
    admin_phone: rest.admin_phone ?? "",
    user_id: uid,
  };

  // Verifica se já existe linha para este usuário
  const { data: existing } = await supabase
    .from("configuracoes" as any)
    .select("id")
    .eq("user_id", uid)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("configuracoes" as any)
      .update(payload)
      .eq("user_id", uid);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("configuracoes" as any)
      .insert(payload);
    if (error) throw error;
  }
}

// ─── Cobrança agendada ────────────────────────────────────────────────────────

export async function listAgendamentos() {
  const { data, error } = await supabase
    .from("cobranca_agendamentos")
    .select("*")
    .order("id", { ascending: true });
  if (error) throw error;
  return data as CobrancaAgendamento[];
}

export async function saveAgendamento(ag: Partial<CobrancaAgendamento> & { id: number }) {
  const { error } = await supabase
    .from("cobranca_agendamentos" as any)
    .update(ag)
    .eq("id", ag.id)
    .eq("user_id", await getUid());
  if (error) throw error;
}

export async function listCobrancaLogs(agendamento_id?: number) {
  let q = supabase
    .from("cobranca_logs")
    .select("*, militares(posto, nome_guerra)")
    .order("enviado_at", { ascending: false })
    .limit(100);
  if (agendamento_id) q = q.eq("agendamento_id", agendamento_id);
  const { data, error } = await q;
  if (error) throw error;
  return data as (CobrancaLog & { militares: { posto: string; nome_guerra: string } | null })[];
}
