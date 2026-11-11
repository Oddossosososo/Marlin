#include "marlin/search.hpp"
#include <cstdlib>
#include <iostream>
using namespace marlin;
int main(){
  Board b=Board::from_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  auto r=search_best_move(b,4);
  if(r.depth!=4||!r.nodes){std::cerr<<"FAIL search did not complete depth 4\n";return 1;}
  bool found=false;
  for(const auto&m:b.legal_moves())if(m.from==r.best.from&&m.to==r.best.to&&m.promotion==r.best.promotion)found=true;
  if(!found){std::cerr<<"FAIL search returned illegal move\n";return 1;}
  const auto nps=r.elapsed_ms? r.nodes*1000/static_cast<std::uint64_t>(r.elapsed_ms):r.nodes;
  std::cout<<"PASS C++ alpha-beta search depth "<<r.depth<<" nodes "<<r.nodes<<"\n";
  std::cout<<"BENCHMARK C++ startpos: "<<nps<<" nodes/sec | "<<r.elapsed_ms<<" ms\n";
  std::cout<<"All MARLIN C++ search tests passed.\n";
}
