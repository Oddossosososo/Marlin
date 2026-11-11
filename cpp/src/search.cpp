#include "marlin/search.hpp"
#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cctype>
#include <limits>
#include <vector>

namespace marlin {
namespace {
constexpr int INF=32000, MATE=30000;
constexpr int values[7]={0,100,320,335,500,900,20000};
struct Entry{std::uint64_t key=0;Move move{};std::int16_t score=0;std::int8_t depth=-1;std::uint8_t bound=0;};
constexpr std::size_t TT_SIZE=1U<<20;
std::array<Entry,TT_SIZE> tt{};
std::array<std::array<std::uint64_t,64>,12> zobrist{};
std::uint64_t side_key=0;
std::array<std::uint64_t,16> castle_keys{};
std::array<std::uint64_t,8> ep_keys{};
bool keys_ready=false;
std::uint64_t splitmix(std::uint64_t& x){x+=0x9e3779b97f4a7c15ULL;std::uint64_t z=x;z=(z^(z>>30))*0xbf58476d1ce4e5b9ULL;z=(z^(z>>27))*0x94d049bb133111ebULL;return z^(z>>31);}
void init_keys(){if(keys_ready)return;std::uint64_t seed=0x4d41524c494eULL;for(auto& p:zobrist)for(auto& s:p)s=splitmix(seed);side_key=splitmix(seed);for(auto& k:castle_keys)k=splitmix(seed);for(auto& k:ep_keys)k=splitmix(seed);keys_ready=true;}
std::uint64_t hash(const Board& b){init_keys();std::uint64_t h=castle_keys[b.castling];if(b.side==Side::Black)h^=side_key;if(b.ep<64)h^=ep_keys[b.ep&7];for(int s=0;s<64;++s){int p=b.squares[s];if(p){int idx=(p>0?0:6)+std::abs(p)-1;h^=zobrist[idx][s];}}return h;}
int evaluate(const Board& b){int score=0;for(int s=0;s<64;++s){int p=b.squares[s];if(!p)continue;int t=std::abs(p),sign=p>0?1:-1;int f=s&7,r=s>>3;score+=sign*values[t];int center=7-(std::abs(2*f-7)+std::abs(2*r-7))/2;if(t==Knight)score+=sign*center*5;if(t==Bishop)score+=sign*center*3;if(t==Pawn)score+=sign*(p>0?r:7-r)*7;}return b.side==Side::White?score:-score;}
int move_order(const Move& m,const Board& b,const Move& ttmove,bool has_tt){if(has_tt&&m.from==ttmove.from&&m.to==ttmove.to&&m.promotion==ttmove.promotion)return 2000000;int victim=b.squares[m.to];if(m.en_passant)victim=b.side==Side::White?-Pawn:Pawn;if(victim)return 1000000+values[std::abs(victim)]*10-values[std::abs(b.squares[m.from])];if(m.promotion)return 900000+values[m.promotion];return 0;}
std::uint64_t nodes=0;
int qsearch(Board& b,int alpha,int beta,int ply){++nodes;if(ply>96)return evaluate(b);bool check=b.in_check(b.side);int stand=evaluate(b);if(!check){if(stand>=beta)return beta;if(stand>alpha)alpha=stand;}auto moves=b.legal_moves();if(moves.empty())return check?-MATE+ply:0;std::sort(moves.begin(),moves.end(),[&](const Move&a,const Move&c){return move_order(a,b,Move{},false)>move_order(c,b,Move{},false);});for(const auto&m:moves){if(!check&&!m.promotion&&!m.en_passant&&!b.squares[m.to])continue;Undo u;b.make(m,u);int score=-qsearch(b,-beta,-alpha,ply+1);b.unmake(m,u);if(score>=beta)return beta;if(score>alpha)alpha=score;}return alpha;}
int negamax(Board& b,int depth,int alpha,int beta,int ply){++nodes;if(ply>96)return evaluate(b);if(depth<=0)return qsearch(b,alpha,beta,ply);int original=alpha;auto key=hash(b);Entry& e=tt[key&(TT_SIZE-1)];bool hit=e.depth>=depth&&e.key==key;Move ttmove=e.move;if(hit){int s=e.score;if(e.bound==1)return s;if(e.bound==2&&s>=beta)return s;if(e.bound==3&&s<=alpha)return s;}
bool check=b.in_check(b.side);if(check)++depth;auto moves=b.legal_moves();if(moves.empty())return check?-MATE+ply:0;std::sort(moves.begin(),moves.end(),[&](const Move&a,const Move&c){return move_order(a,b,ttmove,hit)>move_order(c,b,ttmove,hit);});int best=-INF;Move bestmove=moves.front();for(const auto&m:moves){Undo u;b.make(m,u);int score=-negamax(b,depth-1,-beta,-alpha,ply+1);b.unmake(m,u);if(score>best){best=score;bestmove=m;}if(score>alpha)alpha=score;if(alpha>=beta)break;}e.key=key;e.move=bestmove;e.score=static_cast<std::int16_t>(std::clamp(best,-32767,32767));e.depth=static_cast<std::int8_t>(std::min(depth,127));e.bound=best<=original?3:best>=beta?2:1;return best;}
}
std::string move_to_uci(const Move&m){std::string s;s+=char('a'+(m.from&7));s+=char('1'+(m.from>>3));s+=char('a'+(m.to&7));s+=char('1'+(m.to>>3));if(m.promotion){constexpr char p[]=" pnbrqk";s+=p[m.promotion];}return s;}
SearchResult search_best_move(Board& b,int max_depth){nodes=0;SearchResult result;auto start=std::chrono::steady_clock::now();auto moves=b.legal_moves();if(moves.empty())return result;result.best=moves.front();for(int d=1;d<=std::clamp(max_depth,1,64);++d){int best=-INF;Move chosen=result.best;std::sort(moves.begin(),moves.end(),[&](const Move&a,const Move&c){return move_order(a,b,result.best,true)>move_order(c,b,result.best,true);});int alpha=-INF;for(const auto&m:moves){Undo u;b.make(m,u);int score=-negamax(b,d-1,-INF,-alpha,1);b.unmake(m,u);if(score>best){best=score;chosen=m;}if(score>alpha)alpha=score;}result.best=chosen;result.score=best;result.depth=d;}result.nodes=nodes;result.elapsed_ms=std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now()-start).count();return result;}
}
