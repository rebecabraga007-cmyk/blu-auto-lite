const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getValue, normalizeHeader } = require("./spreadsheet");
const { callAI, extractJson } = require("./ai");
const { DATA_DIR, ensureDir } = require("./paths");

const CHECKPOINT_DIR = path.join(DATA_DIR, "checkpoints");

function digits(value) {
  return String(value || "").split(".")[0].replace(/\D/g, "");
}

function truthy(value) {
  if (typeof value === "boolean") return value;
  const normalized = normalizeHeader(value);
  return ["s", "sim", "true", "1", "mei", "simei", "optante", "ativo", "yes"].includes(normalized);
}

function parseBrazilianDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function localMeiValue(row) {
  for (const [key, value] of Object.entries(row || {})) {
    const normalized = normalizeHeader(key);
    if (normalized === "mei" || normalized === "simei" || normalized.includes("optante pelo mei") || normalized.includes("opcao pelo mei")) {
      return truthy(value);
    }
  }
  return null;
}

function detectMeiFromCnpjData(data, row) {
  const local = localMeiValue(row);
  if (local !== null) return local;

  for (const [key, value] of Object.entries(data || {})) {
    const normalized = normalizeHeader(key);
    if ((normalized.includes("mei") || normalized.includes("simei")) && truthy(value)) return true;
  }

  const porte = normalizeHeader(data?.porte || data?.descricao_porte);
  const natureza = normalizeHeader(data?.natureza_juridica || data?.descricao_natureza_juridica);
  return porte.includes("mei") || natureza.includes("microempreendedor individual");
}

function phoneForApi(value) {
  const raw = digits(value);
  if (raw.length < 10) return "";
  return raw.startsWith("55") ? raw : `55${raw}`;
}

function phoneMask(value) {
  let raw = digits(value);
  if (raw.startsWith("55")) raw = raw.slice(2);
  if (raw.length === 11) return `(${raw.slice(0, 2)}) ${raw.slice(2, 7)}-${raw.slice(7)}`;
  if (raw.length === 10) return `(${raw.slice(0, 2)}) ${raw.slice(2, 6)}-${raw.slice(6)}`;
  return raw;
}

function firstNameMatches(contactName, names) {
  const first = String(contactName || "").split(/\s+/)[0]?.toUpperCase();
  if (!first || first.length < 3) return false;
  return names.some((name) => String(name || "").toUpperCase().includes(first));
}

function phoneColumns(row) {
  const result = [];
  for (const key of Object.keys(row)) {
    const norm = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (norm === "telefone" || norm.startsWith("telefone ") || norm.includes("fone movel contato")) {
      const match = norm.match(/(\d+)/);
      result.push({ index: match ? Number(match[1]) : 1, key });
    }
  }
  return result.sort((a, b) => a.index - b.index);
}

async function consultDonoDoZap(phone, settings) {
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0",
    Origin: "https://donodozap.com",
    Referer: "https://donodozap.com/"
  };
  if (settings.donodozapToken) headers.Authorization = `Bearer ${settings.donodozapToken}`;

  const response = await axios.post("https://donodozap.com/api/verify", { phone }, { headers, timeout: 25000 });
  const accounts = response.data?.accounts || [];
  return accounts
    .map((account) => account.NOME || account.name)
    .filter(Boolean)
    .map((name) => String(name).trim().toUpperCase());
}

async function processDonoDoZap(rows, settings, onProgress = () => {}) {
  const output = [];
  const logs = [];
  const totalPhones = rows.reduce((total, row) => {
    return total + phoneColumns(row).reduce((sum, col) => {
      return sum + String(row[col.key] || "").split(/\r?\n/).filter((value) => phoneForApi(value)).length;
    }, 0);
  }, 0);
  let checkedPhones = 0;

  onProgress({
    stage: "Consultando Dono do Zap",
    total: totalPhones,
    done: 0,
    remaining: totalPhones,
    detail: `${rows.length} linhas carregadas para validacao.`
  });

  for (const [rowIndex, row] of rows.entries()) {
    const next = { ...row };
    const cols = phoneColumns(next);
    const company = getValue(next, ["Empresa", "Nome", "company_name", "trading_name"]) || `Linha ${rowIndex + 1}`;

    for (const { index, key } of cols) {
      const contactName = getValue(next, [`Nome contato ${index}`, "Nome contato"]);
      const values = String(next[key] || "").split(/\r?\n/).filter(Boolean);
      const results = [];

      for (const value of values) {
        const apiPhone = phoneForApi(value);
        if (!apiPhone) continue;
        const masked = phoneMask(apiPhone);
        onProgress({
          stage: "Consultando Dono do Zap",
          total: totalPhones,
          done: checkedPhones,
          remaining: totalPhones - checkedPhones,
          detail: `${company} | Socio ${index}: ${contactName || "sem nome"} | ${masked}`
        });

        try {
          const names = await consultDonoDoZap(apiPhone, settings);
          let detailResult = "";
          if (!names.length) {
            results.push(`${masked}: Sem dados`);
            detailResult = "Sem dados";
          } else if (firstNameMatches(contactName, names)) {
            results.push(`${masked}: ${String(contactName).toUpperCase()}`);
            detailResult = "SIM, pertence ao socio";
          } else {
            results.push(`${masked}: Outros Vinculos`);
            detailResult = "NAO, outro vinculo";
          }
          checkedPhones += 1;
          onProgress({
            stage: "Consultando Dono do Zap",
            total: totalPhones,
            done: checkedPhones,
            remaining: totalPhones - checkedPhones,
            detail: `${company} | Socio ${index}: ${contactName || "sem nome"} | ${masked} -> ${detailResult}`
          });
        } catch (error) {
          checkedPhones += 1;
          results.push(`${masked}: Erro API`);
          logs.push(`Dono do Zap falhou para ${apiPhone}: ${error.message}`);
          onProgress({
            stage: "Consultando Dono do Zap",
            total: totalPhones,
            done: checkedPhones,
            remaining: totalPhones - checkedPhones,
            detail: `${company} | Socio ${index}: ${contactName || "sem nome"} | ${masked} -> erro`
          });
        }
      }

      next[`VERIFICADO - ${index}`] = results.join("\n");
    }
    output.push(next);
  }

  return { rows: output, logs };
}

function processStyle(rows) {
  return {
    rows,
    logs: ["A formatacao visual e aplicada no arquivo Excel de saida pelo aplicativo leitor. Os dados foram preservados."]
  };
}

async function fetchCnpjData(cnpj) {
  const response = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
    timeout: Number(process.env.CNPJ_API_TIMEOUT_MS || 30000),
    headers: { "User-Agent": "blu-auto-lite/1.0" },
    validateStatus: (status) => (status >= 200 && status < 300) || status === 404
  });
  if (response.status === 404) return { ok: false, error: "CNPJ nao encontrado" };
  return { ok: true, data: response.data || {} };
}

async function processCompanyAgeMei(rows, _settings = {}, onProgress = () => {}) {
  const output = [];
  const logs = [];
  const cache = new Map();
  const minDays = Math.max(1, Number(process.env.COMPANY_AGE_MIN_DAYS || 365));
  const delayMs = Math.max(0, Number(process.env.CNPJ_API_DELAY_MS || 350));
  let done = 0;
  let redRows = 0;

  onProgress({
    stage: "Validando tempo e MEI",
    total: rows.length,
    done: 0,
    remaining: rows.length,
    detail: `${rows.length} empresas prontas para validar por CNPJ.`
  });

  for (const [rowIndex, row] of rows.entries()) {
    const next = { ...row };
    const company = getValue(next, ["Empresa", "Razao Social", "Nome", "Nome Fantasia"]) || `Linha ${rowIndex + 2}`;
    const cnpj = digits(getValue(next, ["CNPJ", "cnpj", "Documento", "CPF/CNPJ"]));
    let result = null;

    if (cnpj.length !== 14) {
      result = { ok: false, error: "CNPJ ausente ou invalido" };
    } else if (cache.has(cnpj)) {
      result = cache.get(cnpj);
    } else {
      onProgress({
        stage: "Consultando CNPJ",
        total: rows.length,
        done,
        remaining: rows.length - done,
        detail: `${company} | ${cnpj} -> consultando dados publicos.`
      });
      try {
        result = await fetchCnpjData(cnpj);
      } catch (error) {
        result = { ok: false, error: error.response?.data?.message || error.message };
      }
      cache.set(cnpj, result);
      if (delayMs > 0 && rowIndex < rows.length - 1) await sleep(delayMs);
    }

    let openingDate = null;
    let ageDays = "";
    let isMei = false;
    let error = "";
    const reasons = [];

    if (result.ok) {
      const data = result.data || {};
      openingDate = parseBrazilianDate(data.data_inicio_atividade || data.data_abertura || data.abertura);
      if (openingDate) {
        ageDays = Math.floor((Date.now() - openingDate.getTime()) / (24 * 60 * 60 * 1000));
        if (ageDays < minDays) reasons.push(`menos de ${minDays} dias`);
      } else {
        error = "Data de abertura nao encontrada";
      }
      isMei = detectMeiFromCnpjData(data, next);
      if (isMei) reasons.push("MEI");
    } else {
      error = result.error || "Erro na consulta";
    }

    next["Receita - Data abertura"] = openingDate ? openingDate.toISOString().slice(0, 10) : "";
    next["Receita - Idade dias"] = ageDays;
    next["Receita - MEI"] = isMei ? "Sim" : "Nao";
    next["Receita - Motivo alerta"] = reasons.join("; ");
    next["Receita - Erro"] = error;

    if (reasons.length) {
      next.__rowFill = "red";
      redRows += 1;
    }

    done += 1;
    onProgress({
      stage: "Validando tempo e MEI",
      total: rows.length,
      done,
      remaining: rows.length - done,
      detail: `${company} | ${cnpj || "sem CNPJ"} -> ${reasons.length ? `alerta: ${reasons.join(", ")}` : "aprovado"}${error ? ` (${error})` : ""}.`
    });
    output.push(next);
  }

  logs.push(`${rows.length} empresas verificadas por tempo de existencia/MEI.`);
  logs.push(`${redRows} linhas pintadas de vermelho.`);
  logs.push("Linhas vermelhas: empresa com menos de 1 ano de existencia ou detectada como MEI.");
  return { rows: output, logs };
}

function joinPhone(ddd, phone) {
  const d = digits(ddd);
  const p = digits(phone);
  if (!d && !p) return "";
  if (d && p && !p.startsWith(d)) return phoneMask(`${d}${p}`);
  return phoneMask(p || d);
}

function processUnify(companyRows, partnerRows) {
  const partnersByCnpj = new Map();
  for (const partner of partnerRows) {
    const cnpj = String(getValue(partner, ["CNPJ", "cnpj"]) || "").trim();
    if (!cnpj) continue;
    if (!partnersByCnpj.has(cnpj)) partnersByCnpj.set(cnpj, []);
    partnersByCnpj.get(cnpj).push(partner);
  }

  const rows = companyRows.map((company) => {
    const cnpj = String(getValue(company, ["CNPJ", "cnpj"]) || "").trim();
    const partners = (partnersByCnpj.get(cnpj) || []).sort((a, b) => Number(a.prioridade || 99) - Number(b.prioridade || 99));
    const next = {
      CNPJ: cnpj,
      Empresa: getValue(company, ["Empresa", "trading_name", "company_name"]),
      Site: getValue(company, ["Site", "site"]),
      telefone: joinPhone(company.DDD_TEL1, company.TEL1),
      Cidade: getValue(company, ["Cidade", "city"]),
      Estado: getValue(company, ["Estado", "district"])
    };

    partners.forEach((partner, idx) => {
      const i = idx + 1;
      next[`Nome contato ${i}`] = getValue(partner, ["nome", `Nome contato ${i}`]);
      next[`Cargo contato ${i}`] = getValue(partner, ["cargo_socio", `Cargo contato ${i}`]);
      next[`Email contato ${i}`] = getValue(partner, ["email_1", `Email contato ${i}`]);
      next[`Fone movel contato ${i}`] = [1, 2, 3].map((n) => joinPhone(partner[`ddd_cel${n}`], partner[`cel${n}`])).filter(Boolean).join("\n");
      next[`Linkedin contato ${i}`] = "";
    });

    next.qtd_socios_total = partners.length;
    next.Anotacoes = "";
    return next;
  });

  rows.sort((a, b) => a.qtd_socios_total - b.qtd_socios_total);
  return { rows, logs: [`${rows.length} empresas unificadas.`] };
}

async function evaluateCompany(row, icpDescription, settings) {
  const prompt = `Analise esta empresa brasileira conforme o ICP.
Empresa: ${row.Empresa || ""}
Cidade/Estado: ${row.Cidade || ""}/${row.Estado || ""}
Site atual: ${row.Site || ""}

ICP:
${icpDescription}

Responda somente JSON:
{"Site":"url ou vazio","Resumo Empresa":"duas frases","ICP Score":0,"ICP Motivo":"uma frase"}`;
  const text = await callAI(settings, prompt, 700);
  return extractJson(text) || {};
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(error) {
  return error?.response?.status === 429 || /\b429\b|rate limit|too many requests|limite/i.test(error?.message || "");
}

function retryAfterToMs(value) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return 0;
}

function getAdaptiveDelayMs(aiCallsDone) {
  const baseDelayMs = Math.max(0, Number(process.env.AI_ENRICH_DELAY_MS || 5000));
  const stepEvery = Math.max(1, Number(process.env.AI_ENRICH_DELAY_STEP_EVERY || 10));
  const stepMs = Math.max(0, Number(process.env.AI_ENRICH_DELAY_STEP_MS || 5000));
  const maxDelayMs = Math.max(baseDelayMs, Number(process.env.AI_ENRICH_DELAY_MAX_MS || 60000));
  const completedBlocks = Math.floor(aiCallsDone / stepEvery);
  return Math.min(maxDelayMs, baseDelayMs + completedBlocks * stepMs);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function checkpointKey(action, rows, extra = {}) {
  const payload = stableJson({ action, rows, ...extra });
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

function checkpointPath(key) {
  ensureDir(CHECKPOINT_DIR);
  return path.join(CHECKPOINT_DIR, `${key}.json`);
}

function readCheckpoint(key) {
  try {
    return JSON.parse(fs.readFileSync(checkpointPath(key), "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

function writeCheckpoint(key, checkpoint) {
  const filePath = checkpointPath(key);
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify({ ...checkpoint, updatedAt: new Date().toISOString() }, null, 2), "utf8");
  fs.renameSync(tmpPath, filePath);
}

async function evaluateCompanyWithRetry(row, icpDescription, settings, onProgress, progressBase, label) {
  const maxAttempts = Math.max(1, Number(process.env.AI_RETRY_MAX || 5));
  const baseWaitMs = Math.max(1000, Number(process.env.AI_RETRY_BASE_MS || 15000));
  const maxWaitMs = Math.max(baseWaitMs, Number(process.env.AI_RETRY_MAX_MS || 120000));
  let waitMs = baseWaitMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await evaluateCompany(row, icpDescription, settings);
    } catch (error) {
      if (!isRateLimitError(error)) throw error;

      const retryAfterMs = retryAfterToMs(error.response?.headers?.["retry-after"]);
      const pauseMs = Math.min(maxWaitMs, retryAfterMs || waitMs);
      if (attempt >= maxAttempts) {
        const limitError = new Error(
          `Limite da IA atingido (429) apos ${maxAttempts} tentativas. Aguarde alguns minutos ou use uma chave/modelo com mais limite.`
        );
        limitError.stopProcessing = true;
        throw limitError;
      }

      onProgress({
        ...progressBase,
        detail: `${label} -> limite da IA (429). Aguardando ${Math.ceil(pauseMs / 1000)}s antes da tentativa ${attempt + 1}/${maxAttempts}.`
      });
      await sleep(pauseMs);
      waitMs = Math.min(maxWaitMs, waitMs * 2);
    }
  }

  return {};
}

async function processEnrich(rows, icpDescription, settings, onProgress = () => {}, options = {}) {
  if (!icpDescription) throw new Error("Informe a descricao do ICP antes de avaliar.");
  const output = [];
  const logs = [];
  const useCheckpoint = options.disableCheckpoint !== true;
  const key = useCheckpoint ? checkpointKey("enrich", rows, { icpDescription, userId: options.userId || "" }) : "";
  const checkpoint = useCheckpoint ? readCheckpoint(key) : null;
  const savedRows = Array.isArray(checkpoint?.rows) ? checkpoint.rows : [];
  let done = 0;
  let aiCallsDone = 0;

  onProgress({
    stage: "Avaliando ICP",
    total: rows.length,
    done: 0,
    remaining: rows.length,
    detail: `${rows.length} empresas prontas para avaliar com IA.`
  });
  if (savedRows.some(Boolean)) {
    const recovered = savedRows.filter(Boolean).length;
    onProgress({
      stage: "Memoria ICP",
      total: rows.length,
      done: recovered,
      remaining: Math.max(rows.length - recovered, 0),
      detail: `${recovered} linhas recuperadas da memoria ICP. Continuando das faltantes.`
    });
  }

  for (const [rowIndex, row] of rows.entries()) {
    const next = { ...row };
    const label = next.Empresa || `Linha ${done + 1}`;
    if (savedRows[rowIndex]) {
      output.push(savedRows[rowIndex]);
      done += 1;
      onProgress({
        stage: "Memoria ICP",
        total: rows.length,
        done,
        remaining: rows.length - done,
        detail: `${label} -> reaproveitado da memoria`
      });
      continue;
    }
    if (!String(next.Empresa || "").trim()) {
      output.push(next);
      savedRows[rowIndex] = next;
      done += 1;
      if (useCheckpoint) writeCheckpoint(key, { action: "enrich", status: "running", total: rows.length, done, rows: savedRows });
      onProgress({
        stage: "Avaliando ICP",
        total: rows.length,
        done,
        remaining: rows.length - done,
        detail: `${label} -> sem empresa; ignorado.`
      });
      continue;
    }
    try {
      const progressBase = {
        stage: "Avaliando ICP",
        total: rows.length,
        done,
        remaining: rows.length - done
      };
      onProgress({
        ...progressBase,
        detail: `${label} -> enviando para IA.`
      });
      const result = await evaluateCompanyWithRetry(next, icpDescription, settings, onProgress, progressBase, label);
      next.Site = next.Site || result.Site || "";
      next["Resumo Empresa"] = next["Resumo Empresa"] || result["Resumo Empresa"] || "";
      next["ICP Score"] = next["ICP Score"] || result["ICP Score"] || "";
      next["ICP Motivo"] = next["ICP Motivo"] || result["ICP Motivo"] || "";
      aiCallsDone += 1;
      done += 1;
      onProgress({
        stage: "Avaliando ICP",
        total: rows.length,
        done,
        remaining: rows.length - done,
        detail: `${label} -> avaliado. Score: ${next["ICP Score"] || "sem score"}.`
      });
      savedRows[rowIndex] = next;
      if (useCheckpoint) writeCheckpoint(key, { action: "enrich", status: done >= rows.length ? "done" : "running", total: rows.length, done, rows: savedRows });
      if (done < rows.length) {
        const delayMs = getAdaptiveDelayMs(aiCallsDone);
        if (delayMs > 0) {
          onProgress({
            stage: "Avaliando ICP",
            total: rows.length,
            done,
            remaining: rows.length - done,
            detail: `Pausa preventiva de ${Math.ceil(delayMs / 1000)}s para evitar limite da IA. ${aiCallsDone} chamadas de IA concluidas.`
          });
          await sleep(delayMs);
        }
      }
    } catch (error) {
      if (error.stopProcessing) {
        logs.push(`ICP interrompido em ${next.Empresa}: ${error.message}`);
        onProgress({
          stage: "Avaliando ICP",
          total: rows.length,
          done,
          remaining: rows.length - done,
          detail: `${label} -> ${error.message}`
        });
        throw error;
      }
      logs.push(`ICP falhou para ${next.Empresa}: ${error.message}`);
      done += 1;
      savedRows[rowIndex] = next;
      if (useCheckpoint) writeCheckpoint(key, { action: "enrich", status: "running", total: rows.length, done, rows: savedRows });
      onProgress({
        stage: "Avaliando ICP",
        total: rows.length,
        done,
        remaining: rows.length - done,
        detail: `${label} -> erro IA: ${error.message}`
      });
    }
    output.push(next);
  }

  if (useCheckpoint) logs.push(`Memoria ICP: checkpoint ${key}; ${savedRows.filter(Boolean).length} linhas salvas.`);
  return { rows: output, logs };
}

module.exports = { processDonoDoZap, processStyle, processUnify, processEnrich, processCompanyAgeMei, phoneMask };
