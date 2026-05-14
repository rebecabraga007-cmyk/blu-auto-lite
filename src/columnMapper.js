const { callAI, extractJson } = require("./ai");
const { normalizeHeader } = require("./spreadsheet");

const REQUIRED_COLUMNS = {
  dz: [
    "Empresa",
    "Nome contato",
    "Nome contato 1",
    "Fone movel contato 1",
    "Telefone",
    "Telefone 2"
  ],
  enrich: ["Empresa", "Cidade", "Estado", "Site"],
  meetime_check: ["CNPJ", "Empresa", "Nome", "Email contato 1", "email", "telefone", "Telefone", "Fone movel contato 1"],
  meetime_fill_verification: ["CNPJ", "Empresa"],
  meetime_filter_new: ["CNPJ", "Empresa"],
  company_age_mei: ["CNPJ", "Empresa"],
  uni_company: ["CNPJ", "trading_name", "company_name", "DDD_TEL1", "TEL1", "city", "district", "Site"],
  uni_partner: ["CNPJ", "nome", "cargo_socio", "email_1", "ddd_cel1", "cel1", "ddd_cel2", "cel2", "ddd_cel3", "cel3", "prioridade"]
};

const SYNONYMS = {
  Empresa: ["empresa", "nome empresa", "razao social", "nome fantasia", "company", "company name", "trading name"],
  Cidade: ["cidade", "municipio", "city"],
  Estado: ["estado", "uf", "district"],
  Site: ["site", "website", "url", "homepage"],
  "Nome contato": ["nome contato", "nome do contato", "socio", "nome socio", "contact name"],
  "Nome contato 1": ["nome contato 1", "nome do socio 1", "socio 1", "contato 1"],
  "Fone movel contato 1": ["fone movel contato 1", "telefone socio 1", "telefone contato 1", "telemovel contato 1", "celular contato 1"],
  Telefone: ["telefone", "telemovel", "celular", "whatsapp", "phone"],
  telefone: ["telefone", "telemovel", "celular", "whatsapp", "phone", "lead phone"],
  Nome: ["nome", "nome lead", "lead name", "contato", "cliente"],
  email: ["email", "e mail", "lead email", "email contato", "email contato 1"],
  "Email contato 1": ["email contato 1", "email do contato 1", "email socio 1", "email"],
  CNPJ: ["cnpj", "documento", "tax id", "cpf cnpj", "cnpj empresa", "documento empresa", "company document"],
  trading_name: ["trading name", "nome fantasia", "fantasia"],
  company_name: ["company name", "razao social", "empresa"],
  DDD_TEL1: ["ddd tel1", "ddd telefone", "ddd"],
  TEL1: ["tel1", "telefone empresa", "phone"],
  city: ["city", "cidade", "municipio"],
  district: ["district", "estado", "uf"],
  nome: ["nome", "nome socio", "socio", "partner name"],
  cargo_socio: ["cargo socio", "cargo", "funcao", "job title"],
  email_1: ["email 1", "email", "e mail"],
  ddd_cel1: ["ddd cel1", "ddd celular 1"],
  cel1: ["cel1", "celular 1", "telefone 1", "telemovel 1"],
  ddd_cel2: ["ddd cel2", "ddd celular 2"],
  cel2: ["cel2", "celular 2", "telefone 2", "telemovel 2"],
  ddd_cel3: ["ddd cel3", "ddd celular 3"],
  cel3: ["cel3", "celular 3", "telefone 3", "telemovel 3"],
  prioridade: ["prioridade", "priority", "ordem"]
};

function deterministicMapping(headers, required) {
  const normalizedHeaders = new Map(headers.map((h) => [normalizeHeader(h), h]));
  const mapping = {};
  const usedHeaders = new Set();

  for (const target of required) {
    const candidates = [target, ...(SYNONYMS[target] || [])].map(normalizeHeader);
    const exact = candidates.find((candidate) => normalizedHeaders.has(candidate));
    const exactHeader = exact ? normalizedHeaders.get(exact) : "";
    if (exactHeader && !usedHeaders.has(exactHeader)) {
      mapping[exactHeader] = target;
      usedHeaders.add(exactHeader);
      continue;
    }

    const fuzzy = headers.find((header) => {
      if (usedHeaders.has(header)) return false;
      const h = normalizeHeader(header);
      return candidates.some((candidate) => h.includes(candidate) || candidate.includes(h));
    });
    if (fuzzy) {
      mapping[fuzzy] = target;
      usedHeaders.add(fuzzy);
    }
  }

  return mapping;
}

async function aiMapping(headers, required, settings) {
  const prompt = `Voce normaliza titulos de colunas de planilhas brasileiras.
Retorne somente JSON no formato {"titulo_original":"Titulo Padrao"}.
Use apenas titulos originais existentes e apenas estes titulos padrao.
Nao invente colunas. Nao mapeie a mesma coluna original para mais de um titulo padrao.
Se uma coluna padrao nao existir de forma confiavel, omita.
${JSON.stringify(required)}

Titulos originais:
${JSON.stringify(headers)}

Mapeie sinonimos e variacoes como "telemovel" para "Telefone" quando fizer sentido.`;

  const text = await callAI(settings, prompt, 600);
  const parsed = extractJson(text);
  return parsed && !Array.isArray(parsed) ? parsed : {};
}

function missingRequiredTargets(mapping, required) {
  const mappedTargets = new Set(Object.values(mapping).filter((value) => !String(value).startsWith("__")));
  return required.filter((col) => !mappedTargets.has(col));
}

function mergeAndSanitizeMapping(baseMapping, aiMappingResult, headers, required) {
  const headerSet = new Set(headers);
  const allowedTargets = new Set(required);
  const next = {};
  const usedHeaders = new Set();
  const usedTargets = new Set();

  for (const [from, to] of Object.entries(baseMapping || {})) {
    if (String(from).startsWith("__")) {
      next[from] = to;
      continue;
    }
    if (!headerSet.has(from) || !allowedTargets.has(to) || usedHeaders.has(from) || usedTargets.has(to)) continue;
    next[from] = to;
    usedHeaders.add(from);
    usedTargets.add(to);
  }

  for (const [from, to] of Object.entries(aiMappingResult || {})) {
    if (String(from).startsWith("__")) continue;
    if (!headerSet.has(from) || !allowedTargets.has(to) || usedHeaders.has(from) || usedTargets.has(to)) continue;
    next[from] = to;
    usedHeaders.add(from);
    usedTargets.add(to);
  }

  return next;
}

async function normalizeRowsForAction(rows, action, settings, subtype = null) {
  if (!rows.length) return { rows, mapping: {}, usedAI: false };

  const headers = Object.keys(rows[0]);
  const key = subtype ? `${action}_${subtype}` : action;
  const required = REQUIRED_COLUMNS[key] || REQUIRED_COLUMNS[action] || [];
  if (!required.length) return { rows, mapping: {}, usedAI: false };

  let mapping = deterministicMapping(headers, required);
  let usedAI = false;
  let missing = missingRequiredTargets(mapping, required);

  if (missing.length && settings.aiToken) {
    try {
      const aiResult = await aiMapping(headers, missing, settings);
      mapping = mergeAndSanitizeMapping(mapping, aiResult, headers, required);
      usedAI = true;
      missing = missingRequiredTargets(mapping, required);
      if (missing.length) mapping.__missing = missing.join(", ");
    } catch (error) {
      mapping.__ai_error = error.message;
    }
  } else if (missing.length) {
    mapping.__missing = missing.join(", ");
  }

  const normalized = rows.map((row) => {
    const next = { ...row };
    for (const [from, to] of Object.entries(mapping)) {
      if (from.startsWith("__")) continue;
      if (Object.prototype.hasOwnProperty.call(row, from) && !Object.prototype.hasOwnProperty.call(next, to)) {
        next[to] = row[from];
      }
    }
    return next;
  });

  return { rows: normalized, mapping, usedAI };
}

module.exports = { normalizeRowsForAction };
