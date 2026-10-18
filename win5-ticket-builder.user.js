// ==UserScript==
// @name         WIN5買い目メーカー
// @namespace    local.win5.ticket.builder
// @version      1.2.0
// @description  CSVのWIN5買い目を選択欄へ反映します。購入確定は行いません。
// @match        https://www.ipat.jra.go.jp/2017/pw_890_i.cgi*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  const PANEL_ID = "win5-csv-input-panel";
  if (document.getElementById(PANEL_ID)) return;

  const style = document.createElement("style");
  style.textContent = `
    #${PANEL_ID} { position:fixed; z-index:2147483647; right:16px; bottom:16px; width:340px; max-height:80vh; overflow:auto; box-sizing:border-box; padding:14px; color:#17211b; background:#fff; border:1px solid #75857a; border-radius:10px; box-shadow:0 4px 20px #0004; font:13px/1.45 system-ui,sans-serif; }
    #${PANEL_ID} * { box-sizing:border-box; }
    #${PANEL_ID} h2 { margin:0; font-size:16px; }
    #${PANEL_ID} .top { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
    #${PANEL_ID} label { display:block; margin:8px 0 4px; font-weight:700; }
    #${PANEL_ID} input[type=file] { width:100%; font-size:12px; }
    #${PANEL_ID} textarea { width:100%; resize:vertical; padding:8px; border:1px solid #87938b; border-radius:5px; font:12px/1.45 ui-monospace,monospace; }
    #${PANEL_ID} .mode-select { display:flex; gap:6px; margin:8px 0; padding:0; border:0; }
    #${PANEL_ID} .mode-select legend { margin-bottom:5px; font-weight:700; }
    #${PANEL_ID} .mode-option { flex:1; display:flex; align-items:center; min-height:44px; padding:6px 8px; border:1px solid #b8c2bb; border-radius:7px; background:#fff; cursor:pointer; }
    #${PANEL_ID} .mode-option.selected { color:#fff; border-color:#176b3a; background:#176b3a; }
    #${PANEL_ID} .mode-option:focus-within { outline:2px solid #f0a82e; outline-offset:2px; }
    #${PANEL_ID} .mode-option input { position:absolute; width:1px; height:1px; opacity:0; }
    #${PANEL_ID} .mode-option span { display:flex; flex-direction:column; font-weight:700; }
    #${PANEL_ID} .mode-option small { margin-top:2px; font-size:10px; font-weight:400; opacity:.85; }
    #${PANEL_ID} .actions { display:flex; gap:7px; margin-top:8px; }
    #${PANEL_ID} button { min-height:34px; padding:5px 9px; border:0; border-radius:5px; color:#fff; background:#176b3a; font-weight:700; cursor:pointer; }
    #${PANEL_ID} button:disabled { opacity:.5; cursor:default; }
    #${PANEL_ID} button.secondary { color:#174b2d; background:#eaf2ec; }
    #${PANEL_ID} button.close { min-height:28px; padding:2px 8px; color:#17211b; background:#eef1ef; }
    #${PANEL_ID} .preview { margin:8px 0; padding:8px; border-radius:5px; background:#f1f4f2; white-space:pre-line; }
    #${PANEL_ID} .status { margin:7px 0 0; color:#58625c; }
    #${PANEL_ID} .status.error { color:#a12424; }
    #${PANEL_ID}[data-collapsed=true] { width:auto; padding:0; overflow:visible; border:0; background:transparent; box-shadow:none; }
    #${PANEL_ID}[data-collapsed=true] .body { display:none; }
    #${PANEL_ID}[data-collapsed=true] .top { margin:0; }
    #${PANEL_ID}[data-collapsed=true] .top h2 { display:none; }
  `;
  document.documentElement.append(style);

  const panel = document.createElement("section");
  panel.id = PANEL_ID;
  panel.setAttribute("aria-label", "WIN5 CSV Input");
  panel.innerHTML = `
    <div class="top"><h2>WIN5 CSV Input</h2><button class="close" type="button" aria-label="閉じる">−</button></div>
    <div class="body">
      <label for="win5-csv-file">CSVファイル</label>
      <input id="win5-csv-file" type="file" accept=".csv,text/csv">
      <label for="win5-csv-text">CSVデータ（貼り付け・編集可）</label>
      <textarea id="win5-csv-text" rows="6" placeholder="WIN1,WIN2,WIN3,WIN4,WIN5&#10;6,4,3,9,8"></textarea>
      <fieldset class="mode-select"><legend>入力方式</legend><label class="mode-option selected"><input type="radio" name="win5-mode" value="rows" checked><span>買い目ごと<small>1行ずつセット</small></span></label><label class="mode-option"><input type="radio" name="win5-mode" value="formation"><span>フォーメーション<small>レース別にまとめる</small></span></label></fieldset>
      <div class="actions"><button class="secondary apply-button" type="button" disabled>反映だけ</button><button class="apply-set-button" type="button" disabled>反映後セット</button></div>
      <div class="preview" aria-live="polite">既存の選択はCSVの内容に置き換わります。</div>
      <p class="status">購入確定は行いません。反映後に画面を確認してください。</p>
    </div>`;
  document.body.append(panel);

  const fileInput = panel.querySelector("input[type=file]");
  const textarea = panel.querySelector("textarea");
  const preview = panel.querySelector(".preview");
  const status = panel.querySelector(".status");
  const applyButton = panel.querySelector(".apply-button");
  const applySetButton = panel.querySelector(".apply-set-button");
  const modeInputs = [...panel.querySelectorAll('input[name="win5-mode"]')];
  function updateModeAppearance() {
    modeInputs.forEach((input) => input.closest(".mode-option").classList.toggle("selected", input.checked));
  }
  updateModeAppearance();
  const headerAliases = [
    /^(?:win1|race1|r1|1r|1レース目?|レース1)$/i,
    /^(?:win2|race2|r2|2r|2レース目?|レース2)$/i,
    /^(?:win3|race3|r3|3r|3レース目?|レース3)$/i,
    /^(?:win4|race4|r4|4r|4レース目?|レース4)$/i,
    /^(?:win5|race5|r5|5r|5レース目?|レース5)$/i
  ];

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

  function parsePatterns(source) {
    const lines = source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
    if (!lines.length) throw new Error("CSVまたは馬番データを入力してください");
    let rows = lines.map(parseCsvLine);
    const normalizeHeader = (value) => value.replace(/^\uFEFF/, "").replace(/[\s　_-]/g, "").replace(/Ｒ/g, "R").toLowerCase();
    const headers = rows[0].map(normalizeHeader);
    const columns = headerAliases.map((alias) => headers.findIndex((header) => alias.test(header)));
    let selectedColumns = [0, 1, 2, 3, 4];
    if (columns.every((column) => column >= 0)) {
      selectedColumns = columns;
      rows = rows.slice(1);
    } else if (rows[0].length === 1 && !/^\s*\d/.test(rows[0][0])) {
      throw new Error("ヘッダーはWIN1, WIN2, WIN3, WIN4, WIN5の列名にしてください");
    } else if (rows[0].length > 5) {
      throw new Error("列が6個以上あります。WIN1〜WIN5のヘッダー行を指定してください");
    }
    if (!rows.length) throw new Error("ヘッダーの後にデータ行がありません");

    return rows.map((row, rowIndex) => {
      let values;
      if (row.length === 1) {
        values = row[0].replace(/[－ー−]/g, "-").replace(/[，、]/g, ",").replace(/[　\s]+/g, "").split(/[-,]/);
      } else {
        if (row.length < 5) throw new Error(`${rowIndex + 1}行目は5列必要です`);
        values = selectedColumns.map((column) => row[column]);
      }
      if (values.length !== 5) throw new Error(`${rowIndex + 1}行目は5レース分の馬番が必要です`);
      return values.map((value, raceIndex) => {
        const digits = value.trim().replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xFEE0));
        if (!/^\d+$/.test(digits) || Number(digits) < 1 || Number(digits) > 18) {
          throw new Error(`${rowIndex + 1}行目・WIN${raceIndex + 1}: 馬番は1〜18の整数で指定してください`);
        }
        return Number(digits);
      });
    });
  }

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("error", isError);
  }

  function updatePreview() {
    try {
      const patterns = parsePatterns(textarea.value);
      const picks = Array.from({ length: 5 }, (_, raceIndex) =>
        [...new Set(patterns.map((pattern) => pattern[raceIndex]))].sort((a, b) => a - b)
      );
      const combinations = picks.reduce((product, horses) => product * horses.length, 1);
      const mode = modeInputs.find((input) => input.checked)?.value || "rows";
      preview.textContent = picks.map((horses, index) => `WIN${index + 1}: ${horses.join(", ")}`).join("\n") +
        (mode === "formation" ? `\nフォーメーション・${combinations}通り` : `\n${patterns.length}買い目を1行ずつセット予定`);
      applyButton.disabled = false;
      applySetButton.disabled = false;
      setStatus("入力内容は有効です。反映しても購入確定はされません。");
      return patterns;
    } catch (error) {
      preview.textContent = "CSVの内容を確認できません。";
      applyButton.disabled = true;
      applySetButton.disabled = true;
      setStatus(error.message, true);
      return null;
    }
  }

  function textOf(element) {
    return (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
  }

  function controlName(control) {
    if (control.getAttribute("aria-label")) return control.getAttribute("aria-label").trim();
    if (control.labels?.length) return [...control.labels].map(textOf).join(" ").trim();
    const label = control.closest("label");
    return label ? textOf(label) : textOf(control);
  }

  function findGroups() {
    const clearButtons = [...document.querySelectorAll("button, input[type='button'], [role='button']")]
      .filter((element) => textOf(element) === "クリア");
    const groups = [];
    for (let race = 1; race <= 5; race += 1) {
      const matches = [];
      for (const clear of clearButtons) {
        let ancestor = clear.parentElement;
        while (ancestor && ancestor !== document.body) {
          const markers = [...textOf(ancestor).matchAll(/([1-5])\s*レース目/g)].map((match) => Number(match[1]));
          if (markers.length === 1 && markers[0] === race) {
            const controls = [...ancestor.querySelectorAll("input[type='checkbox'], [role='checkbox']")];
            const horses = new Map();
            let hasSelectAll = false;
            controls.forEach((control) => {
              const name = controlName(control);
              if (name.includes("全選択")) hasSelectAll = true;
              const number = name.match(/^0?(\d{1,2})$/);
              if (number && !horses.has(Number(number[1]))) horses.set(Number(number[1]), control);
            });
            if (hasSelectAll && horses.size) matches.push(horses);
            break;
          }
          ancestor = ancestor.parentElement;
        }
      }
      if (matches.length !== 1) throw new Error(`WIN${race}の選択欄を特定できません。WIN5完全セレクト画面を開いてください`);
      groups.push(matches[0]);
    }
    return groups;
  }

  function isChecked(control) {
    return "checked" in control ? Boolean(control.checked) : control.getAttribute("aria-checked") === "true";
  }

  async function loadFile() {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const bytes = await file.arrayBuffer();
      try {
        textarea.value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        textarea.value = new TextDecoder("shift_jis").decode(bytes);
      }
      updatePreview();
    } catch {
      setStatus("CSVを読み込めません。UTF-8またはShift_JIS形式を選んでください。", true);
    }
  }

  fileInput.addEventListener("change", loadFile);
  textarea.addEventListener("input", () => {
    applyButton.disabled = true;
    applySetButton.disabled = true;
    updatePreview();
  });
  modeInputs.forEach((input) => input.addEventListener("change", () => {
    updateModeAppearance();
    updatePreview();
  }));
  panel.querySelector(".close").addEventListener("click", () => {
    const collapsed = panel.dataset.collapsed === "true";
    panel.dataset.collapsed = String(!collapsed);
    panel.querySelector(".close").textContent = collapsed ? "−" : "WIN5 CSV";
    panel.querySelector(".close").setAttribute("aria-label", collapsed ? "閉じる" : "パネルを開く");
  });

  async function applyPatterns(setAfterApply) {
    const patterns = updatePreview();
    if (!patterns) return;
    const mode = modeInputs.find((input) => input.checked)?.value || "rows";
    const selections = mode === "formation" ? [mergePatterns(patterns)] : patterns;
    applyButton.disabled = true;
    applySetButton.disabled = true;
    try {
      const initialGroups = findGroups();
      patterns.forEach((pattern) => pattern.forEach((horse, index) => {
        if (!initialGroups[index].has(Number(horse))) throw new Error(`WIN${index + 1}の${horse}番が画面にありません`);
      }));

      if (!setAfterApply) {
        const groups = findGroups();
        applySelection(groups, selections[0]);
        const actual = readSelection(groups);
        preview.textContent = actual.map((horses, index) => `WIN${index + 1}: ${horses.join(", ") || "未選択"}`).join("\n") +
          `\n選択反映完了・${actual.reduce((product, horses) => product * horses.length, 1)}通り`;
        setStatus(mode === "rows"
          ? "1行目を選択欄へ反映しました（セットはしていません）。"
          : "フォーメーションを選択欄へ反映しました（セットはしていません）。");
        return;
      }

      let completed = 0;
      let lastSelection = [];
      for (const selection of selections) {
        let groups;
        try {
          groups = findGroups();
          applySelection(groups, selection);
        } catch (error) {
          if (completed === 0) throw error;
          setStatus(`${completed}/${selections.length}件をセットしました。続きの選択画面を特定できず停止しました: ${error.message}`, true);
          return;
        }
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const setButton = [...document.querySelectorAll("button, input[type='button'], [role='button']")]
          .find((element) => textOf(element) === "セット");
        if (!setButton) {
          setStatus(`${completed}/${selections.length}件をセットしました。「セット」ボタンが見つかりません。金額欄は変更していません。`, true);
          return;
        }
        if (setButton.disabled || setButton.getAttribute("aria-disabled") === "true") {
          setStatus(`${completed}/${selections.length}件をセットしました。「セット」は無効です。金額欄は変更していません。`, true);
          return;
        }
        lastSelection = readSelection(groups);
        setButton.click();
        completed += 1;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
      preview.textContent = lastSelection.map((horses, index) => `WIN${index + 1}: ${horses.join(", ") || "未選択"}`).join("\n") +
        `\n${completed}件セット済み`;
      setStatus(mode === "rows"
        ? `${completed}/${selections.length}行を1行ずつセットしました。次の画面で一覧を確認してください。`
        : "フォーメーションを1回セットしました。次の画面で一覧を確認してください。");
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      try {
        parsePatterns(textarea.value);
        applyButton.disabled = false;
        applySetButton.disabled = false;
      } catch {
        applyButton.disabled = true;
        applySetButton.disabled = true;
      }
    }
  }

  function mergePatterns(patterns) {
    return Array.from({ length: 5 }, (_, raceIndex) =>
      [...new Set(patterns.map((pattern) => Number(pattern[raceIndex])))].sort((a, b) => a - b)
    );
  }

  function applySelection(groups, selection) {
    groups.forEach((group, raceIndex) => {
      const desired = new Set(Array.isArray(selection[raceIndex]) ? selection[raceIndex] : [selection[raceIndex]]);
      desired.forEach((horse) => {
        if (!group.has(Number(horse))) throw new Error(`WIN${raceIndex + 1}の${horse}番が画面にありません`);
      });
      group.forEach((control, horse) => {
        if (isChecked(control) !== desired.has(horse)) control.click();
      });
    });
  }

  function readSelection(groups) {
    return groups.map((group) => [...group].filter(([, control]) => isChecked(control)).map(([horse]) => horse));
  }

  applyButton.addEventListener("click", () => applyPatterns(false));
  applySetButton.addEventListener("click", () => applyPatterns(true));
})();
