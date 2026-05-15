const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");

// ---- Model providers ----
const PROVIDERS = {
  openai: {
    name: "OpenAI",
    chatUrl: "https://api.openai.com/v1/chat/completions",
    models: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-4o", "gpt-4o-mini"],
    defaultModel: "gpt-5.5"
  },
  deepseek: {
    name: "DeepSeek",
    chatUrl: "https://api.deepseek.com/v1/chat/completions",
    models: ["deepseek-chat", "deepseek-reasoner"],
    defaultModel: "deepseek-chat"
  }
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8"
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function readJson(req, maxBytes = 18 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let bytes = 0;
    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) { reject(new Error("Upload too large")); req.destroy(); return; }
      raw += chunk;
    });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(new Error("Invalid JSON")); } });
    req.on("error", reject);
  });
}

// ---- Shared chat-completions call (used by all providers) ----
async function callChatAPI({ provider, model, apiKey, messages, jsonSchema, maxTokens = 4096 }) {
  const prov = PROVIDERS[provider];
  if (!prov) throw new Error(`Unknown provider: ${provider}`);
  if (!apiKey) throw new Error("API Key required");

  const url = prov.chatUrl;
  const body = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.7
  };

  // DeepSeek reasoner doesn''t support json_object
  if (jsonSchema && model !== "deepseek-reasoner") {
    body.response_format = { type: "json_object" };
    // Inject schema into system prompt
    const sysMsg = messages.find(m => m.role === "system");
    const schemaStr = JSON.stringify(jsonSchema);
    if (sysMsg) {
      sysMsg.content += "\n\nYOU MUST respond with valid JSON matching this schema:\n" + schemaStr;
    }
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const raw = await response.text();
  if (!response.ok) {
    let detail = raw;
    try { detail = JSON.parse(raw).error?.message || raw; } catch (_) { detail = raw; }
    throw new Error(`${prov.name} error: ${detail}`);
  }

  const data = JSON.parse(raw);
  const content = data.choices?.[0]?.message?.content || "";
  return { content, model: data.model, usage: data.usage };
}

function parseJsonFromContent(content) {
  try { return JSON.parse(content); } catch (_) {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Failed to parse JSON from model response");
  }
}

function getLanUrls(port) {
  const interfaces = os.networkInterfaces();
  const physical = [], fallback = [];
  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const addr of addresses || []) {
      if (addr.family === "IPv4" && !addr.internal && !addr.address.startsWith("169.254.")) {
        const url = `http://${addr.address}:${port}`;
        (/vEthernet|Virtual|VMware|VirtualBox|Loopback|Docker|WSL|Hyper-V/i.test(name) ? fallback : physical).push(url);
      }
    }
  }
  return physical.length ? physical : fallback;
}

function getTunnelUrls() {
  const logPaths = [
    path.join(__dirname, "tools", "cf-stderr.log"),
    path.join(__dirname, "tools", "cloudflared.err.log"),
    path.join(__dirname, "tools", "cloudflared.log")
  ];
  const urls = new Set();
  for (const logPath of logPaths) {
    try {
      const content = fs.readFileSync(logPath, "utf8");
      const matches = content.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g) || [];
      matches.forEach(function(u){ urls.add(u); });
    } catch (_) {}
  }
  return [...urls];
}

function getUserApiKey(req, provider) {
  const headerKey = req.headers["x-api-key"];
  if (headerKey) return headerKey;
  const envKey = process.env[provider === "deepseek" ? "DEEPSEEK_API_KEY" : "OPENAI_API_KEY"];
  return envKey || "";
}

function chooseModel(providerId, requestedModel) {
  const provider = PROVIDERS[providerId];
  if (!provider) return "";
  return provider.models.includes(requestedModel) ? requestedModel : provider.defaultModel;
}

// ---- Static file serving ----
function serveStatic(req, res, pathname) {
  const normalized = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, normalized));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end("Forbidden"); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream", "Cache-Control": "no-store, no-cache, must-revalidate" });
    res.end(data);
  });
}

// ---- API: GET /api/config ----
function handleConfig(req, res) {
  sendJson(res, 200, {
    providers: Object.fromEntries(
      Object.entries(PROVIDERS).map(([id, p]) => [id, { name: p.name, models: p.models, defaultModel: p.defaultModel }])
    ),
    port: PORT,
    lanUrls: getLanUrls(PORT),
    tunnelUrls: getTunnelUrls()
  });
}

// ---- API: POST /api/generate-passage ----
async function handleGeneratePassage(req, res) {
  const { provider, model, apiKey, words, lengthHint } = await readJson(req);
  const provId = provider || "deepseek";
  const prov = PROVIDERS[provId];
  if (!prov) return sendJson(res, 400, { error: `Unknown provider: ${provId}` });
  const usedModel = chooseModel(provId, model);
  const usedKey = apiKey || getUserApiKey(req, provId);

  if (!usedKey) {
    return sendJson(res, 200, demoPassage(words));
  }

  const wordList = (words || []).slice(0, 30);
  const wordStr = wordList.map(w => `${w.term}(${w.meaning})`).join(", ");

  const messages = [
    {
      role: "system",
      content: [
        "You are an English teacher creating reading passages for Chinese learners.",
        "Write a short, natural English passage (80-150 words) that incorporates as many of the provided vocabulary words as possible.",
        lengthHint || "Write a short passage of 80-120 words.",
        "The passage should feel natural, not forced. Keep sentences clear and vocabulary level appropriate for intermediate learners.",
        "Also provide a Chinese translation of the entire passage.",
        "For each vocabulary word used, extract it as a highlightedWord with its Chinese meaning and part of speech.",
        "Only respond with valid JSON."
      ].join(" ")
    },
    {
      role: "user",
      content: `Create a short English passage using these words: ${wordStr}`
    }
  ];

  const schema = {
    title: "string - a short title for the passage",
    text: "string - the full English passage (80-150 words)",
    translationCn: "string - natural Chinese translation",
    highlightedWords: "array of {word: string, meaningCn: string, pos: string (noun/verb/adj/adv/prep/phrase)}"
  };

  const { content } = await callChatAPI({ provider: provId, model: usedModel, apiKey: usedKey, messages, jsonSchema: schema });
  const result = parseJsonFromContent(content);
  sendJson(res, 200, { ...result, model: usedModel, provider: provId, demo: false });
}

function demoPassage(words) {
  const wordList = (words || []).slice(0, 8);
  const terms = wordList.map(w => w.term).join(", ");
  return {
    demo: true,
    model: "demo",
    provider: "demo",
    title: "A Day of Practice",
    text: `Every day, I try to improve my English. I read short articles and write down new phrases. ${terms ? `Today I focused on words like ${terms}. ` : ""}As a result, I can remember more vocabulary and use it in my writing. The key is to practice a little bit every day.`,
    translationCn: "每天我都试着提高英语。我会读短文章并写下新短语。今天我重点学了这些词。结果我能记住更多词汇并在写作中使用。关键是每天坚持练一点。",
    highlightedWords: wordList.map(w => ({ word: w.term, meaningCn: w.meaning, pos: w.type === "phrase" ? "phrase" : "word" }))
  };
}

// ---- API: POST /api/essay-review ----
async function handleEssayReview(req, res) {
  const payload = await readJson(req);
  const provId = payload.provider || "openai";
  const prov = PROVIDERS[provId];
  if (!prov) return sendJson(res, 400, { error: `Unknown provider: ${provId}` });
  const usedModel = chooseModel(provId, payload.model);
  const usedKey = payload.apiKey || getUserApiKey(req, provId);

  // Text-based essay input
  const essayText = (payload.essayText || "").trim();
  // Image-based essay input
  const imageDataUrl = payload.imageDataUrl || "";

  if (!essayText && !imageDataUrl) {
    return sendJson(res, 400, { error: "Please provide essay text or upload an image." });
  }

  if (!usedKey) {
    return sendJson(res, 200, demoReview(payload));
  }

  const targetLevel = payload.targetLevel || "natural-simple";
  const prompt = payload.prompt || "";
  const userStats = payload.userStats || {};

  const systemPrompt = [
    "You are a patient English writing teacher for Chinese learners.",
    essayText ? "Review the student''s essay text below." : "The essay is provided as an image. Read the text from the image.",
    "Keep the learner''s original meaning. Improve grammar, clarity, structure, and reduce repetition.",
    "Do not make the rewrite too difficult. Use natural, common words and phrases suitable for the target level: " + targetLevel + ".",
    "Write feedback comments in Simplified Chinese. Essay rewrites should be in English.",
    "Return ONLY valid JSON."
  ].join(" ");

  const profileStr = JSON.stringify(userStats).slice(0, 3000);
  const userMsgParts = [];
  if (prompt) userMsgParts.push(`Topic/Requirements: ${prompt}`);
  userMsgParts.push(`Target difficulty: ${targetLevel}`);
  if (Object.keys(userStats).length) userMsgParts.push(`Learner profile: ${profileStr}`);
  userMsgParts.push("Provide: score (0-100), level, teacherCommentCn, correctedEssay, simpleRewrite, grammarFixes[], structureTips[], repetitionReductions[], wordsToLearn[]");
  const userContent = userMsgParts.join("\n\n");

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: essayText ? `${userContent}\n\nESSAY:\n${essayText}` : userContent }
  ];

  // For image input with OpenAI, use vision-capable model
  if (imageDataUrl && provId === "openai") {
    // Use gpt-4o for vision if available, else fall back
    messages[1].content = [
      { type: "text", text: userContent },
      { type: "image_url", image_url: { url: imageDataUrl } }
    ];
  }

  const schema = {
    score: "number 0-100",
    level: "string like 初级/中等/良好/优秀",
    teacherCommentCn: "string feedback in Chinese",
    correctedEssay: "string - grammar-corrected version preserving original meaning",
    simpleRewrite: "string - simpler version easy to memorize",
    grammarFixes: "array of {original: string, revised: string, reasonCn: string}",
    structureTips: "array of string tips in Chinese",
    repetitionReductions: "array of {overused: string, replacements: string[], noteCn: string}",
    wordsToLearn: "array of {term: string, meaningCn: string, example: string}"
  };

  const { content } = await callChatAPI({ provider: provId, model: usedModel, apiKey: usedKey, messages, jsonSchema: schema });
  const result = parseJsonFromContent(content);
  sendJson(res, 200, {
    ...result,
    extractedText: essayText || "(from image)",
    model: usedModel,
    provider: provId,
    demo: false,
    reviewedAt: new Date().toISOString()
  });
}

function demoReview(payload = {}) {
  const goal = payload.targetLevel === "easy" ? "easy to remember" : "natural and simple";
  return {
    demo: true,
    model: "demo",
    provider: "demo",
    reviewedAt: new Date().toISOString(),
    extractedText: "This is a demo. Set an API Key to enable real review.",
    score: 78,
    level: "中等",
    teacherCommentCn: "当前是演示批改。配置 API Key 后可使用真实模型（OpenAI 或 DeepSeek）进行批改。",
    correctedEssay: "I want to improve my English writing. Reading more and checking my grammar helps me write more clearly.",
    simpleRewrite: `I want to make my English better. I use clear words, fix grammar mistakes, and keep my ideas ${goal}.`,
    grammarFixes: [
      { original: "improve my English more better", revised: "improve my English", reasonCn: "more better 重复比较级，保留 improve 即可。" },
      { original: "it can helps me", revised: "it can help me", reasonCn: "情态动词 can 后面用动词原形。" }
    ],
    structureTips: [
      "开头直接表明观点，再用两个理由展开。",
      "每段讲一个重点，结尾用一句话总结。"
    ],
    repetitionReductions: [
      { overused: "good", replacements: ["useful", "clear", "helpful"], noteCn: "good 可以换成更具体但简单的词。" },
      { overused: "very", replacements: ["really", "quite", "a little"], noteCn: "very 适当替换，让表达更丰富。" }
    ],
    wordsToLearn: [
      { term: "improve", meaningCn: "提高，改善", example: "I want to improve my writing." },
      { term: "as a result", meaningCn: "因此", example: "I practiced every day. As a result, I wrote better." }
    ],
    userHabitSummary: ["可以多积累表示原因、结果和对比的短语。", "注意 can, should, must 后面接动词原形。"],
    nextPractice: ["用 improve 造 2 个自己的句子。", "把一篇作文里的 good 替换成更具体的词。"]
  };
}

// ---- HTTP Server ----
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === "GET" && url.pathname === "/api/config") {
      handleConfig(req, res);
      return;
    }
    if (req.method === "GET" && url.pathname === "/healthz") {
      sendJson(res, 200, { ok: true, service: "vocab-coach" });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/generate-passage") {
      await handleGeneratePassage(req, res);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/essay-review") {
      await handleEssayReview(req, res);
      return;
    }
    if (req.method === "GET") {
      serveStatic(req, res, url.pathname);
      return;
    }
    sendJson(res, 405, { error: "Method not allowed" });
  } catch (err) {
    sendJson(res, 400, { error: err.message || "Request failed" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Vocab Coach running at http://localhost:${PORT}`);
  getLanUrls(PORT).forEach(u => console.log(`LAN: ${u}`));
  console.log("Providers:", Object.keys(PROVIDERS).join(", "));
});
