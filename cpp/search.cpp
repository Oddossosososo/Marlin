#include <algorithm>
#include <array>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <cctype>
#include <limits>
#include <string>
#include <vector>

namespace {
constexpr int EMPTY=0, PAWN=1, KNIGHT=2, BISHOP=3, ROOK=4, QUEEN=5, KING=6;
constexpr int INF=32000, MATE=30000, MAX_PLY=96;
constexpr int KNIGHT_OFF[8]={-33,-31,-18,-14,14,18,31,33};
constexpr int KING_OFF[8]={-17,-16,-15,-1,1,15,16,17};
constexpr int BISHOP_OFF[4]={-17,-15,15,17};
constexpr int ROOK_OFF[4]={-16,-1,1,16};
constexpr int QUEEN_OFF[8]={-17,-16,-15,-1,1,15,16,17};
constexpr int VALUE[7]={0,100,320,335,500,900,20000};
constexpr int CASTLE_WK=1, CASTLE_WQ=2, CASTLE_BK=4, CASTLE_BQ=8;

struct Move { int from=-1,to=-1,promo=0,flags=0; };
struct Undo {
    int captured=0,capturedSquare=-1,castle=0,ep=-1,halfmove=0,fullmove=1;
    int whiteKing=-1,blackKing=-1;
};
struct Board {
    std::array<int,128> sq{};
    int side=1,castle=15,ep=-1,halfmove=0,fullmove=1;
    int whiteKing=-1,blackKing=-1;
};
bool valid(int s){return s>=0 && !(s&0x88);}
int fileOf(int s){return s&7;}
int rankOf(int s){return s>>4;}
int sign(int p){return (p>0)-(p<0);}
int absPiece(int p){return p<0?-p:p;}
int parseSquare(const std::string& s){if(s.size()!=2)return -1;int f=s[0]-'a',r=s[1]-'1';return f>=0&&f<8&&r>=0&&r<8?r*16+f:-1;}
std::string squareName(int s){std::string x="a1";x[0]=char('a'+fileOf(s));x[1]=char('1'+rankOf(s));return x;}
int pieceFromChar(char c){
    const std::string names=" pnbrqk";
    size_t p=names.find(char(std::tolower(static_cast<unsigned char>(c))));
    if(p==std::string::npos||p==0)return 0;
    return std::isupper(static_cast<unsigned char>(c))?int(p):-int(p);
}
bool parseFen(const char* input,Board& b){
    if(!input)return false;
    std::string fen(input);size_t pos=0;int rank=7,file=0;
    while(pos<fen.size()&&fen[pos]!=' '){
        char c=fen[pos++];
        if(c=='/'){if(file!=8||rank==0)return false;--rank;file=0;}
        else if(c>='1'&&c<='8')file+=c-'0';
        else {int p=pieceFromChar(c);if(!p||file>=8)return false;b.sq[rank*16+file++]=p;if(absPiece(p)==KING){if(p>0)b.whiteKing=rank*16+file-1;else b.blackKing=rank*16+file-1;}}
        if(file>8)return false;
    }
    if(rank!=0||file!=8||pos>=fen.size())return false;
    while(pos<fen.size()&&fen[pos]==' ')++pos;
    if(pos>=fen.size())return false;b.side=fen[pos++]=='w'?1:-1;
    while(pos<fen.size()&&fen[pos]==' ')++pos;
    b.castle=0;
    if(pos<fen.size()&&fen[pos]!='-'){while(pos<fen.size()&&fen[pos]!=' '){switch(fen[pos++]){case 'K':b.castle|=CASTLE_WK;break;case 'Q':b.castle|=CASTLE_WQ;break;case 'k':b.castle|=CASTLE_BK;break;case 'q':b.castle|=CASTLE_BQ;break;default:return false;}}}else if(pos<fen.size())++pos;
    while(pos<fen.size()&&fen[pos]==' ')++pos;
    if(pos<fen.size()&&fen[pos]!='-'){size_t end=fen.find(' ',pos);b.ep=parseSquare(fen.substr(pos,end-pos));if(b.ep<0)return false;if(end==std::string::npos)return true;pos=end;}else if(pos<fen.size())++pos;
    if(pos<fen.size()){while(pos<fen.size()&&fen[pos]==' ')++pos;if(pos<fen.size()){try{b.halfmove=std::max(0,std::stoi(fen.substr(pos)));}catch(...){return false;}size_t end=fen.find(' ',pos);if(end==std::string::npos)return true;pos=end+1;try{b.fullmove=std::max(1,std::stoi(fen.substr(pos)));}catch(...){return false;}}}
    return b.whiteKing>=0&&b.blackKing>=0;
}
bool attacked(const Board& b,int sq,int by){
    // Pawn attack origins are one rank behind the target for white, ahead for black.
    int pawnRank=sq-(by>0?16:-16);
    for(int df:{-1,1}){int from=pawnRank+df;if(valid(from)&&b.sq[from]==by*PAWN)return true;}
    for(int d:KNIGHT_OFF){int from=sq+d;if(valid(from)&&b.sq[from]==by*KNIGHT)return true;}
    for(int d:KING_OFF){int from=sq+d;if(valid(from)&&b.sq[from]==by*KING)return true;}
    for(int i=0;i<8;i++){
        int d=QUEEN_OFF[i],from=sq+d,steps=1;
        while(valid(from)){
            int p=b.sq[from];
            if(p){if(sign(p)==by){int t=absPiece(p);if(t==QUEEN||(steps==1&&((d==-17||d==-15||d==15||d==17)?t==BISHOP:t==ROOK)))return true;}break;}
            from+=d;++steps;
        }
    }
    return false;
}
bool inCheck(const Board& b,int side){return attacked(b,side>0?b.whiteKing:b.blackKing,-side);}
void addMove(std::vector<Move>& out,int from,int to,int promo=0,int flags=0){out.push_back({from,to,promo,flags});}
void pseudoMoves(const Board& b,std::vector<Move>& out,bool capturesOnly=false){
    out.clear();out.reserve(64);
    for(int from=0;from<128;from++){if(!valid(from)){from+=7;continue;}int p=b.sq[from];if(!p||sign(p)!=b.side)continue;int type=absPiece(p);
        if(type==PAWN){
            int dir=b.side>0?16:-16,one=from+dir,last=b.side>0?7:0;
            if((!capturesOnly||(valid(one)&&rankOf(one)==last))&&valid(one)&&!b.sq[one]){
                if(rankOf(one)==last){for(int pr:{QUEEN,ROOK,BISHOP,KNIGHT})addMove(out,from,one,pr);}
                else {addMove(out,from,one);int two=one+dir;if(rankOf(from)==(b.side>0?1:6)&&!b.sq[two])addMove(out,from,two,0,1);}
            }
            for(int df:{-1,1}){int to=one+df;if(!valid(to))continue;
                if(b.sq[to]&&sign(b.sq[to])==-b.side&&absPiece(b.sq[to])!=KING){if(rankOf(to)==last){for(int pr:{QUEEN,ROOK,BISHOP,KNIGHT})addMove(out,from,to,pr);}else addMove(out,from,to);}
                else if(to==b.ep)addMove(out,from,to,0,2);
            }
        }else if(type==KNIGHT||type==KING){
            const int* offsets=type==KNIGHT?KNIGHT_OFF:KING_OFF;int n=8;
            for(int i=0;i<n;i++){int to=from+offsets[i];if(!valid(to))continue;int target=b.sq[to];if(sign(target)==b.side||absPiece(target)==KING)continue;if(!capturesOnly||target)addMove(out,from,to);}
            if(type==KING&&!capturesOnly&&!inCheck(b,b.side)){
                if(b.side>0&&from==4){
                    if((b.castle&CASTLE_WK)&&b.sq[5]==0&&b.sq[6]==0&&b.sq[7]==ROOK&&!attacked(b,5,-1)&&!attacked(b,6,-1))addMove(out,4,6,0,4);
                    if((b.castle&CASTLE_WQ)&&b.sq[1]==0&&b.sq[2]==0&&b.sq[3]==0&&b.sq[0]==ROOK&&!attacked(b,3,-1)&&!attacked(b,2,-1))addMove(out,4,2,0,4);
                }else if(b.side<0&&from==116){
                    if((b.castle&CASTLE_BK)&&b.sq[117]==0&&b.sq[118]==0&&b.sq[119]==-ROOK&&!attacked(b,117,1)&&!attacked(b,118,1))addMove(out,116,118,0,4);
                    if((b.castle&CASTLE_BQ)&&b.sq[113]==0&&b.sq[114]==0&&b.sq[115]==0&&b.sq[112]==-ROOK&&!attacked(b,115,1)&&!attacked(b,114,1))addMove(out,116,114,0,4);
                }
            }
        }else{
            const int* dirs=type==BISHOP?BISHOP_OFF:type==ROOK?ROOK_OFF:QUEEN_OFF;int n=type==QUEEN?8:4;
            for(int i=0;i<n;i++){int to=from+dirs[i];while(valid(to)){int target=b.sq[to];if(sign(target)==b.side||absPiece(target)==KING)break;if(!capturesOnly||target)addMove(out,from,to);if(target)break;to+=dirs[i];}}
        }
    }
}
Undo makeMove(Board& b,const Move& m){
    Undo u;u.castle=b.castle;u.ep=b.ep;u.halfmove=b.halfmove;u.fullmove=b.fullmove;u.whiteKing=b.whiteKing;u.blackKing=b.blackKing;
    int moving=b.sq[m.from];u.capturedSquare=(m.flags&2)?m.to-(b.side>0?16:-16):m.to;u.captured=b.sq[u.capturedSquare];
    b.sq[m.from]=0;b.sq[u.capturedSquare]=0;b.sq[m.to]=m.promo?b.side*m.promo:moving;
    if(absPiece(moving)==KING){if(b.side>0)b.whiteKing=m.to;else b.blackKing=m.to;
        if(m.flags&4){if(m.to==6){b.sq[5]=ROOK;b.sq[7]=0;}else if(m.to==2){b.sq[3]=ROOK;b.sq[0]=0;}else if(m.to==118){b.sq[117]=-ROOK;b.sq[119]=0;}else if(m.to==114){b.sq[115]=-ROOK;b.sq[112]=0;}}
    }
    if(absPiece(moving)==ROOK){if(m.from==0)b.castle&=~CASTLE_WQ;if(m.from==7)b.castle&=~CASTLE_WK;if(m.from==112)b.castle&=~CASTLE_BQ;if(m.from==119)b.castle&=~CASTLE_BK;}
    if(absPiece(u.captured)==ROOK){if(u.capturedSquare==0)b.castle&=~CASTLE_WQ;if(u.capturedSquare==7)b.castle&=~CASTLE_WK;if(u.capturedSquare==112)b.castle&=~CASTLE_BQ;if(u.capturedSquare==119)b.castle&=~CASTLE_BK;}
    if(absPiece(moving)==KING)b.castle&=b.side>0?~(CASTLE_WK|CASTLE_WQ):~(CASTLE_BK|CASTLE_BQ);
    b.ep=-1;if(m.flags&1)b.ep=m.from+(b.side>0?16:-16);
    b.halfmove=(absPiece(moving)==PAWN||u.captured)?0:b.halfmove+1;if(b.side<0)++b.fullmove;b.side=-b.side;return u;
}
void undoMove(Board& b,const Move& m,const Undo& u){
    b.side=-b.side;if(b.side<0)--b.fullmove;
    int moving=b.sq[m.to];b.sq[m.from]=m.promo?b.side*PAWN:moving;b.sq[m.to]=0;
    b.sq[u.capturedSquare]=u.captured;
    if(m.flags&4){if(m.to==6){b.sq[7]=ROOK;b.sq[5]=0;}else if(m.to==2){b.sq[0]=ROOK;b.sq[3]=0;}else if(m.to==118){b.sq[119]=-ROOK;b.sq[117]=0;}else if(m.to==114){b.sq[112]=-ROOK;b.sq[115]=0;}}
    b.castle=u.castle;b.ep=u.ep;b.halfmove=u.halfmove;b.fullmove=u.fullmove;b.whiteKing=u.whiteKing;b.blackKing=u.blackKing;
}
void legalMoves(Board& b,std::vector<Move>& out,bool capturesOnly=false){
    std::vector<Move> candidates;pseudoMoves(b,candidates,capturesOnly);out.clear();out.reserve(candidates.size());
    for(const Move& m:candidates){Undo u=makeMove(b,m);bool legal=!inCheck(b,-b.side);undoMove(b,m,u);if(legal)out.push_back(m);}
}
bool hasNullMoveMaterial(const Board& b){
    int material=0;
    for(int s=0;s<128;s++){if(!valid(s)){s+=7;continue;}int p=b.sq[s];if(p&&sign(p)==b.side&&absPiece(p)!=PAWN&&absPiece(p)!=KING){material+=VALUE[absPiece(p)];if(material>=VALUE[ROOK])return true;}}
    return false;
}
int evaluate(const Board& b){
    int score=0;
    for(int s=0;s<128;s++){if(!valid(s)){s+=7;continue;}int p=b.sq[s];if(!p)continue;int t=absPiece(p),r=rankOf(s),f=fileOf(s);
        int positional=0;int advance=p>0?r:7-r;int center=7-(std::abs(3-f)+std::abs(3-r));
        if(t==PAWN)positional=advance*7+center*2;
        else if(t==KNIGHT)positional=center*9-((r==0||r==7||f==0||f==7)?18:0);
        else if(t==BISHOP)positional=center*4;
        else if(t==ROOK)positional=advance*2;
        else if(t==KING)positional=center*(b.halfmove>35?7:-2);
        score+=sign(p)*(VALUE[t]+positional);
    }
    return b.side*score;
}
uint64_t hash(const Board& b){
    uint64_t h=1469598103934665603ULL;
    for(int s=0;s<128;s++){if(!valid(s)){s+=7;continue;}h^=uint64_t(b.sq[s]+7)*uint64_t(s+1);h*=1099511628211ULL;}
    h^=uint64_t(b.side+2)*31+uint64_t(b.castle)*131+uint64_t(b.ep+1)*8191+uint64_t(std::min(100,b.halfmove))*65537;return h;
}
struct Entry{uint64_t key=0;int depth=-1,score=0,flag=0;Move move{};};
std::array<Entry,1<<18> tt;
uint64_t nodes=0;
int scoreTT(int s,int ply){if(s>MATE-MAX_PLY)return s-ply;if(s< -MATE+MAX_PLY)return s+ply;return s;}
void order(const Board& b,std::vector<Move>& moves,const Move& ttMove){
    std::stable_sort(moves.begin(),moves.end(),[&](const Move&a,const Move&bmove){
        auto value=[&](const Move&m){if(m.from==ttMove.from&&m.to==ttMove.to&&m.promo==ttMove.promo)return 1000000;int victim=(m.flags&2)?PAWN:absPiece(b.sq[m.to]);int attacker=absPiece(b.sq[m.from]);return (m.promo?800000+VALUE[m.promo]:0)+(victim?100000+VALUE[victim]*10-VALUE[attacker]:0);};
        return value(a)>value(bmove);
    });
}
int qsearch(Board& b,int alpha,int beta,int ply){
    ++nodes;if(ply>=MAX_PLY)return evaluate(b);
    bool check=inCheck(b,b.side);int stand=check?-INF:evaluate(b);
    std::vector<Move> moves;
    legalMoves(b,moves, !check);
    if(moves.empty()){
        if(check)return -MATE+ply;
        // No legal captures is not necessarily stalemate; verify quiet moves.
        legalMoves(b,moves,false);
        if(moves.empty())return 0;
        if(stand>=beta)return beta;
        return std::max(alpha,stand);
    }
    if(!check){if(stand>=beta)return beta;if(stand>alpha)alpha=stand;}
    for(const Move&m:moves){Undo u=makeMove(b,m);int score=-qsearch(b,-beta,-alpha,ply+1);undoMove(b,m,u);if(score>=beta)return beta;if(score>alpha)alpha=score;}
    return alpha;
}
int negamax(Board& b,int depth,int alpha,int beta,int ply,bool allowNull=true){
    ++nodes;if(ply>=MAX_PLY)return evaluate(b);if(depth<=0)return qsearch(b,alpha,beta,ply);
    uint64_t key=hash(b);Entry& e=tt[key&(tt.size()-1)];Move ttMove=e.key==key?e.move:Move{};
    int original=alpha;if(e.key==key&&e.depth>=depth){int s=scoreTT(e.score,ply);if(e.flag==0)return s;if(e.flag==1&&s>=beta)return s;if(e.flag==2&&s<=alpha)return s;}
    std::vector<Move> moves;legalMoves(b,moves,false);
    bool check=inCheck(b,b.side);
    if(moves.empty())return check?-MATE+ply:0;
    if(b.halfmove>=100)return 0;
    // Null-move pruning: a reduced pass search can prove many quiet positions
    // are already above beta, avoiding a large subtree. Disable in check and
    // in pawn-only/minor-only endings where zugzwang is common.
    if(allowNull&&depth>=3&&!check&&beta<MATE-MAX_PLY&&hasNullMoveMaterial(b)){
        int oldSide=b.side,oldEp=b.ep,oldHalfmove=b.halfmove,oldFullmove=b.fullmove;
        b.side=-b.side;b.ep=-1;++b.halfmove;if(oldSide<0)++b.fullmove;
        int reduction=2+depth/4;
        int nullScore=-negamax(b,depth-1-reduction,-beta,-beta+1,ply+1,false);
        b.side=oldSide;b.ep=oldEp;b.halfmove=oldHalfmove;b.fullmove=oldFullmove;
        if(nullScore>=beta)return beta;
    }
    order(b,moves,ttMove);int best=-INF;Move bestMove=moves[0];int index=0;
    for(const Move&m:moves){
        bool quiet=!b.sq[m.to]&&!(m.flags&2)&&!m.promo;
        Undo u=makeMove(b,m);int score;
        if(index==0)score=-negamax(b,depth-1,-beta,-alpha,ply+1);
        else {
            int reduction=(!check&&depth>=3&&index>=3&&quiet)?1+((depth>=6&&index>=8)?1:0):0;
            score=-negamax(b,depth-1-reduction,-alpha-1,-alpha,ply+1);
            if(reduction>0&&score>alpha)score=-negamax(b,depth-1,-alpha-1,-alpha,ply+1);
            if(score>alpha&&score<beta)score=-negamax(b,depth-1,-beta,-alpha,ply+1);
        }
        undoMove(b,m,u);++index;
        if(score>best){best=score;bestMove=m;}if(score>alpha)alpha=score;if(alpha>=beta)break;
    }
    e.key=key;e.depth=depth;e.score=scoreTT(best,ply);e.flag=best<=original?2:best>=beta?1:0;e.move=bestMove;return best;
}
uint64_t perft(Board& b,int depth){
    if(depth==0)return 1;std::vector<Move> moves;legalMoves(b,moves,false);uint64_t total=0;
    for(const Move&m:moves){Undo u=makeMove(b,m);total+=perft(b,depth-1);undoMove(b,m,u);}return total;
}
std::string uci(const Move&m){if(m.from<0)return "0000";std::string s=squareName(m.from)+squareName(m.to);if(m.promo){const char names[]=" pnbrqk";s+=names[m.promo];}return s;}
}

extern "C" int marlin_cpp_list_moves(const char* fen,char* output,int outputSize){
    if(!output||outputSize<2)return -1;Board b;if(!parseFen(fen,b))return -1;
    std::vector<Move> moves;legalMoves(b,moves,false);std::string result;
    for(const Move& m:moves){if(!result.empty())result+=" ";result+=uci(m);}
    std::strncpy(output,result.c_str(),outputSize-1);output[outputSize-1]=0;return int(moves.size());
}
extern "C" int marlin_cpp_perft_divide(const char* fen,char* output,int outputSize){
    if(!output||outputSize<2)return -1;Board b;if(!parseFen(fen,b))return -1;
    std::vector<Move> moves;legalMoves(b,moves,false);std::string result;
    for(const Move& m:moves){Undo u=makeMove(b,m);uint64_t n=perft(b,1);undoMove(b,m,u);if(!result.empty())result+=" ";result+=uci(m)+":"+std::to_string(n);}
    std::strncpy(output,result.c_str(),outputSize-1);output[outputSize-1]=0;return int(moves.size());
}
extern "C" uint64_t marlin_cpp_perft(const char* fen,int depth){
    Board b;if(!parseFen(fen,b)||depth<0||depth>8)return 0;return perft(b,depth);
}
extern "C" int marlin_cpp_search(const char* fen,int maxDepth,char* output,int outputSize){
    if(!output||outputSize<8)return -1;Board b;if(!parseFen(fen,b)){std::strncpy(output,"bestmove 0000",outputSize-1);output[outputSize-1]=0;return -1;}
    std::vector<Move> moves;legalMoves(b,moves,false);if(moves.empty()){std::strncpy(output,"bestmove 0000",outputSize-1);output[outputSize-1]=0;return 0;}
    nodes=0;Move best=moves[0];int bestScore=0;int depthLimit=std::max(1,std::min(12,maxDepth));
    for(int depth=1;depth<=depthLimit;depth++){
        int alpha=-INF,beta=INF,iterationScore=-INF;Move iterationBest=best;
        order(b,moves,best);
        for(const Move&m:moves){Undo u=makeMove(b,m);int score=-negamax(b,depth-1,-beta,-alpha,1);undoMove(b,m,u);if(score>iterationScore){iterationScore=score;iterationBest=m;}if(score>alpha)alpha=score;}
        best=iterationBest;bestScore=iterationScore;
    }
    std::string result="bestmove "+uci(best)+" score "+std::to_string(bestScore)+" depth "+std::to_string(depthLimit)+" nodes "+std::to_string(nodes);
    std::strncpy(output,result.c_str(),outputSize-1);output[outputSize-1]=0;return bestScore;
}
