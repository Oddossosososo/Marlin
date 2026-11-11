#include "marlin/search.hpp"
#include <cstdlib>
#include <iostream>
using namespace marlin;
int main(){Board b=Board::from_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");auto r=search_best_move(b,3);if(r.depth!=3||!r.nodes){std::cerr<<"FAIL search did not complete depth 3\n";return 1;}bool found=false;for(const auto&m:b.legal_moves())if(m.from==r.best.from&&m.to==r.best.to&&m.promotion==r.best.promotion)found=true;if(!found){std::cerr<<"FAIL search returned illegal move\n";return 1;}std::cout<<"PASS C++ alpha-beta search depth "<<r.depth<<" nodes "<<r.nodes<<"\n";std::cout<<"All MARLIN C++ search tests passed.\n";}
