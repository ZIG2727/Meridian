const SYMBOLS = { K:"♔",Q:"♕",R:"♖",B:"♗",N:"♘",P:"♙", k:"♚",q:"♛",r:"♜",b:"♝",n:"♞",p:"♟" };
const TYPES = { "♔":"k","♕":"q","♖":"r","♗":"b","♘":"n","♙":"p","♚":"k","♛":"q","♜":"r","♝":"b","♞":"n","♟":"p" };
export const isWhiteChessPiece = piece => Boolean(piece && "♔♕♖♗♘♙".includes(piece));
export const chessSquareName = index => String.fromCharCode(97 + index % 8) + (8 - Math.floor(index / 8));
const squareIndex = name => /^[a-h][1-8]$/.test(name) ? (8 - Number(name[1])) * 8 + name.charCodeAt(0) - 97 : -1;
const cloneState = state => ({ ...state, board: state.board.slice() });

export function parseChessPosition(fen) {
  const fields = String(fen || "").trim().split(/\s+/);
  if (fields.length !== 6 || !["w","b"].includes(fields[1]) || !/^(?:-|[KQkq]+)$/.test(fields[2]) ||
      !/^(?:-|[a-h][36])$/.test(fields[3]) || !/^\d+$/.test(fields[4]) || !/^[1-9]\d*$/.test(fields[5])) return null;
  const ranks = fields[0].split("/");
  if (ranks.length !== 8) return null;
  const board = [];
  let whiteKings = 0, blackKings = 0;
  for (const rank of ranks) {
    let count = 0;
    for (const token of rank) {
      if (/^[1-8]$/.test(token)) {
        const amount = Number(token);
        for (let i = 0; i < amount; i++) board.push("");
        count += amount;
      } else if (SYMBOLS[token]) {
        board.push(SYMBOLS[token]); count++;
        if (token === "K") whiteKings++;
        if (token === "k") blackKings++;
      } else return null;
    }
    if (count !== 8) return null;
  }
  if (board.length !== 64 || whiteKings !== 1 || blackKings !== 1) return null;
  const epSquare = fields[3] === "-" ? -1 : squareIndex(fields[3]);
  if (epSquare >= 0 && board[epSquare]) return null;
  return { board, turn: fields[1], castling: fields[2] === "-" ? "" : fields[2],
    epSquare, halfmove: Number(fields[4]), fullmove: Number(fields[5]) };
}
function kingIndex(state, white) { return state.board.indexOf(white ? "♔" : "♚"); }
function attacked(state, target, byWhite) {
  const tx = target % 8, ty = Math.floor(target / 8), board = state.board;
  for (let index = 0; index < 64; index++) {
    const piece = board[index];
    if (!piece || isWhiteChessPiece(piece) !== byWhite) continue;
    const type = TYPES[piece], x = index % 8, y = Math.floor(index / 8), dx = tx - x, dy = ty - y;
    if (type === "p" && Math.abs(dx) === 1 && dy === (byWhite ? -1 : 1)) return true;
    if (type === "n" && ((Math.abs(dx) === 1 && Math.abs(dy) === 2) || (Math.abs(dx) === 2 && Math.abs(dy) === 1))) return true;
    if (type === "k" && Math.max(Math.abs(dx), Math.abs(dy)) === 1) return true;
    const diagonal = Math.abs(dx) === Math.abs(dy) && dx !== 0;
    const straight = (dx === 0) !== (dy === 0);
    if ((type === "b" && !diagonal) || (type === "r" && !straight) || (type === "q" && !diagonal && !straight)) continue;
    if (!["b","r","q"].includes(type)) continue;
    const sx = Math.sign(dx), sy = Math.sign(dy);
    let fx = x + sx, fy = y + sy, clear = true;
    while (fx !== tx || fy !== ty) {
      if (fx < 0 || fx > 7 || fy < 0 || fy > 7 || board[fy * 8 + fx]) { clear = false; break; }
      fx += sx; fy += sy;
    }
    if (clear) return true;
  }
  return false;
}
function inCheck(state, white) {
  const king = kingIndex(state, white);
  return king < 0 || attacked(state, king, !white);
}
function pseudoMoves(state, from) {
  const board = state.board, piece = board[from];
  if (!piece || isWhiteChessPiece(piece) !== (state.turn === "w")) return [];
  const white = isWhiteChessPiece(piece), type = TYPES[piece], x = from % 8, y = Math.floor(from / 8), moves = [];
  const at = (fx,fy) => fx >= 0 && fx < 8 && fy >= 0 && fy < 8 ? board[fy * 8 + fx] : null;
  const add = (fx,fy) => {
    if (fx < 0 || fx > 7 || fy < 0 || fy > 7) return false;
    const target = at(fx,fy);
    if (!target || isWhiteChessPiece(target) !== white) moves.push(fy * 8 + fx);
    return !target;
  };
  if (type === "p") {
    const direction = white ? -1 : 1, start = white ? 6 : 1;
    if (!at(x,y+direction)) {
      add(x,y+direction);
      if (y === start && !at(x,y+2*direction)) add(x,y+2*direction);
    }
    for (const dx of [-1,1]) {
      if (x+dx < 0 || x+dx > 7 || y+direction < 0 || y+direction > 7) continue;
      const target = at(x+dx,y+direction), index = (y+direction)*8+x+dx;
      if (target && isWhiteChessPiece(target) !== white) moves.push(index);
      else if (!target && index === state.epSquare) moves.push(index);
    }
  } else if (type === "n") {
    for (const [dx,dy] of [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]]) add(x+dx,y+dy);
  } else if (type === "k") {
    for (let dx=-1;dx<=1;dx++) for (let dy=-1;dy<=1;dy++) if (dx||dy) add(x+dx,y+dy);
    const home = white ? 60 : 4, enemy = !white, rank = white ? 7 : 0;
    const rights = white ? ["K","Q"] : ["k","q"];
    if (from === home && !inCheck(state,white)) {
      if (state.castling.includes(rights[0]) && !board[home+1] && !board[home+2] &&
          board[home+3] === (white ? "♖" : "♜") &&
          !attacked(state,home+1,enemy) && !attacked(state,home+2,enemy)) moves.push(home+2);
      if (state.castling.includes(rights[1]) && !board[home-1] && !board[home-2] && !board[home-3] &&
          board[home-4] === (white ? "♖" : "♜") &&
          !attacked(state,home-1,enemy) && !attacked(state,home-2,enemy)) moves.push(home-2);
    }
  } else {
    const directions = [];
    if (type === "b" || type === "q") directions.push([1,1],[1,-1],[-1,1],[-1,-1]);
    if (type === "r" || type === "q") directions.push([1,0],[-1,0],[0,1],[0,-1]);
    for (const [dx,dy] of directions) {
      let fx=x+dx,fy=y+dy;
      while (fx>=0&&fx<8&&fy>=0&&fy<8) {
        if (!add(fx,fy)) break;
        fx+=dx;fy+=dy;
      }
    }
  }
  return moves;
}
function applyUnchecked(state, from, to, promotion = "q") {
  const next = cloneState(state), board = next.board, piece = board[from], target = board[to];
  const white = isWhiteChessPiece(piece), type = TYPES[piece], fromName = chessSquareName(from), toName = chessSquareName(to);
  let captured = target || "", enPassant = false, castle = "";
  if (type === "p" && to === state.epSquare && !target && from % 8 !== to % 8) {
    const capturedIndex = to + (white ? 8 : -8);
    captured = board[capturedIndex]; board[capturedIndex] = ""; enPassant = true;
  }
  board[to] = piece;
  board[from] = "";
  if (type === "k" && Math.abs(to-from) === 2) {
    castle = to > from ? "O-O" : "O-O-O";
    const rookFrom = to > from ? from+3 : from-4, rookTo = to > from ? from+1 : from-1;
    board[rookTo] = board[rookFrom]; board[rookFrom] = "";
  }
  let promoted = "";
  if (type === "p" && (to < 8 || to >= 56)) {
    const selected = ["q","r","b","n"].includes(promotion) ? promotion : "q";
    const symbol = (white ? selected.toUpperCase() : selected);
    board[to] = SYMBOLS[symbol]; promoted = selected;
  }
  let rights = next.castling;
  if (type === "k") rights = rights.replace(white ? /[KQ]/g : /[kq]/g,"");
  if (from === 63 || to === 63) rights = rights.replace("K","");
  if (from === 56 || to === 56) rights = rights.replace("Q","");
  if (from === 7 || to === 7) rights = rights.replace("k","");
  if (from === 0 || to === 0) rights = rights.replace("q","");
  next.castling = rights;
  next.epSquare = type === "p" && Math.abs(to-from) === 16 ? (from+to)/2 : -1;
  next.halfmove = type === "p" || captured ? 0 : next.halfmove+1;
  if (state.turn === "b") next.fullmove++;
  next.turn = state.turn === "w" ? "b" : "w";
  return { state: next, move: { from: fromName, to: toName, piece, captured, enPassant, castle, promotion: promoted } };
}
function legalMoves(state, from) {
  const piece = state.board[from];
  if (!piece || isWhiteChessPiece(piece) !== (state.turn === "w")) return [];
  const white = isWhiteChessPiece(piece);
  return pseudoMoves(state,from).filter(to => {
    if (state.board[to] === "♔" || state.board[to] === "♚") return false;
    const next = applyUnchecked(state,from,to).state;
    return !inCheck(next,white);
  });
}
export function getLegalChessMoves(fenOrState, square) {
  const state = typeof fenOrState === "string" ? parseChessPosition(fenOrState) : fenOrState;
  const from = squareIndex(square);
  if (!state || from < 0) return [];
  return legalMoves(state,from).map(chessSquareName);
}
export function applyChessMove(stateOrFen, fromSquare, toSquare, promotion = "q") {
  const state = typeof stateOrFen === "string" ? parseChessPosition(stateOrFen) : stateOrFen;
  const from = squareIndex(fromSquare), to = squareIndex(toSquare);
  if (!state || from < 0 || to < 0 || !legalMoves(state,from).includes(to)) return null;
  const result = applyUnchecked(state,from,to,promotion);
  return result;
}
export function getChessPositionStatus(fenOrState) {
  const state = typeof fenOrState === "string" ? parseChessPosition(fenOrState) : fenOrState;
  if (!state) return { valid:false,check:false,checkmate:false,stalemate:false };
  const check = inCheck(state,state.turn === "w");
  let hasMove = false;
  for (let index=0;index<64&&!hasMove;index++) if (state.board[index] && isWhiteChessPiece(state.board[index]) === (state.turn === "w") && legalMoves(state,index).length) hasMove = true;
  return { valid:true,check,checkmate:check&&!hasMove,stalemate:!check&&!hasMove };
}
export function chessPositionToFen(state) {
  const ranks=[];
  for(let row=0;row<8;row++){
    let empty=0,rank="";
    for(let col=0;col<8;col++){
      const piece=state.board[row*8+col];
      if(!piece){empty++;continue;}
      if(empty){rank+=empty;empty=0;}
      const symbol=Object.entries(SYMBOLS).find(([,value])=>value===piece)?.[0]||"";
      rank+=symbol;
    }
    if(empty)rank+=empty;
    ranks.push(rank);
  }
  return ranks.join("/")+" "+state.turn+" "+(state.castling||"-")+" "+(state.epSquare<0?"-":chessSquareName(state.epSquare))+" "+state.halfmove+" "+state.fullmove;
}
