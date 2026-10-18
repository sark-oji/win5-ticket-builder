chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "APPLY_WIN5_PATTERNS") return false;
  applyPatterns(message).then(sendResponse);
  return true;
});

async function applyPatterns(message) {
  try {
    const patterns = message.patterns;
    if (!Array.isArray(patterns) || patterns.length === 0 || patterns.some((row) => !Array.isArray(row) || row.length !== 5)) {
      throw new Error("5レース分の馬番データを読み取れません");
    }
    const mode = message.mode === "formation" ? "formation" : "rows";
    const selections = mode === "formation" ? [mergePatterns(patterns)] : patterns;
    const mockForm = document.querySelector('[data-win5-mock="form"]');
    if (mockForm) {
      if (message.setAfterApply) throw new Error("模擬画面では「セット」操作は使えません");
      applyMock(mockForm, [selections[0]]);
      return { ok: true, applyMessage: mode === "rows" ? "1行目だけを模擬画面へ反映しました。" : "フォーメーションを模擬画面へ反映しました。" };
    }

    const initialGroups = findJraGroups();
    patterns.forEach((pattern) => {
      pattern.forEach((horse, raceIndex) => {
        if (!initialGroups[raceIndex].horses.has(Number(horse))) {
          throw new Error(`WIN${raceIndex + 1}の${horse}番を画面で確認できません`);
        }
      });
    });

    if (!message.setAfterApply) {
      const groups = findJraGroups();
      applySelection(groups, selections[0]);
      const actual = readSelection(groups);
      return {
        ok: true,
        selected: actual,
        combinationCount: actual.reduce((product, horses) => product * horses.length, 1),
        applyMessage: mode === "rows" ? "1行目を選択欄へ反映しました（セットはしていません）。" : "フォーメーションを選択欄へ反映しました（セットはしていません）。"
      };
    }

    let completed = 0;
    let lastSelection = [];
    for (const selection of selections) {
      let groups;
      try {
        groups = findJraGroups();
        applySelection(groups, selection);
      } catch (error) {
        if (completed === 0) throw error;
        return setProgress(completed, selections.length, lastSelection, `続きの選択画面を特定できず停止しました: ${error.message}`);
      }
      lastSelection = readSelection(groups);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const setButton = [...document.querySelectorAll("button, input[type='button'], [role='button']")]
        .find((element) => normalizedText(element) === "セット");
      if (!setButton) {
        return setProgress(completed, selections.length, lastSelection, "「セット」ボタンが見つかりません。");
      }
      if (setButton.disabled || setButton.getAttribute("aria-disabled") === "true") {
        return setProgress(completed, selections.length, lastSelection, "「セット」は無効でした。金額欄は変更していません。");
      }
      setButton.click();
      completed += 1;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
    return {
      ok: true,
      selected: lastSelection,
      combinationCount: lastSelection.reduce((product, horses) => product * horses.length, 1),
      setMessage: mode === "rows"
        ? `${completed}/${selections.length}行を1行ずつセットしました。次の画面で一覧を確認してください。`
        : "フォーメーションを1回セットしました。次の画面で一覧を確認してください。"
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function mergePatterns(patterns) {
  return Array.from({ length: 5 }, (_, raceIndex) =>
    [...new Set(patterns.map((pattern) => Number(pattern[raceIndex])))].sort((a, b) => a - b)
  );
}

function applySelection(groups, selection) {
  groups.forEach((group, raceIndex) => {
    const desiredHorses = new Set(Array.isArray(selection[raceIndex]) ? selection[raceIndex] : [selection[raceIndex]]);
    for (const horse of desiredHorses) {
      if (!group.horses.has(Number(horse))) throw new Error(`WIN${raceIndex + 1}の${horse}番を画面で確認できません`);
    }
    group.horses.forEach((control, horse) => {
      if (isChecked(control) !== desiredHorses.has(horse)) control.click();
    });
  });
}

function readSelection(groups) {
  return groups.map((group) => [...group.horses].filter(([, control]) => isChecked(control)).map(([horse]) => horse));
}

function setProgress(completed, total, selected, reason) {
  return {
    ok: true,
    selected,
    combinationCount: selected.reduce((product, horses) => product * horses.length, 1),
    setMessage: `${completed}/${total}件をセットしました。${reason}金額欄は変更していません。`
  };
}

function normalizedText(element) {
  return (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
}

function controlName(control) {
  const ariaLabel = control.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel.trim();
  if (control.labels?.length) return [...control.labels].map(normalizedText).join(" ").trim();
  const parentLabel = control.closest("label");
  if (parentLabel) return normalizedText(parentLabel);
  return normalizedText(control);
}

function isChecked(control) {
  return "checked" in control ? Boolean(control.checked) : control.getAttribute("aria-checked") === "true";
}

function findJraGroups() {
  const clearButtons = [...document.querySelectorAll("button, input[type='button'], [role='button']")]
    .filter((element) => normalizedText(element) === "クリア");
  const groups = [];
  for (let race = 1; race <= 5; race += 1) {
    const matches = [];
    for (const clearButton of clearButtons) {
      let ancestor = clearButton.parentElement;
      while (ancestor && ancestor !== document.body) {
        const text = normalizedText(ancestor);
        const markers = [...text.matchAll(/([1-5])\s*レース目/g)].map((match) => Number(match[1]));
        if (markers.length === 1 && markers[0] === race) {
          const controls = [...ancestor.querySelectorAll("input[type='checkbox'], [role='checkbox']")];
          const horses = new Map();
          let hasSelectAll = false;
          controls.forEach((control) => {
            const name = controlName(control);
            if (name.includes("全選択")) hasSelectAll = true;
            const number = name.match(/^0?(\d{1,2})$/);
            if (number) {
              const horse = Number(number[1]);
              if (!horses.has(horse)) horses.set(horse, control);
            }
          });
          if (hasSelectAll && horses.size > 0) matches.push({ horses });
          break;
        }
        ancestor = ancestor.parentElement;
      }
    }
    if (matches.length !== 1) {
      throw new Error(`WIN${race}の選択欄を一意に特定できません（完全セレクト画面か確認してください）`);
    }
    groups.push(matches[0]);
  }
  return groups;
}

function applyMock(form, patterns) {
  document.querySelectorAll("[data-race][data-horse]").forEach((button) => {
    button.classList.remove("selected");
    button.setAttribute("aria-pressed", "false");
  });
  patterns.forEach((pattern) => pattern.forEach((horseOrHorses, raceIndex) => {
    const horses = Array.isArray(horseOrHorses) ? horseOrHorses : [horseOrHorses];
    horses.forEach((horse) => {
      const button = form.querySelector(`[data-race="${raceIndex + 1}"][data-horse="${horse}"]`);
      if (!button) throw new Error(`レース${raceIndex + 1}の${horse}番が見つかりません`);
      button.classList.add("selected");
      button.setAttribute("aria-pressed", "true");
    });
  }));
  form.dispatchEvent(new CustomEvent("win5:patterns-applied", { detail: { patterns } }));
}
