#include "marlin/board.hpp"
#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <sstream>
#include <stdexcept>

namespace marlin {
namespace {
constexpr int file(int s){return s&7;} constexpr int rank(int s){return s>>3;}
constexpr bool inside(int f,int r){return f>=0&&f<8&&r>=0&&r<8;}
int piece_from(char c){
    const int t=std::tolower(static_cast<unsigned char>(c))=='p'?Pawn:
      std::tolower(static_cast<unsigned char>(c))=='n'?Knight:
      std::tolower(static_cast<unsigned char>(c))=='b'?Bishop:
      std::tolower(static_cast<unsigned char>(c))=='r'?Rook:
      std::tolower(static_cast<unsigned char>(c))=='q'?Queen:
      std::tolower(static_cast<unsigned char>(c))=='k'?King:Empty;
    return std::isupper(static_cast<unsigned char>(c))?t:-t;
}
char piece_char(int p){
    constexpr char chars[]=" pnbrqk";
    char c=chars[std::abs(p)]; return p>0?c:static_cast<char>(std::toupper(c));
}
Side opposite(Side s){return s==Side::White?Side::Black:Side::White;}
}
Board Board::from_fen(const std::string& text){
    Board b; std::istringstream in(text); std::string placement,turn,rights,eps;
    if(!(in>>placement>>turn>>rights>>eps)) throw std::invalid_argument("FEN requires at least four fields");
    int r=7,f=0;
    for(char c:placement){
        if(c=='/'){if(f!=8)throw std::invalid_argument("Invalid FEN rank");--r;f=0;}
        else if(c>='1'&&c<='8') f+=c-'0';
        else {if(r<0||f>=8)throw std::invalid_argument("Invalid FEN placement");int p=piece_from(c);if(!p)throw std::invalid_argument("Invalid FEN piece");b.squares[r*8+f]=static_cast<std::int8_t>(p);if(p==King)b.white_king=static_cast<std::uint8_t>(r*8+f);if(p==-King)b.black_king=static_cast<std::uint8_t>(r*8+f);++f;}
    }
    if(r!=0||f!=8)throw std::invalid_argument("Invalid FEN board");
    if(turn!="w"&&turn!="b")throw std::invalid_argument("Invalid FEN active color");
    b.side=turn=="w"?Side::White:Side::Black;b.castling=0;
    if(rights!="-"){if(rights.find('K')!=std::string::npos)b.castling|=1;if(rights.find('Q')!=std::string::npos)b.castling|=2;if(rights.find('k')!=std::string::npos)b.castling|=4;if(rights.find('q')!=std::string::npos)b.castling|=8;}
    b.ep=eps=="-"?64:static_cast<std::uint8_t>((eps[1]-'1')*8+(eps[0]-'a'));
    std::string n;if(in>>n)b.halfmove=static_cast<std::uint16_t>(std::stoi(n));if(in>>n)b.fullmove=static_cast<std::uint16_t>(std::stoi(n));
    return b;
}
std::string Board::fen() const{
    std::string out;
    for(int r=7;r>=0;--r){int empty=0;for(int f=0;f<8;++f){int p=squares[r*8+f];if(!p)++empty;else{if(empty){out+=char('0'+empty);empty=0;}out+=piece_char(p);}}if(empty)out+=char('0'+empty);if(r)out+='/';}
    out+=side==Side::White?" w ":" b ";if(!castling)out+="-";else{if(castling&1)out+='K';if(castling&2)out+='Q';if(castling&4)out+='k';if(castling&8)out+='q';}
    out+=' ';if(ep==64)out+='-';else{out+=char('a'+file(ep));out+=char('1'+rank(ep));}
    out+=' '+std::to_string(halfmove)+' '+std::to_string(fullmove);return out;
}
bool Board::attacked(int target,Side by) const noexcept{
    const int sign=by==Side::White?1:-1;
    for(int s=0;s<64;++s){int p=squares[s];if(!p||((p>0)!=(sign>0)))continue;int df=file(target)-file(s),dr=rank(target)-rank(s),a=std::abs(df),z=std::abs(dr),t=std::abs(p);
      if(t==Pawn&&z==1&&a==1&&dr==sign)return true;
      if(t==Knight&&((a==1&&z==2)||(a==2&&z==1)))return true;
      if(t==King&&a<=1&&z<=1)return true;
      if((t==Bishop||t==Queen)&&a==z&&a>0){int sf=(df>0)-(df<0),sr=(dr>0)-(dr<0),x=file(s)+sf,y=rank(s)+sr;bool clear=true;while(x!=file(target)||y!=rank(target)){if(squares[y*8+x]){clear=false;break;}x+=sf;y+=sr;}if(clear)return true;}
      if((t==Rook||t==Queen)&&((df==0) != (dr==0))){int sf=(df>0)-(df<0),sr=(dr>0)-(dr<0),x=file(s)+sf,y=rank(s)+sr;bool clear=true;while(x!=file(target)||y!=rank(target)){if(squares[y*8+x]){clear=false;break;}x+=sf;y+=sr;}if(clear)return true;}
    }return false;
}
bool Board::in_check(Side who) const noexcept{return attacked(who==Side::White?white_king:black_king,opposite(who));}
void Board::make(const Move& m,Undo& u){
    int moving=squares[m.from],captured=m.en_passant?squares[m.to+(side==Side::White?-8:8)]:squares[m.to];
    u={static_cast<std::int8_t>(captured),castling,ep,halfmove,fullmove,white_king,black_king};
    squares[m.from]=0;
    if(m.en_passant)squares[m.to+(side==Side::White?-8:8)]=0;
    squares[m.to]=static_cast<std::int8_t>(m.promotion?(side==Side::White?m.promotion:-m.promotion):moving);
    if(std::abs(moving)==King){if(side==Side::White)white_king=m.to;else black_king=m.to;castling&=side==Side::White?12:3;
      if(m.castle){int rook_from=m.to>m.from?m.from+3:m.from-4;int rook_to=m.to>m.from?m.from+1:m.from-1;squares[rook_to]=squares[rook_from];squares[rook_from]=0;}}
    if(std::abs(moving)==Rook){if(m.from==0)castling&=~2;if(m.from==7)castling&=~1;if(m.from==56)castling&=~8;if(m.from==63)castling&=~4;}
    if(std::abs(captured)==Rook){if(m.to==0)castling&=~2;if(m.to==7)castling&=~1;if(m.to==56)castling&=~8;if(m.to==63)castling&=~4;}
    ep=64;if(std::abs(moving)==Pawn&&std::abs(int(m.to)-int(m.from))==16)ep=static_cast<std::uint8_t>((m.to+m.from)/2);
    halfmove=(std::abs(moving)==Pawn||captured)?0:static_cast<std::uint16_t>(halfmove+1);
    if(side==Side::Black)++fullmove;side=opposite(side);
}
void Board::unmake(const Move& m,const Undo& u) noexcept{
    side=opposite(side);int moving=squares[m.to];if(m.promotion)moving=side==Side::White?Pawn:-Pawn;
    squares[m.from]=static_cast<std::int8_t>(moving);squares[m.to]=m.en_passant?0:u.captured;
    if(m.en_passant)squares[m.to+(side==Side::White?-8:8)]=u.captured;
    if(m.castle){int rook_from=m.to>m.from?m.from+3:m.from-4;int rook_to=m.to>m.from?m.from+1:m.from-1;squares[rook_from]=squares[rook_to];squares[rook_to]=0;}
    castling=u.castling;ep=u.ep;halfmove=u.halfmove;fullmove=u.fullmove;white_king=u.white_king;black_king=u.black_king;
}
std::vector<Move> Board::pseudo_moves() const{
    std::vector<Move> out;out.reserve(64);const int sign=side==Side::White?1:-1;
    auto add=[&](int from,int to,bool epm=false,bool castle=false){if(squares[to]&&((squares[to]>0)==(sign>0)))return;if(std::abs(squares[to])==King)return;
      if(std::abs(squares[from])==Pawn&&(rank(to)==0||rank(to)==7)){for(int p:{Queen,Rook,Bishop,Knight})out.push_back({static_cast<std::uint8_t>(from),static_cast<std::uint8_t>(to),static_cast<std::int8_t>(p),epm,castle});}
      else out.push_back({static_cast<std::uint8_t>(from),static_cast<std::uint8_t>(to),0,epm,castle});};
    for(int s=0;s<64;++s){int p=squares[s];if(!p||((p>0)!=(sign>0)))continue;int t=std::abs(p),f=file(s),r=rank(s);
      if(t==Pawn){int nr=r+sign;if(inside(f,nr)&&!squares[nr*8+f]){add(s,nr*8+f);int home=side==Side::White?1:6;if(r==home&&!squares[(nr+sign)*8+f])add(s,(nr+sign)*8+f);}
        for(int df:{-1,1})if(inside(f+df,nr)){int to=nr*8+f+df;if(squares[to]&&((squares[to]>0)!=(sign>0)))add(s,to);else if(to==ep)add(s,to,true);}continue;}
      const int dirs[8][2]={{1,0},{-1,0},{0,1},{0,-1},{1,1},{1,-1},{-1,1},{-1,-1}};
      for(int d=0;d<8;++d){bool orth=d<4,diag=d>=4;if((t==Knight||t==King)||(t==Bishop&&diag)||(t==Rook&&orth)||(t==Queen)){
        if(t==Knight){const int k[8][2]={{1,2},{2,1},{2,-1},{1,-2},{-1,-2},{-2,-1},{-2,1},{-1,2}};for(auto &v:k)if(inside(f+v[0],r+v[1]))add(s,(r+v[1])*8+f+v[0]);break;}
        int max=t==King?1:7;for(int n=1;n<=max;++n){int nf=f+dirs[d][0]*n,nr=r+dirs[d][1]*n;if(!inside(nf,nr))break;int to=nr*8+nf;if(squares[to]&&((squares[to]>0)==(sign>0)))break;add(s,to);if(squares[to])break;}
      }}
      if(t==King&&!in_check(side)){int base=side==Side::White?0:56;int kbit=side==Side::White?1:4,qbit=side==Side::White?2:8;
        if(s==base+4&&(castling&kbit)&&squares[base+5]==0&&squares[base+6]==0&&squares[base+7]==sign*Rook&&!attacked(base+5,opposite(side))&&!attacked(base+6,opposite(side)))add(s,base+6,false,true);
        if(s==base+4&&(castling&qbit)&&squares[base+1]==0&&squares[base+2]==0&&squares[base+3]==0&&squares[base]==sign*Rook&&!attacked(base+3,opposite(side))&&!attacked(base+2,opposite(side)))add(s,base+2,false,true);
      }
    }return out;
}
std::vector<Move> Board::legal_moves(){auto candidates=pseudo_moves();std::vector<Move> out;out.reserve(candidates.size());Side mover=side;for(const auto&m:candidates){Undo u;make(m,u);bool legal=!in_check(mover);unmake(m,u);if(legal)out.push_back(m);}return out;}
std::uint64_t perft(Board& b,int depth){if(depth==0)return 1;auto moves=b.legal_moves();std::uint64_t nodes=0;for(const auto&m:moves){Undo u;b.make(m,u);nodes+=perft(b,depth-1);b.unmake(m,u);}return nodes;}
}
