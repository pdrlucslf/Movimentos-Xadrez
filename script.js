// ======== Modelo e utilidades ========
const EMPTY = null;
const SYMBOL = {
  w: { K:'♔', Q:'♕', R:'♖', B:'♗', N:'♘', P:'♙' },
  b: { K:'♚', Q:'♛', R:'♜', B:'♝', N:'♞', P:'♟' }
};
// valores simples para a heurística da CPU
const PVALUE = { K:0, Q:9, R:5, B:3, N:3, P:1 };

let board = makeInitialBoard();
let turn = 'w';          // 'w' = brancas (você), 'b' = pretas (CPU)
let sel = null;          // { r, c } selecionada
let legal = [];          // [{ r, c, type: 'move'|'capture' }]
let busy = false;        // bloqueia cliques enquanto a CPU pensa
let gameOver = false;

const $ = s => document.querySelector(s);
const boardEl = $('#board');
const msgEl = $('#gameMsg');

function makeInitialBoard(){
  const b0 = rowPieces('b');
  const b1 = Array(8).fill({c:'b', t:'P'});
  const empty = () => Array(8).fill(EMPTY);
  const w6 = Array(8).fill({c:'w', t:'P'});
  const w7 = rowPieces('w');
  return [b0,b1,empty(),empty(),empty(),empty(),w6,w7].map(row => row.map(clonePiece));
}
function rowPieces(color){
  return [
    {c:color,t:'R'},{c:color,t:'N'},{c:color,t:'B'},{c:color,t:'Q'},
    {c:color,t:'K'},{c:color,t:'B'},{c:color,t:'N'},{c:color,t:'R'}
  ];
}
function clonePiece(p){ return p? {c:p.c, t:p.t} : null; }
function cloneBoard(b){ return b.map(row => row.map(clonePiece)); }
function inside(r,c){ return r>=0 && r<8 && c>=0 && c<8; }
function findKing(b, color){
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p=b[r][c]; if(p && p.c===color && p.t==='K') return {r,c};
  }
  return null;
}
function setMsg(t){ msgEl.textContent = t || ''; }

// ======== Ataques e xeque ========
function isSquareAttacked(b, r, c, byColor){
  // cavalo
  const K = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  for(const [dr,dc] of K){
    const rr=r+dr, cc=c+dc;
    if(!inside(rr,cc)) continue;
    const p=b[rr][cc];
    if(p && p.c===byColor && p.t==='N') return true;
  }
  // rei (adjacentes)
  for(const dr of [-1,0,1]) for(const dc of [-1,0,1]){
    if(dr===0 && dc===0) continue;
    const rr=r+dr, cc=c+dc;
    if(!inside(rr,cc)) continue;
    const p=b[rr][cc];
    if(p && p.c===byColor && p.t==='K') return true;
  }
  // peões (direção de ataque depende da cor do atacante)
  if(byColor==='w'){
    for(const dc of [-1,1]){
      const rr=r-1, cc=c+dc;
      if(inside(rr,cc)){ const p=b[rr][cc]; if(p && p.c==='w' && p.t==='P') return true; }
    }
  }else{
    for(const dc of [-1,1]){
      const rr=r+1, cc=c+dc;
      if(inside(rr,cc)){ const p=b[rr][cc]; if(p && p.c==='b' && p.t==='P') return true; }
    }
  }
  // bispo/torre/dama (raios)
  const rays = (dirs, types) => {
    for(const [dr,dc] of dirs){
      let rr=r+dr, cc=c+dc;
      while(inside(rr,cc)){
        const p=b[rr][cc];
        if(!p){ rr+=dr; cc+=dc; continue; }
        if(p.c!==byColor) break;
        if(types.includes(p.t)) return true;
        break;
      }
    }
  };
  rays([[1,1],[1,-1],[-1,1],[-1,-1]], ['B','Q']); // diagonais
  rays([[1,0],[-1,0],[0,1],[0,-1]], ['R','Q']);   // ortogonais
  return false;
}
function inCheck(b, color){
  const k = findKing(b, color);
  if(!k) return false;
  return isSquareAttacked(b, k.r, k.c, color==='w'?'b':'w');
}

// ======== Geração de movimentos (com filtro legal) ========
function generatePseudoMoves(b, r, c){
  const p = b[r][c]; if(!p) return [];
  const res = []; const enemy = (pc)=> pc && pc.c !== p.c;
  const push = (rr,cc)=>{
    if(!inside(rr,cc)) return false;
    const t=b[rr][cc];
    if(!t){ res.push({r:rr,c:cc,type:'move'}); return true; }
    if(enemy(t)){ res.push({r:rr,c:cc,type:'capture'}); return false; }
    return false;
  };
  switch(p.t){
    case 'N': {
      const L=[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
      for(const [dr,dc] of L){
        const rr=r+dr, cc=c+dc; if(!inside(rr,cc)) continue;
        const t=b[rr][cc]; if(!t) res.push({r:rr,c:cc,type:'move'}); else if(enemy(t)) res.push({r:rr,c:cc,type:'capture'});
      } break;
    }
    case 'B': rays([[1,1],[1,-1],[-1,1],[-1,-1]]); break;
    case 'R': rays([[1,0],[-1,0],[0,1],[0,-1]]); break;
    case 'Q': rays([[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]]); break;
    case 'K': {
      for(const dr of [-1,0,1]) for(const dc of [-1,0,1]){
        if(dr===0 && dc===0) continue;
        const rr=r+dr, cc=c+dc; if(!inside(rr,cc)) continue;
        const t=b[rr][cc]; if(!t) res.push({r:rr,c:cc,type:'move'}); else if(enemy(t)) res.push({r:rr,c:cc,type:'capture'});
      } break;
    }
    case 'P': {
      const dir = (p.c==='w') ? -1 : 1;
      const startRow = (p.c==='w') ? 6 : 1;
      if(inside(r+dir,c) && !b[r+dir][c]) res.push({r:r+dir,c,type:'move'});
      if(r===startRow && !b[r+dir][c] && inside(r+2*dir,c) && !b[r+2*dir][c]) res.push({r:r+2*dir,c,type:'move'});
      for(const dc of [-1,1]){
        const rr=r+dir, cc=c+dc; if(!inside(rr,cc)) continue;
        const t=b[rr][cc]; if(t && enemy(t)) res.push({r:rr,c:cc,type:'capture'});
      } break;
    }
  }
  return res;
  function rays(dirs){
    for(const [dr,dc] of dirs){
      let rr=r+dr, cc=c+dc;
      while(true){
        if(!inside(rr,cc)) break;
        const t=b[rr][cc];
        if(!t){ res.push({r:rr,c:cc,type:'move'}); rr+=dr; cc+=dc; continue; }
        if(t.c !== b[r][c].c){ res.push({r:rr,c:cc,type:'capture'}); }
        break;
      }
    }
  }
}

function applyMove(b, r0,c0,r1,c1){
  const nb = cloneBoard(b);
  const p = nb[r0][c0];
  nb[r0][c0] = EMPTY;
  // promoção simples (vira dama)
  if(p.t==='P' && ((p.c==='w' && r1===0) || (p.c==='b' && r1===7))){
    nb[r1][c1] = {c:p.c, t:'Q'};
  } else {
    nb[r1][c1] = {c:p.c, t:p.t};
  }
  return nb;
}

function generateLegalMoves(b, r, c){
  const p = b[r][c]; if(!p) return [];
  const pseudo = generatePseudoMoves(b, r, c);
  const out = [];
  for(const m of pseudo){
    const nb = applyMove(b, r, c, m.r, m.c);
    if(!inCheck(nb, p.c)) out.push(m);
  }
  return out;
}

function getAllLegalMoves(b, color){
  const res = [];
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const p = b[r][c]; if(!p || p.c!==color) continue;
      for(const m of generateLegalMoves(b, r, c)){
        res.push({fromR:r,fromC:c,toR:m.r,toC:m.c,type:m.type,piece:p});
      }
    }
  }
  return res;
}

// ======== Render ========
function render(){
  boardEl.innerHTML = '';
  boardEl.classList.toggle('disabled', busy || gameOver);

  // marcar rei em xeque (lado que está para jogar)
  const k = findKing(board, turn);
  const inChk = inCheck(board, turn);

  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const sq = document.createElement('button');
      sq.className = 'square ' + ((r+c)%2===0 ? 'light' : 'dark');
      sq.dataset.r = r; sq.dataset.c = c;

      const fileClass = ['fileA','fileB','fileC','fileD','fileE','fileF','fileG','fileH'][c];
      const rankClass = ['rank8','rank7','rank6','rank5','rank4','rank3','rank2','rank1'][r];
      if(fileClass) sq.classList.add(fileClass);
      if(rankClass) sq.classList.add(rankClass);

      const piece = board[r][c];
      if (piece) {
        sq.textContent = SYMBOL[piece.c][piece.t];
        sq.classList.add(piece.c === 'w' ? 'pw' : 'pb');
      }

      if(sel && sel.r===r && sel.c===c) sq.classList.add('selected');
      const found = legal.find(m => m.r===r && m.c===c);
      if(found){
        sq.classList.add(found.type);
        const hint = document.createElement('div');
        hint.className = 'hint';
        sq.appendChild(hint);
      }

      if(inChk && k && k.r===r && k.c===c) sq.classList.add('check-king');

      sq.addEventListener('click', onSquareClick);
      boardEl.appendChild(sq);
    }
  }

  $('#turno').textContent = turn==='w' ? 'Brancas' : 'Pretas';
  $('#turno').classList.toggle('thinking', busy && !gameOver);

  // mensagem de xeque
  if(!gameOver){
    setMsg(inChk ? 'Xeque!' : '');
  }
}

function onSquareClick(e){
  if (busy || gameOver) return;
  const r = Number(e.currentTarget.dataset.r);
  const c = Number(e.currentTarget.dataset.c);
  const piece = board[r][c];

  // Jogada?
  const targetMove = legal.find(m => m.r===r && m.c===c);
  if(sel && targetMove){
    board = applyMove(board, sel.r, sel.c, r, c);
    afterHumanMove();
    return;
  }

  // Feedback de turno errado
  if (piece && piece.c !== turn) {
    const t = $('#turno');
    t.classList.add('pulse-turn');
    setTimeout(()=> t.classList.remove('pulse-turn'), 500);
    return;
  }

  // Selecionar/limpar
  if(piece && piece.c === turn){
    sel = { r, c };
    legal = generateLegalMoves(board, r, c);
  } else {
    sel = null; legal = [];
  }
  render();
}

// ======== Fluxo de turnos e fim de jogo ========
function checkGameEndAndAnnounce(){
  const moves = getAllLegalMoves(board, turn);
  const chk = inCheck(board, turn);
  if(moves.length === 0){
    gameOver = true;
    if(chk){
      setMsg(turn==='w' ? 'Xeque-mate! CPU venceu.' : 'Xeque-mate! Você venceu!');
    }else{
      setMsg('Empate por afogamento.');
    }
    render(); // para aplicar estilos de xeque no rei do lado que ficou travado
    return true;
  }
  return false;
}

function afterHumanMove(){
  // troca para CPU e checa fim
  turn = 'b'; sel = null; legal = [];
  if(checkGameEndAndAnnounce()) { render(); return; }
  busy = true; render();
  setTimeout(aiMove, 420);
}

function afterCpuMove(){
  turn = 'w'; busy = false; sel = null; legal = [];
  if(checkGameEndAndAnnounce()) { render(); return; }
  render();
}

// ======== CPU (pretas) ========
function aiMove(){
  if(gameOver) return;
  const moves = getAllLegalMoves(board, 'b');
  if(moves.length===0){ afterCpuMove(); return; }

  // Heurística: capturas valiosas > promoção > centro > aleatório leve
  let best = null, bestScore = -1e9;
  for(const mv of moves){
    let s = Math.random()*0.1;
    if(mv.type === 'capture'){
      const t = board[mv.toR][mv.toC];
      if(t) s += PVALUE[t.t] * 10;
    }
    if(mv.piece.t==='P' && mv.toR===7) s += 80; // promoção
    s += (3.5 - Math.abs(mv.toR-3.5)) * 0.2 + (3.5 - Math.abs(mv.toC-3.5)) * 0.05;
    // evitar levar xeque imediato (uma olhadinha de 1 ply)
    const nb = applyMove(board, mv.fromR, mv.fromC, mv.toR, mv.toC);
    if(inCheck(nb, 'b')) s -= 50;

    if(s>bestScore){ bestScore=s; best=mv; }
  }

  if(best){
    board = applyMove(board, best.fromR, best.fromC, best.toR, best.toC);
  }
  afterCpuMove();
}

// ======== Controles ========
$('#btnReset').addEventListener('click', ()=>{
  board = makeInitialBoard(); turn='w'; sel=null; legal=[]; busy=false; gameOver=false; setMsg(''); render();
});
document.addEventListener('keydown', (e)=>{
  if(e.key==='r' || e.key==='R'){
    board = makeInitialBoard(); turn='w'; sel=null; legal=[]; busy=false; gameOver=false; setMsg(''); render();
  }
});

// Inicializa
render();
