const escapeHTML = value => String(value).replace(/[&<>"]/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"
}[char]));

const tokenPattern = /(#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:False|None|True|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield)\b|\b(?:print|input|int|float|str|len|range|list|dict|set|tuple|bool|abs|round|min|max|sum|type)\b|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*(?=\s*\())/g;

export function highlightPythonCode(source) {
  const code = String(source ?? "");
  let output = "", cursor = 0, match;
  while ((match = tokenPattern.exec(code))) {
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
