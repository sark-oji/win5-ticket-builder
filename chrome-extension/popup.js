const patternsInput = document.querySelector("#patterns");
const csvFile = document.querySelector("#csvFile");
const applyButton = document.querySelector("#apply");
const applyAndSetButton = document.querySelector("#applyAndSet");
const modeInputs = [...document.querySelectorAll('input[name="mode"]')];
const status = document.querySelector("#status");
const previewText = document.querySelector("#previewText");

const headerAliases = [
  /^(?:win1|race1|r1|1r|1レース目?|レース1)$/i,
  /^(?:win2|race2|r2|2r|2レース目?|レース2)$/i,
  /^(?:win3|race3|r3|3r|3レース目?|レース3)$/i,
  /^(?:win4|race4|r4|4r|4レース目?|レース4)$/i,
  /^(?:win5|race5|r5|5r|5レース目?|レース5)$/i
];

function updateModeAppearance() {
  modeInputs.forEach((input) => input.closest(".mode-option").classList.toggle("selected", input.checked));
}
updateModeAppearance();

function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error("CSVの引用符が閉じていません");
  cells.push(cell.trim());
  return cells;
}

function normalizeHeader(value) {
  return value.replace(/^\uFEFF/, "").replace(/[\s　_-]/g, "").replace(/Ｒ/g, "R").toLowerCase();
}

function parseHorse(value, lineNumber, raceNumber) {
  const normalized = value.trim().replace(/[０-９]/g, (digit) =>
    String.fromCharCode(digit.charCodeAt(0) - 0xFEE0)
  );
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${lineNumber}行目・WIN${raceNumber}: 馬番が整数ではありません`);
  }
  const horse = Number(normalized);
  if (horse < 1 || horse > 18) {
    throw new Error(`${lineNumber}行目・WIN${raceNumber}: 馬番は1〜18で指定してください`);
  }
  return horse;
}

function parsePatterns(source) {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  if (lines.length === 0) throw new Error("CSVまたは5レース分の馬番を入力してください");

  let records = lines.map(parseCsvLine);
  let columns = [0, 1, 2, 3, 4];
  const normalizedHeaders = records[0].map(normalizeHeader);
  const headerColumns = headerAliases.map((alias) => normalizedHeaders.findIndex((header) => alias.test(header)));
  if (headerColumns.every((index) => index >= 0)) {
    columns = headerColumns;
    records = records.slice(1);
  } else if (records[0].length === 1 && !/^\s*\d/.test(records[0][0])) {
    throw new Error("ヘッダーを使う場合はWIN1, WIN2, WIN3, WIN4, WIN5列を指定してください");
  } else if (records[0].length > 5) {
    throw new Error("列が6個以上あります。WIN1〜WIN5のヘッダー行を付けてください");
  }
  if (records.length === 0) throw new Error("ヘッダーの後にデータ行がありません");

  return records.map((cells, index) => {
    let values;
    if (cells.length === 1) {
      const normalized = cells[0].replace(/[－ー−]/g, "-").replace(/[，、]/g, ",").replace(/[　\s]+/g, "");
      values = normalized.split(/[-,]/);
    } else {
      if (cells.length < 5) throw new Error(`${index + 1}行目は5列必要です`);
      values = columns.map((column) => cells[column]);
    }
    if (values.length !== 5) throw new Error(`${index + 1}行目は5レース分の馬番が必要です`);
    return values.map((value, raceIndex) => parseHorse(value, index + 1, raceIndex + 1));
  });
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function updatePreview() {
  try {
    const patterns = parsePatterns(patternsInput.value);
    const picks = Array.from({ length: 5 }, (_, raceIndex) =>
      [...new Set(patterns.map((pattern) => pattern[raceIndex]))].sort((a, b) => a - b)
    );
    const combinations = picks.reduce((product, horses) => product * horses.length, 1);
    const mode = modeInputs.find((input) => input.checked)?.value || "rows";
    previewText.textContent = picks.map((horses, index) => `WIN${index + 1}: ${horses.join(", ")}`).join("\n") +
      (mode === "formation"
        ? `\nフォーメーション・${combinations}通り（重複馬番は統合）`
        : `\n${patterns.length}買い目を個別にセット予定`);
    applyButton.disabled = false;
    applyAndSetButton.disabled = false;
    setStatus("入力内容は有効です。反映しても購入確定はされません。");
    return patterns;
  } catch (error) {
    applyButton.disabled = true;
    applyAndSetButton.disabled = true;
    previewText.textContent = "CSVの内容を確認できません。";
    setStatus(error.message, true);
    return null;
  }
}

csvFile.addEventListener("change", async () => {
  const file = csvFile.files?.[0];
  if (!file) return;
  try {
    const bytes = await file.arrayBuffer();
    try {
      patternsInput.value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      patternsInput.value = new TextDecoder("shift_jis").decode(bytes);
    }
    updatePreview();
  } catch {
    setStatus("CSVを読み込めませんでした。UTF-8またはShift_JISのCSVを選んでください。", true);
  }
});

patternsInput.addEventListener("input", () => {
  applyButton.disabled = true;
  applyAndSetButton.disabled = true;
  updatePreview();
});
modeInputs.forEach((input) => input.addEventListener("change", () => {
  updateModeAppearance();
  updatePreview();
}));

async function applyPatterns(setAfterApply) {
  let validPatterns = false;
  try {
    const patterns = updatePreview();
    if (!patterns) return;
    validPatterns = true;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const isJra = tab?.url?.startsWith("https://www.ipat.jra.go.jp/2017/pw_890_i.cgi");
    const isMock = tab?.url?.startsWith("http://localhost:8765/");
    if (!tab?.id || (!isJra && !isMock)) {
      throw new Error("JRAネット投票のWIN5完全セレクト画面を開いてください");
    }
    applyButton.disabled = true;
    applyAndSetButton.disabled = true;
    const mode = modeInputs.find((input) => input.checked)?.value || "rows";
    const response = await chrome.tabs.sendMessage(tab.id, { type: "APPLY_WIN5_PATTERNS", patterns, mode, setAfterApply });
    if (!response?.ok) throw new Error(response?.error || "選択欄へ反映できませんでした");
    if (response.selected) {
      previewText.textContent = response.selected.map((horses, index) =>
        `WIN${index + 1}: ${horses.join(", ") || "未選択"}`
      ).join("\n") + `\n選択反映完了・${response.combinationCount}通り`;
    }
    setStatus(response.setMessage || response.applyMessage || `${patterns.length}行をWIN5選択欄へ反映しました。画面で内容を確認してください。`);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    applyButton.disabled = !validPatterns;
    applyAndSetButton.disabled = !validPatterns;
  }
}

applyButton.addEventListener("click", () => applyPatterns(false));
applyAndSetButton.addEventListener("click", () => applyPatterns(true));
