import { demoDisciplines } from "../public/data/disciplines.js";

const errors = [];
const sortings = new Set();
const requiredFields = [
  "id",
  "sortierung",
  "name",
  "beschreibung",
  "kategorie_1",
  "einheit",
  "nachkommastellen",
  "bewertungsrichtung",
  "dsa",
  "generation",
  "aktiv"
];

if (demoDisciplines.length !== 36) {
  errors.push(`Expected 36 disciplines, found ${demoDisciplines.length}.`);
}

for (const discipline of demoDisciplines) {
  for (const field of requiredFields) {
    if (!(field in discipline) || discipline[field] === undefined || discipline[field] === "") {
      errors.push(`#${discipline.sortierung ?? "?"} is missing ${field}.`);
    }
  }
  if (sortings.has(discipline.sortierung)) {
    errors.push(`Duplicate sortierung ${discipline.sortierung}.`);
  }
  sortings.add(discipline.sortierung);
  if (discipline.generation !== 1) {
    errors.push(`#${discipline.sortierung} has generation ${discipline.generation}.`);
  }
  if (discipline.aktiv !== true) {
    errors.push(`#${discipline.sortierung} is not active.`);
  }
  if (!["hoeher", "niedriger"].includes(discipline.bewertungsrichtung)) {
    errors.push(`#${discipline.sortierung} has invalid bewertungsrichtung.`);
  }
  if (!Number.isInteger(discipline.nachkommastellen) || discipline.nachkommastellen < 0) {
    errors.push(`#${discipline.sortierung} has invalid nachkommastellen.`);
  }
}

for (let sorting = 1; sorting <= 36; sorting += 1) {
  if (!sortings.has(sorting)) {
    errors.push(`Missing sortierung ${sorting}.`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Sportdex data validation passed: 36 disciplines, unique sorting, valid base fields.");
