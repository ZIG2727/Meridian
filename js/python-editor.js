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


function tracePythonWhile(lines) {
  const whileLines = lines.map((line, index) => /^while\s/.test(line.trim()) ? index : -1).filter(index => index >= 0);
  if (!whileLines.length) return null;
  if (whileLines.length !== 1) return [];
  const whileIndex = whileLines[0];
  const header = lines[whileIndex].match(/^while\s+([A-Za-z_]\w*)\s*(<|<=|>|>=|==|!=)\s*(\d+):$/);
  if (!header) return [];
  const [, counter, operator, limitText] = header;
  const variables = {};
  for (let index = 0; index < whileIndex; index++) {
    const line = lines[index];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const assignment = line.match(/^([A-Za-z_]\w*)\s*=\s*(-?\d+)$/);
    if (!assignment) return [];
    variables[assignment[1]] = Number(assignment[2]);
  }
  if (!Object.prototype.hasOwnProperty.call(variables, counter)) return [];
  const printLine = whileIndex + 2;
  const incrementLine = whileIndex + 3;
  if (lines[whileIndex + 1] !== "    print(" + counter + ")" ||
      lines[whileIndex + 2] !== "    " + counter + " = " + counter + " + 1") return [];
  for (let index = whileIndex + 3; index < lines.length; index++) {
    if (lines[index].trim() && !lines[index].trim().startsWith("#")) return [];
  }
  const limit = Number(limitText);
  const test = value => operator === "<" ? value < limit :
    operator === "<=" ? value <= limit :
    operator === ">" ? value > limit :
    operator === ">=" ? value >= limit :
    operator === "==" ? value === limit : value !== limit;
  const steps = [];
  const record = (line, iteration, source, explanation, output = "", label = "") => {
    steps.push({ line, iteration, source, explanation, output, label, variables: { ...variables } });
  };
  let iterations = 0;
  while (true) {
    const current = Number(variables[counter]);
    const passed = test(current);
    const right = String(limit);
    if (!passed) {
      record(whileIndex + 1, iterations + 1, lines[whileIndex].trim(),
        "Проверяем условие: " + counter + " (" + current + ") " + operator + " " + right +
        ". Условие ложно, поэтому цикл завершает работу.",
        "", "Цикл завершён");
      break;
    }
    if (iterations >= 30) return [];
    record(whileIndex + 1, iterations + 1, lines[whileIndex].trim(),
      "Проверяем условие: " + counter + " (" + current + ") " + operator + " " + right +
      ". Условие истинно — выполняем тело цикла.",
      "", "Проверка условия · итерация " + (iterations + 1));
    record(printLine, iterations + 1, lines[printLine - 1].trim(),
      "Команда print(" + counter + ") выводит значение " + current + ".",
      String(current), "Вывод · итерация " + (iterations + 1));
    variables[counter] = current + 1;
    record(incrementLine, iterations + 1, lines[incrementLine - 1].trim(),
      "Переменной " + counter + " присваивается значение: " + counter + " (" + current + ") + 1 = " + variables[counter] + ".",
      "", "Обновление счётчика · итерация " + (iterations + 1));
    iterations++;
  }
  return steps;
}

export function tracePythonRange(source) {
  const lines = String(source ?? "").replace(/\r/g, "").split("\n");
  const whileTrace = tracePythonWhile(lines);
  if (whileTrace !== null) return whileTrace;
  const header = lines[0]?.match(/^for\s+([A-Za-z_]\w*)\s+in\s+range\((\d+),\s*(\d+)\):$/);
  if (!header) return [];
  const [, iterator, startText, endText] = header;
  const nodes = [];
  const statementPattern = /^(?:print\([A-Za-z_]\w*\)|[A-Za-z_]\w*\s*=\s*[A-Za-z_]\w*\s*[+*\-]\s*(?:[A-Za-z_]\w*|\d+))$/;
  const conditionPattern = /^if\s+([A-Za-z_]\w*)\s*(==|!=|<=|>=|<|>)\s*(-?\d+(?:\.\d+)?):$/;
  const readStatement = (lineIndex, indent) => {
    const raw = lines[lineIndex] || "";
    if (!raw.trim()) return null;
    if (!raw.startsWith(" ".repeat(indent)) || raw.startsWith(" ".repeat(indent + 1))) return false;
    const statement = raw.slice(indent).trim();
    if (!statementPattern.test(statement)) return false;
    return { type: "statement", statement, line: lineIndex + 1 };
  };
  for (let index = 1; index < lines.length;) {
    if (!lines[index].trim()) { index++; continue; }
    if (!lines[index].startsWith("    ") || lines[index].startsWith("     ")) return [];
    const raw = lines[index].slice(4).trim();
    const condition = raw.match(conditionPattern);
    if (!condition) {
      const statement = readStatement(index, 4);
      if (!statement) return [];
      nodes.push(statement);
      index++;
      continue;
    }
    const ifLine = index + 1;
    const thenNodes = [];
    index++;
    while (index < lines.length && (!lines[index].trim() || lines[index].startsWith("        "))) {
      if (lines[index].trim()) {
        const statement = readStatement(index, 8);
        if (!statement) return [];
        thenNodes.push(statement);
      }
      index++;
    }
    if (!thenNodes.length) return [];
    let elseLine = null;
    const elseNodes = [];
    if (index < lines.length && lines[index].trim() === "else:") {
      if (lines[index] !== "    else:") return [];
      elseLine = index + 1;
      index++;
      while (index < lines.length && (!lines[index].trim() || lines[index].startsWith("        "))) {
        if (lines[index].trim()) {
          const statement = readStatement(index, 8);
          if (!statement) return [];
          elseNodes.push(statement);
        }
        index++;
      }
      if (!elseNodes.length) return [];
    }
    nodes.push({
      type: "if",
      line: ifLine,
      source: lines[ifLine - 1].trim(),
      condition: { left: condition[1], operator: condition[2], right: condition[3] },
      thenNodes,
      elseLine,
      elseNodes
    });
  }
  if (!nodes.length) return [];
  const end = Math.min(Number(endText), Number(startText) + 30);
  const variables = {};
  const steps = [];
  const record = (line, iteration, sourceText, explanation, output = "") => {
    steps.push({ line, iteration, source: sourceText, explanation, variables: { ...variables }, output });
  };
  const executeStatement = (node, iteration) => {
    const { statement, line } = node;
    const assignment = statement.match(/^([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)\s*([+*\-])\s*([A-Za-z_]\w*|\d+)$/);
    let explanation = "Выполняется команда " + statement + ".";
    if (assignment) {
      const left = Number(variables[assignment[2]]);
      const rightIsLiteral = /^\d+$/.test(assignment[4]);
      const right = rightIsLiteral ? Number(assignment[4]) : Number(variables[assignment[4]]);
      if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
      const result = assignment[3] === "+" ? left + right : assignment[3] === "-" ? left - right : left * right;
      variables[assignment[1]] = result;
      const rightLabel = rightIsLiteral ? String(right) : assignment[4] + " (" + right + ")";
      explanation = "Переменной " + assignment[1] + " присваивается значение: " +
        assignment[2] + " (" + left + ") " + assignment[3] + " " + rightLabel + " = " + result + ".";
    }
    const print = statement.match(/^print\(([A-Za-z_]\w*)\)$/);
    let output = "";
    if (print) {
      const printed = variables[print[1]];
      if (printed === undefined) return false;
      explanation = "Команда " + statement + " выводит значение " + printed + ".";
      output = String(printed);
    }
    record(line, iteration, lines[line - 1].trim(), explanation, output);
    return true;
  };
  for (let value = Number(startText); value < end; value++) {
    variables[iterator] = value;
    for (const node of nodes) {
      if (node.type === "statement") {
        if (!executeStatement(node, value)) return [];
      } else {
        const left = Number(variables[node.condition.left]);
        const rightIsLiteral = /^-?\d+(?:\.\d+)?$/.test(node.condition.right);
        const right = rightIsLiteral ? Number(node.condition.right) : Number(variables[node.condition.right]);
        if (!Number.isFinite(left) || !Number.isFinite(right)) return [];
        const { operator } = node.condition;
        const passed = operator === "==" ? left === right :
          operator === "!=" ? left !== right :
          operator === "<" ? left < right :
          operator === "<=" ? left <= right :
          operator === ">" ? left > right : left >= right;
        const rightLabel = rightIsLiteral ? String(right) : node.condition.right + " (" + right + ")";
        record(node.line, value, node.source,
          "Проверяем условие: " + node.condition.left + " (" + left + ") " + operator + " " +
          rightLabel + ". Условие " + (passed ? "истинно" : "ложно") + ".");
        if (passed) {
          for (const child of node.thenNodes) if (!executeStatement(child, value)) return [];
        } else if (node.elseNodes.length) {
          record(node.elseLine, value, lines[node.elseLine - 1].trim(),
            "Условие ложно, поэтому выполняется ветка else.");
          for (const child of node.elseNodes) if (!executeStatement(child, value)) return [];
        }
      }
      if (steps.length >= 120) return steps;
    }
  }
  return steps;
}