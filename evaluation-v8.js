// MARLIN V8 hand-crafted positional evaluation.
// Scores are centipawns from the side-to-move perspective. Structural weaknesses
// remain soft penalties so concrete tactics can always take priority.
const VALUE = { p:100, n:320, b:335, r:500, q:900, k:20000 };
const KNIGHT_STEPS = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const KING_STEPS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const BISHOP_DIRS = [[-1,-1],[-1,1],[1,-1],[1,1]];
const ROOK_DIRS = [[-1,0],[1,0],[0,-1],[0,1]];
const QUEEN_DIRS = [...BISHOP_DIRS,...ROOK_DIRS];
const CENTER_SQUARES = [27,28,35,36];
const inside = (r,c) => r>=0 && r<8 && c>=0 && c<8;

function addAttack(map,r,c) {
  if(inside(r,c)) map[r*8+c]++;
}

function pawnAttacks(board,r,c,color,map,mobility) {
  const dir=color==="w"?-1:1;
  for(const dc of [-1,1]) {
    const nr=r+dir,nc=c+dc;
    if(inside(nr,nc)) {
      addAttack(map,nr,nc);
      if(board[nr][nc] && board[nr][nc].color!==color) mobility[color]++;
    }
  }
  const one=r+dir,two=r+2*dir;
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
  // Flat typed arrays are substantially cheaper than 16 nested attack-map rows
  // allocated at every leaf evaluation.
  const attacks={w:new Uint8Array(64),b:new Uint8Array(64)};
  const mobility={w:0,b:0};
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
    const p=board[r][c];
    if(!p) continue;
    const map=attacks[p.color];
    if(p.type==="p") pawnAttacks(board,r,c,p.color,map,mobility);
    else if(p.type==="n") trace(board,r,c,p.color,KNIGHT_STEPS,1,map,mobility);
    else if(p.type==="k") trace(board,r,c,p.color,KING_STEPS,1,map,mobility);
    else if(p.type==="b") trace(board,r,c,p.color,BISHOP_DIRS,7,map,mobility);
    else if(p.type==="r") trace(board,r,c,p.color,ROOK_DIRS,7,map,mobility);
    else if(p.type==="q") trace(board,r,c,p.color,QUEEN_DIRS,7,map,mobility);
  }
  return {attacks,mobility};
}

function isPassedPawn(color,pawnSquare,enemyPawns) {
  const r=pawnSquare>>>3,c=pawnSquare&7;
  const white=color==="w";
  for(let i=0;i<enemyPawns.length;i++) {
    const enemySquare=enemyPawns[i];
    const er=enemySquare>>>3,ec=enemySquare&7;
    if(Math.abs(ec-c)<=1 && (white?er<r:er>r)) return false;
  }
  return true;
}

function isPawnSupported(color,pawnSquare,ownPawns) {
  const r=pawnSquare>>>3,c=pawnSquare&7;
  const behind=color==="w"?1:-1;
  for(let i=0;i<ownPawns.length;i++) {
    const ownSquare=ownPawns[i];
    const ownR=ownSquare>>>3,ownC=ownSquare&7;
    if(Math.abs(ownC-c)===1 && ownR===r+behind) return true;
  }
  return false;
}

function evaluateHceV8(game) {
  const board=game.board();
  const pawns={w:[],b:[]};
  const fileCount={w:new Uint8Array(8),b:new Uint8Array(8)};
  const bishopCount={w:0,b:0};
  const kings={w:-1,b:-1};
  const rooks={w:[],b:[]};
  let nonPawnMaterial=0;
  let whiteMaterial=0;
  let blackMaterial=0;
  let score=0;

  for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
    const p=board[r][c];
    if(!p) continue;
    const square=r*8+c;
    const value=VALUE[p.type]||0;
    if(p.color==="w") whiteMaterial+=value;
    else blackMaterial+=value;
    if(p.type==="p") {
      pawns[p.color].push(square);
      fileCount[p.color][c]++;
    }
    if(p.type==="b") bishopCount[p.color]++;
    if(p.type==="k") kings[p.color]=square;
    if(p.type==="r") rooks[p.color].push(square);
    if(p.type!=="p" && p.type!=="k") nonPawnMaterial+=value;
  }

  const endgame=nonPawnMaterial<=2500;
  const {attacks,mobility}=attacksAndMobility(board);
  const center={w:0,b:0};
  for(let i=0;i<CENTER_SQUARES.length;i++) {
    const square=CENTER_SQUARES[i];
    center.w+=attacks.w[square];
    center.b+=attacks.b[square];
  }

  let moveNo=0;
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
    const p=board[r][c];
    if(!p) continue;
    const color=p.color,sign=color==="w"?1:-1,enemy=color==="w"?"b":"w";
    const square=r*8+c;
    const advance=color==="w"?6-r:r-1;
    const centerDistance=Math.abs(3.5-r)+Math.abs(3.5-c);
    const centrality=7-centerDistance;
    let positional=0;

    if(p.type==="p") {
      positional+=advance*(endgame?11:7)+centrality*2;
      const doubled=fileCount[color][c]-1;
      if(doubled>0) positional-=17*doubled;
      const supported=isPawnSupported(color,square,pawns[color]);
      if(!pawns[color].some(q=>Math.abs((q&7)-c)===1)) positional-=15;
      if(supported) positional+=8;
      if(isPassedPawn(color,square,pawns[enemy])) {
        positional+=14+Math.max(0,advance)*(endgame?11:7);
        const front=r+(color==="w"?-1:1);
        if(inside(front,c) && !board[front][c]) positional+=5;
      }
      // A backward pawn is a soft weakness when enemy pawns control its
      // advance square and no friendly pawn can support it.
      const front=r+(color==="w"?-1:1);
      let enemyPawnControls=false;
      if(inside(front,c)) {
        const controlRow=color==="w"?front-1:front+1;
        for(let dc=-1;dc<=1;dc+=2) {
          const controlCol=c+dc;
          if(controlCol<0||controlCol>7) continue;
          const controller=board[controlRow]?.[controlCol];
          if(controller?.type==="p" && controller.color===enemy) {
            enemyPawnControls=true;
            break;
          }
        }
      }
      if(!supported && enemyPawnControls) positional-=9;
    } else if(p.type==="n") {
      positional+=centrality*12;
      if(r===0||r===7||c===0||c===7) positional-=22;
      if((color==="w"&&r<=3)||(color==="b"&&r>=4)) {
        if(isPawnSupported(color,square,pawns[color])) positional+=15;
      }
    } else if(p.type==="b") {
      positional+=centrality*7;
      const squareColor=(r+c)%2;
      let sameColorPawns=0;
      for(let i=0;i<pawns[color].length;i++) {
        const pawn=pawns[color][i];
        if((((pawn>>>3)+(pawn&7))%2)===squareColor) sameColorPawns++;
      }
      positional-=sameColorPawns*2;
    } else if(p.type==="r") {
      const ownOnFile=fileCount[color][c],enemyOnFile=fileCount[enemy][c];
      if(ownOnFile===0) positional+=enemyOnFile===0?24:13;
      if((color==="w"&&r===1)||(color==="b"&&r===6)) positional+=20;
      if(ownOnFile===0&&enemyOnFile===0) positional+=5;
    } else if(p.type==="q") {
      positional+=centrality*3;
      // Compute the full-move number at most once per evaluation.
      if(!moveNo) moveNo=Number(game.fen().split(" ")[5])||1;
      if(moveNo<10 && ((color==="w"&&(r<6||c!==3))||(color==="b"&&(r>1||c!==3)))) positional-=5;
    } else if(p.type==="k") {
      if(endgame) positional+=centrality*10;
      else {
        const castled=(color==="w"&&(r===7&&(c===6||c===2)))||
                      (color==="b"&&(r===0&&(c===6||c===2)));
        if(castled) positional+=26;
        const shieldRow=r+(color==="w"?-1:1);
        for(let fc=Math.max(0,c-1);fc<=Math.min(7,c+1);fc++) {
          const shield=inside(shieldRow,fc)?board[shieldRow][fc]:null;
          if(shield?.type==="p"&&shield.color===color) positional+=12;
          else positional-=5;
        }
        for(let fc=Math.max(0,c-1);fc<=Math.min(7,c+1);fc++) {
          if(fileCount[color][fc]===0) positional-=fileCount[enemy][fc]===0?8:14;
        }
        let ringPressure=0;
        for(const [dr,dc] of KING_STEPS) {
          const rr=r+dr,cc=c+dc;
          if(inside(rr,cc)) ringPressure+=attacks[enemy][rr*8+cc];
        }
        positional-=Math.min(70,attacks[enemy][square]*18+ringPressure*4);
      }
    }
    score+=sign*positional;
  }

  // Explicit white-minus-black material is always part of the evaluation.
  score+=whiteMaterial-blackMaterial;
  if(bishopCount.w>=2) score+=34;
  if(bishopCount.b>=2) score-=34;
  score+=(mobility.w-mobility.b)*2;
  score+=(center.w-center.b)*5;

  // Small bonus for connected rooks on a clear rank/file.
  for(const color of ["w","b"]) {
    const ownRooks=rooks[color];
    if(ownRooks.length<2) continue;
    const a=ownRooks[0],b=ownRooks[1];
    const ar=a>>>3,ac=a&7,br=b>>>3,bc=b&7;
    if(ar===br||ac===bc) {
      const dr=Math.sign(br-ar),dc=Math.sign(bc-ac);
      let rr=ar+dr,cc=ac+dc,clear=true;
      while(rr!==br||cc!==bc) {
        if(board[rr][cc]) { clear=false; break; }
        rr+=dr;cc+=dc;
      }
      if(clear) score+=color==="w"?14:-14;
    }
  }

  return game.turn()==="w"?Math.round(score):Math.round(-score);
}

export { evaluateHceV8 };
