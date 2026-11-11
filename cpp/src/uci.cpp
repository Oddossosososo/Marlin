#include "marlin/search.hpp"
#include <iostream>
#include <sstream>
#include <string>
#include <vector>
using namespace marlin;
namespace {
Move parse_move(Board& b,const std::string& uci){if(uci.size()<4)return {};int from=(uci[1]-'1')*8+uci[0]-'a',to=(uci[3]-'1')*8+uci[2]-'a';int promo=0;if(uci.size()>4){char c=uci[4];promo=c=='q'?Queen:c=='r'?Rook:c=='b'?Bishop:c=='n'?Knight:0;}for(const auto&m:b.legal_moves())if(m.from==from&&m.to==to&&m.promotion==promo)return m;return {};}
bool apply_uci(Board& b,const std::string& s){Move m=parse_move(b,s);if(m.from==m.to)return false;Undo u;b.make(m,u);return true;}
}
int main(){Board board=Board::from_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");std::string line;while(std::getline(std::cin,line)){std::istringstream in(line);std::string cmd;in>>cmd;if(cmd=="uci"){std::cout<<"id name MARLIN C++\nid author Oddossosososo\nuciok\n"<<std::flush;}else if(cmd=="isready"){std::cout<<"readyok\n"<<std::flush;}else if(cmd=="ucinewgame"){board=Board::from_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");}else if(cmd=="position"){std::string kind;in>>kind;if(kind=="startpos")board=Board::from_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");else if(kind=="fen"){std::string fen,part;for(int i=0;i<6&&in>>part;++i){if(i)fen+=' ';fen+=part;}board=Board::from_fen(fen);}std::string token;while(in>>token)if(token=="moves"){while(in>>token)apply_uci(board,token);break;}}else if(cmd=="go"){int depth=5;std::string token;while(in>>token)if(token=="depth")in>>depth;auto result=search_best_move(board,depth);std::cout<<"info depth "<<result.depth<<" score cp "<<result.score<<" nodes "<<result.nodes<<" time "<<result.elapsed_ms<<" nps "<<(result.elapsed_ms?result.nodes*1000/result.elapsed_ms:result.nodes)<<"\nbestmove "<<move_to_uci(result.best)<<"\n"<<std::flush;}else if(cmd=="quit")break;else if(cmd=="stop"){} }}
