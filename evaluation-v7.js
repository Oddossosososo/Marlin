// MARLIN V7 hand-crafted positional evaluation.
// Scores are centipawns from the side-to-move perspective. Structural weaknesses
// are penalised softly, never made illegal: concrete tactics always take priority.
const VALUE = { p:100, n:320, b:335, r:500, q:900, k:20000 };
const KNIGHT_STEPS = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const KING_STEPS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const BISHOP_DIRS = [[-1,-1],[-1,1],[1,-1],[1,1]];
const ROOK_DIRS = [[-1,0],[1,0],[0,-1],[0,1]];
const QUEEN_DIRS = [...BISHOP_DIRS,...ROOK_DIRS];
const inside = (r,c) => r>=0 && r<8 && c>=0 && c<8;
const clamp = (n,lo,hi) => Math.max(lo,Math.min(hi,n));

function emptyMap() { return Array.from({length:8},()=>Array(8).fill(0)); }
function addAttack(map,r,c) { if(inside(r,c)) map[r][c]++; }

function pawnAttacks(board, r, c, color, map, mobility) {
  const dir = color==="w" ? -1 : 1;
  for(const dc of [-1,1]) {
    const nr=r+dir,nc=c+dc;
    if(inside(nr,nc)) { addAttack(map,nr,nc); if(board[nr][nc] && board[nr][nc].color!==color) mobility[color]++; }
  }
  const one=r+dir, two=r+2*dir;
  if(inside(one,c) && !board[one][c]) {
    mobility[color]++;
    const home=color==="w"?6:1;
    if(r===home && inside(two,c) && !board[two][c]) mobility[color]++;
  }
}

function trace(board,r,c,color,dirs,limit,map,mobility) {
  for(const [dr,dc] of dirs) {
    for(let step=1;step<=limit;step++) {
      const nr=r+dr*step,nc=c+dc*step;
      if(!inside(nr,nc)) break;
      addAttack(map,nr,nc);
      const target=board[nr][nc];
      if(!target || target.color!==color) mobility[color]++;
      if(target) break;
    }
  }
}

function attacksAndMobility(board) {
  const attacks={w:emptyMap(),b:emptyMap()};
  const mobility={w:0,b:0};
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
    const p=board[r][c]; if(!p) continue;
    if(p.type==="p") pawnAttacks(board,r,c,p.color,attacks[p.color],mobility);
    else if(p.type==="n") trace(board,r,c,p.color,KNIGHT_STEPS,1,attacks[p.color],mobility);
    else if(p.type==="k") trace(board,r,c,p.color,KING_STEPS,1,attacks[p.color],mobility);
    else if(p.type==="b") trace(board,r,c,p.color,BISHOP_DIRS,7,attacks[p.color],mobility);
    else if(p.type==="r") trace(board,r,c,p.color,ROOK_DIRS,7,attacks[p.color],mobility);
    else if(p.type==="q") trace(board,r,c,p.color,QUEEN_DIRS,7,attacks[p.color],mobility);
  }
  return {attacks,mobility};
}

function isPassedPawn(color,pawn,enemyPawns) {
  const dir=color==="w"?-1:1;
  return !enemyPawns.some(ep =>
    Math.abs(ep.c-pawn.c)<=1 &&
    (dir===-1 ? ep.r<pawn.r : ep.r>pawn.r)
  );
}

function isPawnSupported(color,pawn,ownPawns) {
  const behind=color==="w"?1:-1;
  return ownPawns.some(p => Math.abs(p.c-pawn.c)===1 && p.r===pawn.r+behind);
}

function evaluateHceV7(game) {
  const board=game.board();
  const pawns={w:[],b:[]};
  const fileCount={w:Array(8).fill(0),b:Array(8).fill(0)};
  const bishops={w:[],b:[]};
  const kings={w:null,b:null};
  let nonPawnMaterial=0;
  let material={w:0,b:0};
  let score=0;

  for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
    const p=board[r][c]; if(!p) continue;
    material[p.color]+=VALUE[p.type]||0;
    if(p.type==="p") { pawns[p.color].push({r,c}); fileCount[p.color][c]++; }
    if(p.type==="b") bishops[p.color].push({r,c});
    if(p.type==="k") kings[p.color]={r,c};
    if(p.type!=="p" && p.type!=="k") nonPawnMaterial+=VALUE[p.type]||0;
  }

  const endgame=nonPawnMaterial<=2500;
  const {attacks,mobility}=attacksAndMobility(board);
  const centerSquares=[[3,3],[3,4],[4,3],[4,4]];
  const center={w:0,b:0};
  for(const color of ["w","b"]) {
    for(const [r,c] of centerSquares) center[color]+=attacks[color][r][c];
  }

  for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
    const p=board[r][c]; if(!p) continue;
    const color=p.color, sign=color==="w"?1:-1, enemy=color==="w"?"b":"w";
    const advance=color==="w"?6-r:r-1;
    const centerDistance=Math.abs(3.5-r)+Math.abs(3.5-c);
    const centrality=7-centerDistance;
    let positional=0;

    if(p.type==="p") {
      positional+=advance*(endgame?11:7)+centrality*2;
      const doubled=fileCount[color][c]-1;
      if(doubled>0) positional-=17*doubled;
      const isolated=!pawns[color].some(q=>Math.abs(q.c-c)===1);
      if(isolated) positional-=15;
      const supported=isPawnSupported(color,{r,c},pawns[color]);
      if(supported) positional+=8;
      if(isPassedPawn(color,{r,c},pawns[enemy])) {
        positional+=14+Math.max(0,advance)*(endgame?11:7);
        const front=r+(color==="w"?-1:1);
        if(inside(front,c) && !board[front][c]) positional+=5;
      }
      // A backward pawn is a soft weakness when its advance square is
      // controlled by an enemy pawn and no friendly pawn can support it.
      const front=r+(color==="w"?-1:1);
      const enemyPawnControls=inside(front,c) && (
        (color==="w" && ((c>0 && board[front-1]?.[c-1]?.type==="p" && board[front-1][c-1].color===enemy) ||
                          (c<7 && board[front-1]?.[c+1]?.type==="p" && board[front-1][c+1].color===enemy))) ||
        (color==="b" && ((c>0 && board[front+1]?.[c-1]?.type==="p" && board[front+1][c-1].color===enemy) ||
                          (c<7 && board[front+1]?.[c+1]?.type==="p" && board[front+1][c+1].color===enemy)))
      );
      if(!supported && enemyPawnControls) positional-=9;
    } else if(p.type==="n") {
      positional+=centrality*12;
      if(r===0 || r===7 || c===0 || c===7) positional-=22;
      if((color==="w" && r<=3) || (color==="b" && r>=4)) {
        if(isPawnSupported(color,{r,c},pawns[color])) positional+=15;
      }
    } else if(p.type==="b") {
      positional+=centrality*7;
      let sameColorPawns=0;
      const squareColor=(r+c)%2;
      for(const pawn of pawns[color]) if((pawn.r+pawn.c)%2===squareColor) sameColorPawns++;
      positional-=sameColorPawns*2;
    } else if(p.type==="r") {
      const ownOnFile=fileCount[color][c], enemyOnFile=fileCount[enemy][c];
      if(ownOnFile===0) positional+=enemyOnFile===0?24:13;
      if((color==="w" && r===1)||(color==="b" && r===6)) positional+=20;
      if(ownOnFile===0 && enemyOnFile===0) positional+=5;
    } else if(p.type==="q") {
      positional+=centrality*3;
      // Avoid early queen adventures that lose tempi without a concrete gain.
      const moveNo=Number(game.fen().split(" ")[5]) || 1;
      if(moveNo<10 && ((color==="w" && (r<6||c!==3))||(color==="b" && (r>1||c!==3)))) positional-=5;
    } else if(p.type==="k") {
      if(endgame) positional+=centrality*10;
      else {
        const castled=(color==="w" && (r===7 && (c===6||c===2))) ||
                      (color==="b" && (r===0 && (c===6||c===2)));
        if(castled) positional+=26;
        const shieldRow=r+(color==="w"?-1:1);
        for(let fc=Math.max(0,c-1);fc<=Math.min(7,c+1);fc++) {
          if(inside(shieldRow,fc) && board[shieldRow][fc]?.type==="p" && board[shieldRow][fc].color===color) positional+=12;
          else positional-=5;
        }
        // Penalise open files adjacent to the king, but less than actual attacks.
        for(let fc=Math.max(0,c-1);fc<=Math.min(7,c+1);fc++) {
          if(fileCount[color][fc]===0) positional-=fileCount[enemy][fc]===0?8:14;
        }
        const ring=KING_STEPS.map(([dr,dc])=>[r+dr,c+dc]).filter(([rr,cc])=>inside(rr,cc));
        let ringPressure=0;
        for(const [rr,cc] of ring) ringPressure+=attacks[enemy][rr][cc];
        positional-=Math.min(70,attacks[enemy][r][c]*18+ringPressure*4);
      }
    }
    score+=sign*positional;
  }

  if(bishops.w.length>=2) score+=34;
  if(bishops.b.length>=2) score-=34;
  score+=(mobility.w-mobility.b)*2;
  score+=(center.w-center.b)*5;

  // Small coordination bonus for connected rooks and supported central minors.
  for(const color of ["w","b"]) {
    const sign=color==="w"?1:-1;
    const rooks=[];
    for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
      const p=board[r][c]; if(p?.type==="r" && p.color===color) rooks.push({r,c});
    }
    if(rooks.length>=2) {
      const [a,b]=rooks;
      if(a.r===b.r || a.c===b.c) {
        let clear=true;
        const dr=Math.sign(b.r-a.r),dc=Math.sign(b.c-a.c);
        let rr=a.r+dr,cc=a.c+dc;
        while(rr!==b.r || cc!==b.c) {
          if(board[rr][cc]) { clear=false; break; }
          rr+=dr;cc+=dc;
        }
        if(clear) score+=sign*14;
      }
    }
  }

  // Preserve the engine's side-to-move convention.
  return game.turn()==="w"?Math.round(score):Math.round(-score);
}

export { evaluateHceV7 };
