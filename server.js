const path = require("path");
const fs = require("fs");

const express = require("express");
const multer = require("multer");

const { readWorkbookRows, listWorkbookSheets, writeRows, outputName } = require("./src/spreadsheet");
const { normalizeRowsForAction } = require("./src/columnMapper");
const {
  processDonoDoZap,
  processStyle,
  processUnify,
  processEnrich,
  processCompanyAgeMei
} = require("./src/processors");

const app = express();
const PORT = Number(process.env.PORT || 3100);
const HOST = process.env.HOST || "0.0.0.0";
const TMP_DIR = process.env.BLU_LITE_TMP_DIR || path.join(__dirname, "tmp");
const UPLOAD_DIR = path.join(TMP_DIR, "uploads");
const OUTPUT_DIR = path.join(TMP_DIR, "outputs");
const JOB_DETAIL_LIMIT = 5000;
const OUTPUT_TTL_MS = Number(process.env.BLU_LITE_OUTPUT_TTL_MS || 2 * 60 * 60 * 1000);

for (const dir of [UPLOAD_DIR, OUTPUT_DIR]) fs.mkdirSync(dir, { recursive: true });

const upload = multer({ dest: UPLOAD_DIR });
const jobs = new Map();

const ACTION_PREFIX = {
  dz: "VALIDADO_DONODOZAP_",
  style: "FORMATADO_",
  enrich: "ICP_",
  uni: "UNIFICADO_",
  company_age_mei: "VALIDADO_TEMPO_MEI_"
};

const ACTION_LABEL = {
  dz: "Dono do Zap",
  style: "Formatar planilha",
  enrich: "Avaliar ICP",
  uni: "Unificar empresas + socios",
  company_age_mei: "Validar tempo de existencia/MEI"
};

function createJob(id) {
  if (!id) return;
  jobs.set(id, {
    id,
    status: "running",
    stage: "Preparando",
    total: 0,
    done: 0,
    remaining: 0,
    details: [],
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

function updateJob(id, patch = {}) {
  if (!id || !jobs.has(id)) return;
  const job = jobs.get(id);
  if (patch.detail) {
    job.details.push(`${new Date().toLocaleTimeString("pt-BR")} - ${patch.detail}`);
    job.details = job.details.slice(-JOB_DETAIL_LIMIT);
  }
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
}

function parseSheetNames(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((name) => String(name || "").trim()).filter(Boolean);
  } catch {}
  return String(value).split(",").map((name) => name.trim()).filter(Boolean);
}

function settingsFromBody(body) {
  return {
    aiProvider: String(body.aiProvider || "openai").trim(),
    aiToken: String(body.aiToken || "").trim(),
    aiModel: String(body.aiModel || "").trim(),
    donodozapToken: ""
  };
}

function scheduleDelete(filePath) {
  setTimeout(() => {
    fs.promises.unlink(filePath).catch(() => {});
  }, OUTPUT_TTL_MS).unref();
}

async function cleanupUploads(files) {
  const all = Object.values(files || {}).flat().filter(Boolean);
  await Promise.all(all.map((file) => fs.promises.unlink(file.path).catch(() => {})));
}

async function normalizeForAction(rows, action, settings, logs, jobId, subtype = null) {
  updateJob(jobId, {
    stage: `Normalizando colunas (${ACTION_LABEL[action] || action})`,
    detail: "Verificando se os cabecalhos da planilha sao compativeis com o script."
  });
  const normalized = await normalizeRowsForAction(rows, action, settings, subtype);
  const mappingText = JSON.stringify(normalized.mapping);
  logs.push(`Colunas normalizadas: ${mappingText}`);

  if (normalized.usedAI) {
    logs.push("IA acionada para corrigir cabecalhos incompativeis.");
    updateJob(jobId, {
      stage: `Corrigindo cabecalhos com IA (${ACTION_LABEL[action] || action})`,
      detail: `IA analisou os cabecalhos e retornou: ${mappingText}`
    });
  }

  if (normalized.mapping.__ai_error) {
    throw new Error(`Nao foi possivel corrigir os cabecalhos com IA: ${normalized.mapping.__ai_error}`);
  }

  if (normalized.mapping.__missing) {
    if (!settings.aiToken) {
      throw new Error(`A planilha nao tem cabecalhos compativeis (${normalized.mapping.__missing}). Configure a chave de IA na engrenagem para corrigir automaticamente.`);
    }
    throw new Error(`Mesmo apos a IA, ainda faltam colunas obrigatorias: ${normalized.mapping.__missing}.`);
  }

  updateJob(jobId, {
    stage: `Normalizando colunas (${ACTION_LABEL[action] || action})`,
    detail: `Colunas prontas para o script: ${mappingText}`
  });
  return normalized.rows;
}

async function runAction(action, rows, req, settings, jobId, logs) {
  if (action === "dz") {
    const result = await processDonoDoZap(rows, settings, (p) => updateJob(jobId, p));
    logs.push(...result.logs);
    return result.rows;
  }
  if (action === "style") {
    const result = processStyle(rows);
    logs.push(...result.logs);
    updateJob(jobId, { detail: `${result.rows.length} linhas formatadas.` });
    return result.rows;
  }
  if (action === "enrich") {
    const result = await processEnrich(
      rows,
      req.body.icpDescription,
      settings,
      (p) => updateJob(jobId, p),
      { disableCheckpoint: true }
    );
    logs.push(...result.logs);
    return result.rows;
  }
  if (action === "company_age_mei") {
    const result = await processCompanyAgeMei(rows, settings, (p) => updateJob(jobId, p));
    logs.push(...result.logs);
    return result.rows;
  }
  throw new Error(`Acao invalida: ${action}`);
}

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public"), {
  etag: false,
  maxAge: 0,
  setHeaders(res) {
    res.setHeader("Cache-Control", "no-store");
  }
}));
app.use("/outputs", express.static(OUTPUT_DIR));

app.get("/health", (_req, res) => {
  res.json({ ok: true, app: "blu-auto-lite", uptime: Math.round(process.uptime()), storesUserDataInDb: false });
});

app.get("/api/jobs/:id", (req, res) => {
  res.json(jobs.get(req.params.id) || { id: req.params.id, status: "unknown", details: [] });
});

app.post("/api/workbook/sheets", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) throw new Error("Envie uma planilha no campo file.");
    const sheets = await listWorkbookSheets(req.file.path, req.file.originalname);
    res.json({ ok: true, sheets });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  } finally {
    if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
  }
});

app.post(
  "/api/process",
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "companyFile", maxCount: 1 },
    { name: "partnerFile", maxCount: 1 }
  ]),
  async (req, res) => {
    const jobId = req.body.jobId;
    createJob(jobId);
    const action = String(req.body.action || "").trim();
    const settings = settingsFromBody(req.body || {});
    const logs = [];

    try {
      if (!ACTION_LABEL[action]) throw new Error("Escolha uma acao valida.");
      updateJob(jobId, { stage: "Recebendo arquivo", detail: `Acao selecionada: ${ACTION_LABEL[action]}` });

      let rows = [];
      let originalName = "resultado.xlsx";

      if (action === "uni") {
        const companyFile = req.files?.companyFile?.[0];
        const partnerFile = req.files?.partnerFile?.[0];
        if (!companyFile || !partnerFile) throw new Error("Envie a planilha de empresas e a planilha de socios.");
        originalName = companyFile.originalname;
        updateJob(jobId, { stage: "Lendo planilhas", detail: `Arquivos recebidos: ${companyFile.originalname} + ${partnerFile.originalname}` });

        const companyRead = await readWorkbookRows(companyFile.path, companyFile.originalname, { sheetNames: parseSheetNames(req.body.companySheetNames) });
        const partnerRead = await readWorkbookRows(partnerFile.path, partnerFile.originalname, { sheetNames: parseSheetNames(req.body.partnerSheetNames) });
        const companyRows = await normalizeForAction(companyRead.rows, "uni", settings, logs, jobId, "company");
        const partnerRows = await normalizeForAction(partnerRead.rows, "uni", settings, logs, jobId, "partner");
        const result = processUnify(companyRows, partnerRows);
        logs.push(...result.logs);
        rows = result.rows;
      } else {
        const file = req.files?.file?.[0];
        if (!file) throw new Error("Envie uma planilha.");
        originalName = file.originalname;
        updateJob(jobId, { stage: "Lendo planilha", detail: `Arquivo recebido: ${originalName}` });
        const read = await readWorkbookRows(file.path, file.originalname, { sheetNames: parseSheetNames(req.body.sheetNames) });
        rows = read.rows;
        if (read.sheetName) updateJob(jobId, { detail: `Abas selecionadas: ${read.sheetName}. ${rows.length} linhas carregadas.` });
        rows = await normalizeForAction(rows, action, settings, logs, jobId);
        rows = await runAction(action, rows, req, settings, jobId, logs);
      }

      const fileName = outputName(originalName, ACTION_PREFIX[action] || "RESULTADO_");
      const outputPath = path.join(OUTPUT_DIR, fileName);
      await writeRows(outputPath, rows);
      scheduleDelete(outputPath);

      updateJob(jobId, { status: "done", stage: "Concluido", detail: `${rows.length} linhas gravadas em ${fileName}.` });
      res.json({ ok: true, rows: rows.length, fileName, downloadUrl: `/outputs/${fileName}`, logs });
    } catch (error) {
      updateJob(jobId, { status: "error", stage: "Erro", detail: error.message });
      res.status(400).json({ ok: false, error: error.message });
    } finally {
      cleanupUploads(req.files).catch(() => {});
    }
  }
);

app.listen(PORT, HOST, () => {
  console.log(`BLU Auto Lite rodando em http://${HOST}:${PORT}`);
  console.log("Sem BD de usuario: tokens entram apenas por requisicao; uploads temporarios sao removidos.");
});
