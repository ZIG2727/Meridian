const escapeHTML = value => String(value).replace(/[&<>]/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;"
}[char]));

const tokenPattern = /(#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:False|None|True|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield)\b|\b(?:print|input|int|float|str|len|range|list|dict|set|tuple|bool|abs|round|min|max|sum|type)\b|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*(?=\s*\())/g;

export function highlightPythonCode(source) {
  const code = String(source ?? "");
  const matcher = new RegExp(tokenPattern.source, "g");
  let output = "", cursor = 0, match;
  while ((match = matcher.exec(code))) {
    output += escapeHTML(code.slice(cursor, match.index));
    const token = match[0];
    let kind = "python-function";
    if (token.startsWith("#")) kind = "python-comment";
    else if (/^["']/.test(token)) kind = "python-string";
    else if (/^\d/.test(token)) kind = "python-number";
    else if (/^(?:False|None|True)$/.test(token)) kind = "python-constant";
    else if (/^(?:print|input|int|float|str|len|range|list|dict|set|tuple|bool|abs|round|min|max|sum|type)$/.test(token)) kind = "python-builtin";
    else if (/^(?:and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield)$/.test(token)) kind = "python-keyword";
    output += '<span class="' + kind + '">' + escapeHTML(token) + "</span>";
    cursor = tokenPattern.lastIndex;
  }
  output += escapeHTML(code.slice(cursor));
  return output;
}


const pythonCompletions = [
  ["print", "вывод в консоль"],
  ["input", "ввод значения"],
  ["len", "длина последовательности"],
  ["range", "диапазон чисел"],
  ["int", "целое число"],
  ["float", "дробное число"],
  ["str", "строка"],
  ["if", "условие"],
  ["elif", "дополнительное условие"],
  ["else", "иначе"],
  ["for", "цикл for"],
  ["while", "цикл while"],
  ["def", "объявление функции"],
  ["return", "вернуть значение"],
  ["True", "логическое значение"],
  ["False", "логическое значение"],
  ["None", "отсутствие значения"]
];

export function getPythonSuggestions(source, cursor = String(source ?? "").length) {
  const before = String(source ?? "").slice(0, Math.max(0, cursor));
  const match = before.match(/[A-Za-z_]\w*$/);
  if (!match) return [];
  const prefix = match[0];
  return pythonCompletions
    .filter(([label]) => label.startsWith(prefix) && label !== prefix)
    .slice(0, 6)
    .map(([label, detail]) => ({ label, detail }));
}


export function tracePythonRange(source) {
  const lines = String(source ?? "").replace(/\r/g, "").split("\n");
  const header = lines[0]?.match(/^for\s+([A-Za-z_]\w*)\s+in\s+range\((\d+),\s*(\d+)\):$/);
  if (!header) return [];
  const [, iterator, startText, endText] = header;
  const body = [];
  for (let index = 1; index < lines.length && /^\s{4}/.test(lines[index]); index++) {
    const statement = lines[index].slice(4).trim();
    if (!statement) continue;
    if (!/^print\([A-Za-z_]\w*\)$/.test(statement) &&
        !/^[A-Za-z_]\w*\s*=\s*[A-Za-z_]\w*\s*[+*\-]\s*(?:[A-Za-z_]\w*|\d+)$/.test(statement)) return [];
    body.push({ statement, line: index + 1 });
  }
  if (!body.length) return [];
  const end = Math.min(Number(endText), Number(startText) + 30);
  const variables = {};
  const steps = [];
  for (let value = Number(startText); value < end; value++) {
    variables[iterator] = value;
    for (const item of body) {
      const { statement, line } = item;
      const assignment = statement.match(/^([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)\s*([+*\-])\s*([A-Za-z_]\w*|\d+)$/);
      if (assignment) {
        const left = Number(variables[assignment[2]]);
        const right = /^\d+$/.test(assignment[4]) ? Number(assignment[4]) : Number(variables[assignment[4]]);
        if (!Number.isFinite(left) || !Number.isFinite(right)) return [];
        variables[assignment[1]] = assignment[3] === "+" ? left + right : assignment[3] === "-" ? left - right : left * right;
      }
      const print = statement.match(/^print\(([A-Za-z_]\w*)\)$/);
      if (print) {
        const printed = variables[print[1]];
        if (printed === undefined) return [];
      }
      steps.push({
        line,
        source: lines[line - 1].trim(),
        variables: { ...variables },
        output: print ? String(variables[print[1]]) : ""
      });
      if (steps.length >= 120) return steps;
    }
  }
  return steps;
}
