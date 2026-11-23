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
  const match = before.match(/[A-Za-z_]\\w*$/);
  if (!match) return [];
  const prefix = match[0];
  return pythonCompletions
    .filter(([label]) => label.startsWith(prefix) && label !== prefix)
    .slice(0, 6)
    .map(([label, detail]) => ({ label, detail }));
}
