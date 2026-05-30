// wiki.js — BLU Auto Lite

// ── Dados dos processos ───────────────────────────────────────────────────────

const WIKI_PROCESSES = [
  {
    id: "dz",
    badge: "DZ",
    title: "Dono do Zap — Validar Telefones",
    tagline: "Descobre quem é o verdadeiro dono de cada número de WhatsApp",
    description: "O Dono do Zap verifica, número por número, se o WhatsApp cadastrado realmente pertence ao sócio indicado na planilha. Com isso você sabe quais contatos são legítimos antes de ligar ou enviar mensagem — e evita falar com a pessoa errada.",
    needsAi: false,
    steps: [
      "O script lê cada número de telefone da planilha.",
      "Para cada número, consulta a API do Dono do Zap e obtém o nome vinculado ao WhatsApp.",
      "Compara o nome encontrado com o nome do sócio cadastrado na mesma linha.",
      "Adiciona o resultado na planilha: nome confirmado ✓, nome diferente ≠, sem registro —.",
    ],
    columns: [
      { label: "Nome da empresa",       ok: ["Empresa"],                                   synonyms: ["Razão Social", "Nome Fantasia", "Nome Empresa"],  bad: ["Companhia", "Conta", "Marca"] },
      { label: "Nome do sócio/contato", ok: ["Nome contato 1", "Nome contato 2"],           synonyms: ["Sócio 1", "Contato 1", "Nome do Sócio 1"],        bad: ["Responsável", "Decisor", "Key Contact"] },
      { label: "Telefone do sócio",     ok: ["Fone Movel Contato 1", "Fone Movel Contato 2"], synonyms: ["Telefone Sócio 1", "Celular Contato 1"],        bad: ["Zap Sócio 1", "Móvel 1", "WhatsApp Contato"] },
      { label: "Telefone da empresa",   ok: ["Telefone", "Telefone 2"],                    synonyms: ["Celular", "WhatsApp", "Phone", "Teleméavel"],      bad: ["Linha", "Número", "Contato Tel."] },
    ],
    outputs: ["VERIFICADO - 1", "VERIFICADO - 2", "VERIFICADO - N…"],
    outputNote: "Uma coluna de resultado por coluna de telefone encontrada. Dentro de cada célula: o nome real se bater com o sócio, \"Outros Vínculos\" se não bater, \"Sem dados\" se não houver registro na API.",
    tips: [
      "A correspondência é feita por índice: coluna \"Telefone 2\" é comparada com \"Nome contato 2\".",
      "Vários números na mesma célula? Cada um é verificado separadamente.",
      "Não precisa de chave de IA para funcionar.",
    ],
  },
  {
    id: "style",
    badge: "ESTILO",
    title: "Formatar Planilha",
    tagline: "Deixa qualquer planilha bonita e organizada visualmente",
    description: "Aplica um visual profissional à sua planilha: cabeçalhos em azul escuro, bordas em todas as células, fonte padronizada. Nenhum dado é alterado, removido ou reordenado.",
    needsAi: false,
    steps: [
      "Você envia a planilha — qualquer arquivo .xlsx ou .csv.",
      "O script lê todos os dados sem verificar os nomes das colunas.",
      "Gera um novo arquivo .xlsx com formatação visual aplicada.",
      "Baixe o resultado: mesmos dados, com visual profissional.",
    ],
    noColumns: true,
    outputs: [],
    outputNote: "Mesmos dados da planilha original — apenas o visual muda.",
    tips: [
      "Funciona com qualquer planilha, independente do conteúdo ou dos cabeçalhos.",
      "Não precisa de chave de IA.",
    ],
  },
  {
    id: "enrich",
    badge: "ICP",
    title: "Avaliar ICP com IA",
    tagline: "A IA analisa cada empresa e diz se ela encaixa no seu perfil de cliente ideal",
    description: "Você descreve o tipo de empresa que quer atingir (chamado de ICP — Ideal Customer Profile). A IA avalia cada empresa da planilha e atribui uma nota de 0 a 100, explicando o motivo. Isso ajuda a priorizar quem você deve prospectar primeiro.",
    needsAi: true,
    steps: [
      "Você preenche o campo \"Descrição do ICP\" no formulário (ex: \"indústrias com mais de 50 funcionários que pagam ICMS, sem MEI\").",
      "Para cada empresa na planilha, o script monta um resumo com nome, cidade, estado e site.",
      "Esse resumo é enviado para a IA junto com a sua descrição do ICP.",
      "A IA retorna: site atualizado (se estava vazio), resumo da empresa em duas frases, nota de 0–100 e motivo da avaliação.",
      "Empresas sem nome são puladas automaticamente.",
    ],
    columns: [
      { label: "Nome da empresa",  ok: ["Empresa"], synonyms: ["Razão Social", "Nome Fantasia", "Nome Empresa"], bad: ["Companhia", "Conta", "Marca"] },
      { label: "Cidade",           ok: ["Cidade"],  synonyms: ["Município", "City"],                             bad: ["Localidade", "Mesorregião", "Local"] },
      { label: "Estado (UF)",      ok: ["Estado"],  synonyms: ["UF", "District"],                                bad: ["Região", "Province", "Território"] },
      { label: "Site da empresa",  ok: ["Site"],    synonyms: ["Website", "URL", "Homepage"],                   bad: ["Portal", "Link", "Página"] },
    ],
    outputs: ["Site", "Resumo Empresa", "ICP Score", "ICP Motivo"],
    outputNote: "A coluna Site é preenchida se estiver vazia. ICP Score vai de 0 (não encaixa) a 100 (encaixa perfeitamente).",
    tips: [
      "Requer chave de IA configurada em Configurações — veja a seção \"Chave de API de IA\" abaixo.",
      "A coluna Site é opcional: se vazia, a IA tenta descobrir o site da empresa.",
      "Quanto mais detalhado o seu ICP, mais precisos os resultados.",
      "Se a IA atingir o limite de requisições, o script pausa automaticamente e continua.",
    ],
  },
  {
    id: "company_age_mei",
    badge: "MEI",
    title: "Validar Tempo de Existência / MEI",
    tagline: "Filtra empresas muito novas ou MEI consultando a Receita Federal automaticamente",
    description: "Consulta a base pública da Receita Federal pelo CNPJ de cada empresa. Identifica empresas com menos de 1 ano de existência ou registradas como MEI/SIMEI — e as marca em vermelho na planilha de resultado.",
    needsAi: false,
    steps: [
      "O script lê o CNPJ de cada linha. Pode estar com ou sem pontuação — o script normaliza automaticamente.",
      "Consulta a API pública BrasilAPI com os dados da Receita Federal (sem custo).",
      "Calcula quantos dias a empresa existe desde a data de abertura.",
      "Verifica se o porte é MEI ou Microempreendedor Individual.",
      "Linhas com alerta (empresa nova ou MEI) são pintadas de vermelho no arquivo Excel de saída.",
    ],
    columns: [
      { label: "CNPJ da empresa",        ok: ["CNPJ"],    synonyms: ["Documento", "CPF/CNPJ", "CNPJ Empresa", "Tax ID"], bad: ["Identificação", "Registro", "Número Fiscal", "CNPJ/CPF"] },
      { label: "Nome da empresa (logs)", ok: ["Empresa"], synonyms: ["Razão Social", "Nome Fantasia", "Nome Empresa"],    bad: ["Companhia", "Conta"] },
    ],
    outputs: ["Receita - Data abertura", "Receita - Idade dias", "Receita - MEI", "Receita - Motivo alerta", "Receita - Erro"],
    outputNote: "Linhas com alerta ficam vermelhas no Excel. O motivo do alerta explica o problema: \"menos de 365 dias\", \"MEI\", ou os dois.",
    tips: [
      "O CNPJ pode ter pontos e traços — o script remove a formatação automaticamente.",
      "CNPJs com menos de 14 dígitos são marcados como inválidos na coluna de Erro.",
      "Não precisa de chave de IA. Usa somente dados públicos da Receita Federal.",
    ],
  },
  {
    id: "uni",
    badge: "UNI",
    title: "Unificar Empresas + Sócios",
    tagline: "Junta duas planilhas em uma só, cruzando pelo CNPJ",
    description: "Você tem uma planilha de empresas e outra de sócios. Este script cruza as duas pelo CNPJ e gera uma planilha unificada: os dados da empresa + todos os sócios correspondentes em colunas numeradas (contato 1, contato 2…).",
    needsAi: false,
    isUni: true,
    steps: [
      "Você envia duas planilhas: uma de empresas e uma de sócios.",
      "O script agrupa os sócios por CNPJ e os ordena pelo campo \"prioridade\" (número menor = primeiro).",
      "Para cada empresa, busca todos os sócios com o mesmo CNPJ.",
      "Gera uma linha por empresa com os dados de todos os sócios em colunas numeradas.",
      "O resultado é ordenado por empresas com menos sócios primeiro.",
    ],
    companyColumns: [
      { label: "CNPJ (chave do cruzamento)", ok: ["CNPJ"],         synonyms: ["Documento", "CPF/CNPJ"] },
      { label: "Nome fantasia",              ok: ["trading_name"], synonyms: ["Nome Fantasia", "Fantasia"] },
      { label: "Razão social",               ok: ["company_name"], synonyms: ["Razão Social", "Empresa"] },
      { label: "DDD do telefone",            ok: ["DDD_TEL1"],     synonyms: ["DDD Telefone", "DDD"] },
      { label: "Número do telefone",         ok: ["TEL1"],         synonyms: ["Telefone Empresa", "Phone"] },
      { label: "Cidade",                     ok: ["city"],         synonyms: ["Cidade", "Município"] },
      { label: "Estado",                     ok: ["district"],     synonyms: ["Estado", "UF"] },
      { label: "Site",                       ok: ["Site"],         synonyms: ["Website", "URL", "Homepage"] },
    ],
    partnerColumns: [
      { label: "CNPJ (chave do cruzamento)", ok: ["CNPJ"],         synonyms: ["Documento"] },
      { label: "Nome do sócio",              ok: ["nome"],         synonyms: ["Nome Sócio", "Sócio", "Partner Name"] },
      { label: "Cargo",                      ok: ["cargo_socio"],  synonyms: ["Cargo", "Função", "Job Title"] },
      { label: "E-mail",                     ok: ["email_1"],      synonyms: ["Email", "E-Mail"] },
      { label: "DDD + celular 1",            ok: ["ddd_cel1", "cel1"], synonyms: ["DDD Celular 1", "Celular 1", "Telefone 1"] },
      { label: "DDD + celular 2",            ok: ["ddd_cel2", "cel2"], synonyms: ["DDD Celular 2", "Celular 2", "Telefone 2"] },
      { label: "DDD + celular 3",            ok: ["ddd_cel3", "cel3"], synonyms: ["DDD Celular 3", "Celular 3", "Telefone 3"] },
      { label: "Prioridade de contato",      ok: ["prioridade"],   synonyms: ["Priority", "Ordem"] },
    ],
    outputs: ["CNPJ", "Empresa", "Site", "telefone", "Cidade", "Estado", "Nome contato 1", "Cargo contato 1", "Email contato 1", "Fone movel contato 1", "… contato N", "qtd_socios_total", "Anotacoes"],
    outputNote: "O resultado é ordenado por empresas com menos sócios primeiro. O campo Anotacoes vem vazio — use para fazer notas durante a prospecção.",
    tips: [
      "A coluna \"prioridade\" define a ordem: número menor = aparece primeiro como Contato 1.",
      "Se não houver coluna de prioridade, os sócios aparecem na ordem original da planilha.",
      "Não precisa de chave de IA.",
    ],
  },
  {
    id: "zenvia",
    badge: "ZENVIA",
    title: "Zenvia — Adicionar DDI 55",
    tagline: "Formata todos os telefones para o padrão internacional com código do Brasil",
    description: "Adiciona o código de país do Brasil (55) na frente de todos os números de telefone da planilha. Formato de saída: somente dígitos, sem pontuação — ex: 5511999991234. Pronto para usar na plataforma Zenvia ou em qualquer API de disparo de mensagens.",
    needsAi: false,
    isZenvia: true,
    steps: [
      "O script percorre todas as colunas que tenham nome de telefone (veja a lista de padrões reconhecidos abaixo).",
      "Cada célula é dividida por separadores: barra (/), ponto e vírgula (;), vírgula (,), pipe (|) ou quebra de linha.",
      "Para cada número encontrado: remove toda formatação (parênteses, traços, espaços).",
      "Adiciona \"55\" na frente. Se o número já começa com \"55\", mantém como está — sem duplicar.",
      "Múltiplos números ficam separados por quebra de linha no resultado.",
    ],
    autoDetect: [
      { pattern: "telefone  (exato ou começa com)", examples: ["Telefone", "Telefone 1", "Telefone Comercial"] },
      { pattern: "celular  (exato ou começa com)",  examples: ["Celular", "Celular 1", "Celular 2"] },
      { pattern: "whatsapp",                        examples: ["WhatsApp"] },
      { pattern: "fone movel… ou fone cel…",        examples: ["Fone Movel Contato 1", "Fone Celular"] },
      { pattern: "phone",                           examples: ["Phone", "Phone 1"] },
      { pattern: "cel1, cel2, cel3…",               examples: ["cel1", "cel2", "cel3"] },
      { pattern: "tel1, tel2…",                     examples: ["tel1", "tel2"] },
    ],
    examples: [
      { before: "(11) 99999-1234",               after: "5511999991234" },
      { before: "11 98888-7777",                  after: "5511988887777" },
      { before: "5511977776666",                  after: "5511977776666 (já tinha DDI)" },
      { before: "11999991234 / 21988887777",      after: "5511999991234 + 5521988887777 (linhas separadas)" },
      { before: "11999991234; 21988887777; 31977776666", after: "3 números — cada um com DDI, um por linha" },
    ],
    outputs: [],
    outputNote: "Os números são editados nas próprias colunas de telefone existentes. Nenhuma coluna nova é criada.",
    tips: [
      "Se a coluna de telefone não for reconhecida pelo nome, renomeie para \"Telefone\" ou \"Celular\" antes de rodar.",
      "Não precisa de chave de IA.",
    ],
  },
];

// ── Provedores de IA ──────────────────────────────────────────────────────────

const API_PROVIDERS = [
  {
    id: "gemini",
    name: "Google Gemini",
    badge: "GRÁTIS",
    badgeClass: "chip-ok",
    tagline: "O mais fácil para começar — tem plano 100% gratuito sem precisar de cartão",
    freeDetail: "Gemini 1.5 Flash é gratuito com limite de requisições por minuto. Ideal para testar.",
    paidDetail: "Planos pagos disponíveis para uso em grande escala.",
    model: "gemini-1.5-flash",
    creditCard: "Não obrigatório para o plano gratuito",
    price: "Gratuito (Gemini 1.5 Flash)",
    steps: [
      { label: "Acesse o site",      text: "Abra o navegador e vá para: aistudio.google.com" },
      { label: "Entre com o Google", text: "Clique em \"Sign in\" e entre com a sua conta do Gmail. Não precisa criar nenhuma conta nova." },
      { label: "Clique em Get API Key", text: "No menu à esquerda, procure e clique em \"Get API key\" (ou \"Obter chave de API\")." },
      { label: "Crie a chave",       text: "Clique no botão azul \"Create API key\". Escolha um projeto (pode ser o padrão) e clique em Criar." },
      { label: "Copie o código",     text: "Vai aparecer uma linha de texto com letras e números. Clique em Copiar." },
      { label: "Cole no BLU Auto",   text: "Volte ao painel, clique em Configurações, selecione \"Gemini / Google\" como provedor, cole a chave no campo e clique em Salvar." },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    badge: "MUITO BARATO",
    badgeClass: "chip-ok",
    tagline: "O mais barato do mercado — crédito inicial grátis e preço baixíssimo",
    freeDetail: "Novos usuários recebem $5 de crédito grátis ao criar a conta.",
    paidDetail: "deepseek-chat custa ~$0,14 por 1 milhão de tokens — quase 10x mais barato que a OpenAI.",
    model: "deepseek-chat",
    creditCard: "Necessário para recarregar após o crédito inicial se esgotar",
    price: "$5 grátis para começar",
    steps: [
      { label: "Acesse o site",    text: "Abra o navegador e vá para: platform.deepseek.com" },
      { label: "Crie sua conta",   text: "Clique em \"Sign Up\" e cadastre-se com e-mail e senha. Confirme o e-mail se pedir." },
      { label: "Verifique o saldo", text: "Após entrar, você verá $5 de crédito gratuito disponível na sua conta." },
      { label: "Crie a chave",     text: "No menu lateral, clique em \"API Keys\" e depois em \"Create new API key\". Dê um nome (ex: \"BLU Auto\") e clique em Criar." },
      { label: "Copie o código",   text: "Copie o código que apareceu — ele começa com \"sk-\"." },
      { label: "Cole no BLU Auto", text: "Volte ao painel, clique em Configurações, selecione \"DeepSeek\", cole a chave e clique em Salvar." },
    ],
  },
  {
    id: "openai",
    name: "OpenAI (ChatGPT / GPT-4)",
    badge: "PAGO",
    badgeClass: "chip-warn",
    tagline: "O mais famoso — precisa de cartão de crédito, mas oferece crédito inicial",
    freeDetail: "Novos usuários podem receber crédito inicial. Verifique no site ao criar a conta.",
    paidDetail: "gpt-4o-mini custa ~R$ 0,90 por 1.000 análises de empresas. Extremamente barato para uso normal.",
    model: "gpt-4o-mini",
    creditCard: "Necessário para adicionar saldo",
    price: "A partir de $5 (você escolhe quanto carregar)",
    steps: [
      { label: "Acesse o site",      text: "Abra o navegador e vá para: platform.openai.com" },
      { label: "Crie sua conta",     text: "Clique em \"Sign up\" e cadastre-se com e-mail ou conta Google/Microsoft." },
      { label: "Adicione crédito",   text: "Após entrar, vá em \"Settings\" (engrenagem) > \"Billing\" > \"Add payment method\". Adicione seu cartão de crédito e escolha um valor para carregar (mínimo $5)." },
      { label: "Crie a chave",       text: "No menu lateral, clique em \"API keys\" e depois em \"Create new secret key\". Dê um nome (ex: \"BLU Auto\") e clique em Criar." },
      { label: "Copie o código",     text: "Copie o código completo — ele começa com \"sk-\". Atenção: ele só aparece uma vez, então copie agora." },
      { label: "Cole no BLU Auto",   text: "Volte ao painel, clique em Configurações, selecione \"GPT / OpenAI\", cole a chave e clique em Salvar." },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    badge: "PAGO",
    badgeClass: "chip-warn",
    tagline: "O mesmo modelo que alimenta este painel — precisa de cartão",
    freeDetail: "Novos usuários recebem $5 de crédito ao verificar a conta.",
    paidDetail: "claude-3-5-haiku é o modelo mais rápido e barato da família Claude.",
    model: "claude-3-5-haiku-20241022",
    creditCard: "Necessário para adicionar saldo",
    price: "A partir de $5 (você escolhe quanto carregar)",
    steps: [
      { label: "Acesse o site",    text: "Abra o navegador e vá para: console.anthropic.com" },
      { label: "Crie sua conta",   text: "Clique em \"Sign up\" e cadastre-se com e-mail." },
      { label: "Adicione crédito", text: "Vá em \"Settings\" > \"Billing\" e adicione um cartão de crédito. Você receberá $5 de crédito inicial." },
      { label: "Crie a chave",     text: "No menu lateral, clique em \"API Keys\" e depois em \"Create Key\". Dê um nome e clique em Criar." },
      { label: "Copie o código",   text: "Copie o código — começa com \"sk-ant-\". Guarde em lugar seguro, pois não aparece novamente." },
      { label: "Cole no BLU Auto", text: "Volte ao painel, clique em Configurações, selecione \"Claude / Anthropic\", cole a chave e clique em Salvar." },
    ],
  },
  {
    id: "mistral",
    name: "Mistral",
    badge: "GRÁTIS",
    badgeClass: "chip-ok",
    tagline: "Empresa europeia com plano gratuito e modelos rápidos",
    freeDetail: "Mistral Small tem um tier gratuito com limite de uso mensal.",
    paidDetail: "Modelos premium disponíveis para uso em escala maior.",
    model: "mistral-small-latest",
    creditCard: "Não obrigatório para o plano gratuito",
    price: "Gratuito (com limite)",
    steps: [
      { label: "Acesse o site",    text: "Abra o navegador e vá para: console.mistral.ai" },
      { label: "Crie sua conta",   text: "Clique em \"Sign up\" e cadastre-se com e-mail." },
      { label: "Crie a chave",     text: "Vá em \"API Keys\" no menu e clique em \"Create new key\". Dê um nome (ex: \"BLU Auto\") e clique em Criar." },
      { label: "Copie o código",   text: "Copie o código que apareceu." },
      { label: "Cole no BLU Auto", text: "Volte ao painel, clique em Configurações, selecione \"Mistral\", cole a chave e clique em Salvar." },
    ],
  },
];

// ── Tour da Wiki ──────────────────────────────────────────────────────────────

const WIKI_TOUR_STEPS = [
  {
    title: "Bem-vinda à Wiki do BLU Auto",
    text: "Esta é a sua central de ajuda. Aqui você encontra tudo que precisa saber para usar cada script corretamente — sem precisar de ajuda técnica. Vamos fazer um tour rápido?",
    target: null,
  },
  {
    title: "Legenda das cores",
    text: "Você vai ver chips coloridos nas tabelas de cada processo. Verde significa que o nome da coluna está certo e será reconhecido na hora. Laranja significa que é um sinônimo — também funciona. Vermelho significa que o script não vai reconhecer aquele nome e pode falhar.",
    target: "wikiLegend",
  },
  {
    title: "Navegação rápida",
    text: "Use estes botões para ir direto a qualquer seção. Basta clicar e o processo correspondente vai expandir na tela.",
    target: "wikiNav",
  },
  {
    title: "Cada processo tem o seu guia",
    text: "Clique no card de qualquer processo para expandir. Você vai ver: o que o script faz em passos simples, quais colunas precisa ter na planilha, quais colunas são adicionadas ao resultado, e dicas importantes.",
    target: "section-dz",
  },
  {
    title: "Precisa de IA?",
    text: "A maioria dos scripts funciona sem chave de IA. Apenas o Avaliar ICP obrigatoriamente precisa. Os outros usam a IA apenas como \"corretor\" de cabeçalhos, se precisar.",
    target: "section-enrich",
  },
  {
    title: "Guia completo de Chave de IA",
    text: "Se você precisar de chave de IA, a última seção tem um guia passo a passo para cada provedor — inclusive os gratuitos. Tem até tutorial sobre como ativar cartão internacional.",
    target: "section-api-key",
  },
  {
    title: "Tudo certo!",
    text: "Agora você sabe como usar a Wiki. Sempre que tiver dúvida sobre qual nome usar em alguma coluna, ou precisar configurar a IA, volte aqui. Boa sorte nas prospecções!",
    target: null,
  },
];

// ── Estado ────────────────────────────────────────────────────────────────────

const WIKI_TOUR_KEY = "bluLiteWikiTourDone";
let wikiTourIndex = 0;

// ── Utilitários ───────────────────────────────────────────────────────────────

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
}

function chips(items, cls) {
  return items.map((i) => `<span class="chip ${cls}">${esc(i)}</span>`).join("");
}

// ── Tabela de colunas ─────────────────────────────────────────────────────────

function colTable(cols, showBad = true) {
  if (!cols || !cols.length) return `<p class="wiki-note">Nenhuma coluna obrigatória — este script funciona com qualquer planilha.</p>`;
  const hasBad = showBad && cols.some((c) => c.bad && c.bad.length);
  const extra = hasBad ? "<th>✗ Não reconhecido (vai precisar de IA)</th>" : "";
  const rows = cols.map((c) => `
    <tr>
      <td>${esc(c.label)}</td>
      <td><div class="chip-group">${chips(c.ok, "chip-ok")}</div></td>
      <td><div class="chip-group">${chips(c.synonyms || [], "chip-warn")}</div></td>
      ${hasBad ? `<td><div class="chip-group">${chips(c.bad || [], "chip-err")}</div></td>` : ""}
    </tr>`).join("");
  return `
    <table class="wiki-cols-table">
      <thead><tr><th>Para quê serve a coluna</th><th>✓ Nome certo</th><th>~ Sinônimos aceitos</th>${extra}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Card de processo ──────────────────────────────────────────────────────────

function renderProcess(p) {
  const aiTag = p.needsAi
    ? `<span class="wiki-ai-tag">Requer chave de IA</span>`
    : `<span class="wiki-ai-tag wiki-ai-tag--free">Sem chave de IA</span>`;

  let columnsHtml = "";
  if (p.noColumns) {
    columnsHtml = `<div class="wiki-section"><h3>Colunas esperadas</h3><p class="wiki-note">Nenhuma. Este script funciona com qualquer planilha, independente dos cabeçalhos.</p></div>`;
  } else if (p.isUni) {
    columnsHtml = `
      <div class="wiki-section">
        <h3>Planilha de Empresas — colunas esperadas</h3>
        ${colTable(p.companyColumns, false)}
      </div>
      <div class="wiki-section">
        <h3>Planilha de Sócios — colunas esperadas</h3>
        ${colTable(p.partnerColumns, false)}
        <p class="wiki-note" style="margin-top:10px;"><strong>prioridade:</strong> número inteiro — menor valor = sócio aparece primeiro como "Contato 1". Se não tiver essa coluna, a ordem é a da planilha original.</p>
      </div>`;
  } else if (p.isZenvia) {
    columnsHtml = `
      <div class="wiki-section">
        <h3>Colunas detectadas automaticamente pelo nome</h3>
        <p style="font-size:13px;color:#475569;margin-bottom:10px;">Não há colunas obrigatórias. O script identifica colunas de telefone pelas palavras-chave no cabeçalho:</p>
        <table class="wiki-cols-table">
          <thead><tr><th>Padrão reconhecido</th><th>Exemplos de nomes aceitos</th></tr></thead>
          <tbody>${p.autoDetect.map((a) => `
            <tr>
              <td><code>${esc(a.pattern)}</code></td>
              <td><div class="chip-group">${chips(a.examples, "chip-ok")}</div></td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="wiki-section">
        <h3>Exemplos de transformação</h3>
        <table class="wiki-cols-table">
          <thead><tr><th>O que estava na célula</th><th>O que fica depois do script</th></tr></thead>
          <tbody>${p.examples.map((e) => `
            <tr>
              <td><code>${esc(e.before)}</code></td>
              <td><span class="chip chip-ok">${esc(e.after)}</span></td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  } else {
    columnsHtml = `
      <div class="wiki-section">
        <h3>Colunas que a planilha precisa ter</h3>
        ${colTable(p.columns)}
        ${p.needsAi ? `<p class="wiki-note" style="margin-top:10px;"><strong>Atenção:</strong> Este script precisa de chave de IA. Veja como conseguir na seção <a href="#section-api-key" onclick="openSection('api-key')" style="color:var(--brand);text-decoration:underline;">Chave de API de IA</a> abaixo.</p>` : ""}
      </div>`;
  }

  const outputHtml = p.outputs && p.outputs.length
    ? `<div class="wiki-section">
         <h3>O que é adicionado ao resultado</h3>
         <div class="chip-group">${chips(p.outputs, "chip-out")}</div>
         ${p.outputNote ? `<p class="wiki-note" style="margin-top:10px;">${esc(p.outputNote)}</p>` : ""}
       </div>`
    : p.outputNote ? `<p class="wiki-note">${esc(p.outputNote)}</p>` : "";

  const tipsHtml = p.tips && p.tips.length
    ? `<div class="wiki-section">
         <h3>Dicas importantes</h3>
         <ul class="wiki-flow">${p.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
       </div>`
    : "";

  return `
    <article class="wiki-card" id="section-${p.id}">
      <button class="wiki-toggle" onclick="toggleSection('${p.id}')" aria-expanded="false">
        <div class="wiki-header-inner">
          <span class="wiki-card-badge">${p.badge}</span>
          <div class="wiki-header-text">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
              <h2 style="margin:0;font-size:17px;color:#fff;">${esc(p.title)}</h2>
              ${aiTag}
            </div>
            <p style="color:#9fb2c8;font-size:13px;margin:4px 0 0;">${esc(p.tagline)}</p>
          </div>
        </div>
        <span class="wiki-chevron">▼</span>
      </button>
      <div class="wiki-body wiki-collapsed" id="body-${p.id}">
        <p class="wiki-description">${esc(p.description)}</p>
        <div class="wiki-section">
          <h3>Passo a passo — o que acontece quando você clica em Executar</h3>
          <ol class="wiki-flow">${p.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
        </div>
        ${columnsHtml}
        ${outputHtml}
        ${tipsHtml}
      </div>
    </article>`;
}

// ── Seção de Chave de API ─────────────────────────────────────────────────────

function renderApiSection() {
  const providerBtns = API_PROVIDERS.map((p, i) =>
    `<button class="wiki-prov-btn${i === 0 ? " active" : ""}" onclick="selectProvider('${p.id}')" id="prov-btn-${p.id}">
       <span class="chip ${p.badgeClass}" style="font-size:10px;padding:2px 6px;">${p.badge}</span>
       ${esc(p.name)}
     </button>`).join("");

  const providerPanels = API_PROVIDERS.map((p, i) => `
    <div class="wiki-prov-panel${i === 0 ? "" : " hidden"}" id="prov-panel-${p.id}">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
        <h3 style="margin:0;font-size:16px;">${esc(p.name)}</h3>
        <span class="chip ${p.badgeClass}">${p.badge}</span>
      </div>
      <div class="wiki-two-col" style="margin-bottom:14px;">
        <div class="wiki-note" style="border-color:#86efac;"><strong>Plano gratuito:</strong> ${esc(p.freeDetail)}</div>
        <div class="wiki-note" style="border-color:#fdba74;"><strong>Plano pago:</strong> ${esc(p.paidDetail)}</div>
      </div>
      <div class="wiki-info-row">
        <span><strong>Modelo recomendado:</strong> <code>${esc(p.model)}</code></span>
        <span><strong>Cartão obrigatório:</strong> ${esc(p.creditCard)}</span>
        <span><strong>Preço inicial:</strong> ${esc(p.price)}</span>
      </div>
      <h4 style="margin:16px 0 10px;font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;">Passo a passo para obter a chave</h4>
      <ol class="wiki-steps-list">
        ${p.steps.map((s, i2) => `
          <li class="wiki-step-item">
            <span class="wiki-step-num">${i2 + 1}</span>
            <div><strong>${esc(s.label)}:</strong> ${esc(s.text)}</div>
          </li>`).join("")}
      </ol>
    </div>`).join("");

  const compareRows = API_PROVIDERS.map((p) => `
    <tr>
      <td><strong>${esc(p.name)}</strong></td>
      <td>${p.badgeClass === "chip-ok" ? '<span class="chip chip-ok">Sim</span>' : '<span class="chip chip-err">Não</span>'}</td>
      <td>${p.creditCard.startsWith("Não") ? '<span class="chip chip-ok">Não</span>' : '<span class="chip chip-warn">Sim</span>'}</td>
      <td>${esc(p.price)}</td>
    </tr>`).join("");

  return `
    <article class="wiki-card" id="section-api-key">
      <button class="wiki-toggle" onclick="toggleSection('api-key')" aria-expanded="false">
        <div class="wiki-header-inner">
          <span class="wiki-card-badge" style="background:#7c3aed;">IA</span>
          <div class="wiki-header-text">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
              <h2 style="margin:0;font-size:17px;color:#fff;">O que é uma Chave de API de IA e como conseguir</h2>
            </div>
            <p style="color:#9fb2c8;font-size:13px;margin:4px 0 0;">Guia completo para configurar a IA — sem precisar saber nada de tecnologia</p>
          </div>
        </div>
        <span class="wiki-chevron">▼</span>
      </button>
      <div class="wiki-body wiki-collapsed" id="body-api-key">

        <div class="wiki-section">
          <h3>O que é uma Chave de API?</h3>
          <p class="wiki-description">
            Pense na chave de API como uma <strong>senha especial</strong> que você cria no site do provedor de IA. Essa senha dá permissão para o BLU Auto usar a inteligência artificial em seu nome — sem você precisar entrar no site toda vez.
            <br><br>
            Você cria a chave uma única vez, copia o código gerado e cola nas Configurações do painel. A chave fica salva só no seu navegador e nunca é compartilhada com ninguém.
          </p>
        </div>

        <div class="wiki-section">
          <h3>Quando você precisa de uma chave?</h3>
          <div class="wiki-two-col">
            <div class="wiki-note" style="border-color:#86efac;">
              <strong>Não precisa de chave:</strong><br><br>
              Dono do Zap, Formatar Planilha, Validar Tempo/MEI, Unificar Empresas + Sócios, Zenvia
            </div>
            <div class="wiki-note" style="border-color:#fdba74;">
              <strong>Precisa de chave:</strong><br><br>
              Avaliar ICP com IA — e também quando a planilha tem cabeçalhos não reconhecidos e você quer que a IA corrija automaticamente
            </div>
          </div>
        </div>

        <div class="wiki-section">
          <h3>Escolha o provedor — clique para ver o passo a passo</h3>
          <div class="wiki-prov-tabs" id="wikiProviderTabs">${providerBtns}</div>
          <div id="wikiProviderPanels" style="margin-top:16px;">${providerPanels}</div>
        </div>

        <div class="wiki-section">
          <h3>Como ativar compras internacionais no cartão</h3>
          <p class="wiki-note" style="margin-bottom:12px;">Os provedores pagos (OpenAI, Anthropic, DeepSeek) cobram em dólar. A maioria dos cartões de crédito brasileiros aceita, desde que compras internacionais estejam habilitadas. Veja como fazer:</p>
          <ol class="wiki-flow">
            <li>Abra o aplicativo do seu banco ou ligue para a central.</li>
            <li>Procure a opção <strong>"Compras internacionais"</strong> ou <strong>"Habilitar uso no exterior"</strong>.</li>
            <li>Ative. Em alguns bancos é instantâneo, em outros pode demorar até 24 horas.</li>
            <li><strong>Cartões virtuais</strong> (Nubank, Inter, C6, PicPay etc.) geralmente já vêm com compras internacionais habilitadas — é só usar.</li>
            <li>Ao cadastrar no site do provedor, use o nome <strong>exatamente como está no cartão</strong> e o endereço de cobrança correto.</li>
          </ol>
        </div>

        <div class="wiki-section">
          <h3>Comparativo rápido dos provedores</h3>
          <table class="wiki-cols-table">
            <thead><tr><th>Provedor</th><th>Tem plano grátis?</th><th>Cartão obrigatório?</th><th>Preço para começar</th></tr></thead>
            <tbody>${compareRows}</tbody>
          </table>
          <p class="wiki-note" style="margin-top:10px;"><strong>Recomendação para quem quer começar sem gastar nada:</strong> use o <strong>Google Gemini</strong> — é gratuito, não pede cartão e funciona muito bem para o Avaliar ICP.</p>
        </div>

      </div>
    </article>`;
}

// ── Tour da Wiki ──────────────────────────────────────────────────────────────

function renderTourStep() {
  const step = WIKI_TOUR_STEPS[wikiTourIndex];
  const panel = document.getElementById("wikiTourPanel");
  if (!panel) return;
  panel.querySelector("#wikiTourTitle").textContent = step.title;
  panel.querySelector("#wikiTourText").textContent = step.text;
  panel.querySelector("#wikiTourDots").innerHTML = WIKI_TOUR_STEPS
    .map((_, i) => `<span class="onboarding-dot${i === wikiTourIndex ? " active" : ""}"></span>`).join("");
  panel.querySelector("#wikiTourPrev").disabled = wikiTourIndex === 0;
  panel.querySelector("#wikiTourNext").textContent = wikiTourIndex === WIKI_TOUR_STEPS.length - 1 ? "Concluir" : "Próximo";

  document.querySelectorAll(".tour-target").forEach((el) => el.classList.remove("tour-target"));
  if (step.target) {
    const target = document.getElementById(step.target);
    if (target) {
      target.classList.add("tour-target");
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
}

function openWikiTour(force) {
  if (!force && localStorage.getItem(WIKI_TOUR_KEY) === "yes") return;
  wikiTourIndex = 0;
  document.getElementById("wikiTourBackdrop").classList.remove("hidden");
  renderTourStep();
}

function closeWikiTour(done) {
  document.getElementById("wikiTourBackdrop").classList.add("hidden");
  document.querySelectorAll(".tour-target").forEach((el) => el.classList.remove("tour-target"));
  if (done) localStorage.setItem(WIKI_TOUR_KEY, "yes");
}

function nextWikiTour() {
  if (wikiTourIndex >= WIKI_TOUR_STEPS.length - 1) { closeWikiTour(true); return; }
  wikiTourIndex++;
  renderTourStep();
}

function prevWikiTour() {
  if (wikiTourIndex > 0) { wikiTourIndex--; renderTourStep(); }
}

// ── Toggle seção ──────────────────────────────────────────────────────────────

function toggleSection(id) {
  const body = document.getElementById("body-" + id);
  const btn = document.getElementById("section-" + id).querySelector(".wiki-toggle");
  const chevron = btn.querySelector(".wiki-chevron");
  const isOpen = !body.classList.contains("wiki-collapsed");
  body.classList.toggle("wiki-collapsed", isOpen);
  chevron.style.transform = isOpen ? "" : "rotate(180deg)";
  btn.setAttribute("aria-expanded", String(!isOpen));
}

function openSection(id) {
  const section = document.getElementById("section-" + id);
  const body = document.getElementById("body-" + id);
  if (!section || !body) return;
  const btn = section.querySelector(".wiki-toggle");
  const chevron = btn.querySelector(".wiki-chevron");
  body.classList.remove("wiki-collapsed");
  chevron.style.transform = "rotate(180deg)";
  btn.setAttribute("aria-expanded", "true");
  section.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Abas de provedor ──────────────────────────────────────────────────────────

function selectProvider(id) {
  document.querySelectorAll(".wiki-prov-btn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".wiki-prov-panel").forEach((p) => p.classList.add("hidden"));
  const btn = document.getElementById("prov-btn-" + id);
  const panel = document.getElementById("prov-panel-" + id);
  if (btn) btn.classList.add("active");
  if (panel) panel.classList.remove("hidden");
}

// ── Construção principal ──────────────────────────────────────────────────────

function buildWiki() {
  const container = document.getElementById("tabWiki");
  if (!container) return;

  const navItems = [
    ...WIKI_PROCESSES.map((p) => ({ id: p.id, label: p.badge + ": " + p.title.split("—")[0].trim().split(" ").slice(0, 3).join(" ") })),
    { id: "api-key", label: "IA: Chave de API" },
  ];

  container.innerHTML = `
    <div class="topbar">
      <div>
        <h1>Wiki — Guia dos Scripts</h1>
        <p class="sub">Clique em qualquer processo para expandir. Aqui você encontra tudo sobre colunas, fluxos e configuração de IA.</p>
      </div>
      <button class="btn btn-ghost" onclick="openWikiTour(true)">Tour da Wiki</button>
    </div>

    <div class="wiki-legend" id="wikiLegend">
      <span class="chip chip-ok">✓ Certo</span><span>Nome reconhecido diretamente — perfeito</span>
      <span class="chip chip-warn">~ Sinônimo</span><span>Reconhecido automaticamente sem IA</span>
      <span class="chip chip-err">✗ Não reconhecido</span><span>Precisará de IA para corrigir</span>
      <span class="chip chip-out">+ Saída</span><span>Coluna adicionada ao resultado</span>
    </div>

    <nav class="wiki-nav" id="wikiNav" aria-label="Ir para seção">
      ${navItems.map((n) => `<button class="wiki-nav-btn" onclick="openSection('${n.id}')">${esc(n.label)}</button>`).join("")}
    </nav>

    <div class="wiki-list">
      ${WIKI_PROCESSES.map(renderProcess).join("")}
      ${renderApiSection()}
    </div>

    <div class="onboarding-backdrop hidden" id="wikiTourBackdrop">
      <div class="onboarding-card" id="wikiTourPanel" role="dialog" aria-modal="true">
        <div class="onboarding-media">
          <h2 id="wikiTourTitle" style="margin:0;font-size:22px;"></h2>
          <p id="wikiTourText" style="margin-top:10px;color:rgba(255,255,255,.88);line-height:1.6;font-size:15px;"></p>
        </div>
        <div class="onboarding-body">
          <div class="onboarding-progress" id="wikiTourDots"></div>
          <div class="onboarding-actions">
            <button class="btn btn-ghost" onclick="closeWikiTour(true)">Pular tour</button>
            <div style="display:flex;gap:10px;">
              <button class="btn btn-ghost" id="wikiTourPrev" onclick="prevWikiTour()">Voltar</button>
              <button class="btn btn-primary" id="wikiTourNext" onclick="nextWikiTour()">Próximo</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  openWikiTour(false);
}

// ── Expor globais para onclick ────────────────────────────────────────────────

window.toggleSection  = toggleSection;
window.openSection    = openSection;
window.selectProvider = selectProvider;
window.openWikiTour   = openWikiTour;
window.closeWikiTour  = closeWikiTour;
window.nextWikiTour   = nextWikiTour;
window.prevWikiTour   = prevWikiTour;

document.addEventListener("DOMContentLoaded", buildWiki);
