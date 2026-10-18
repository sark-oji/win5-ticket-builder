const races = document.querySelector("#races");
const patternList = document.querySelector("#patterns");
const count = document.querySelector("#count");

for (let race = 1; race <= 5; race += 1) {
  const section = document.createElement("article");
  section.className = "race";
  section.innerHTML = `<h2>対象レース ${race}</h2><div class="horses"></div>`;
  const horses = section.querySelector(".horses");

  for (let horse = 1; horse <= 18; horse += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "horse";
    button.dataset.race = String(race);
    button.dataset.horse = String(horse);
    button.setAttribute("aria-pressed", "false");
    button.textContent = String(horse);
    button.addEventListener("click", () => {
      const selected = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(selected));
      button.classList.toggle("selected", selected);
    });
    horses.append(button);
  }
  races.append(section);
}

document.querySelector('[data-win5-mock="form"]').addEventListener(
  "win5:patterns-applied",
  (event) => {
    patternList.replaceChildren();
    event.detail.patterns.forEach((pattern) => {
      const item = document.createElement("li");
      item.textContent = pattern.join(" - ");
      patternList.append(item);
    });
    count.textContent = `${event.detail.patterns.length}パターン`;
  }
);
