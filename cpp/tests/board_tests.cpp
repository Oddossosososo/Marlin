#include "marlin/board.hpp"
#include <cstdlib>
#include <iostream>
using namespace marlin;
void check(const char* label,std::uint64_t got,std::uint64_t want){if(got!=want){std::cerr<<"FAIL "<<label<<" got "<<got<<" expected "<<want<<"\n";std::exit(1);}std::cout<<"PASS "<<label<<"\n";}
int main(){
  Board start=Board::from_fen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  check("start perft 1",perft(start,1),20);check("start perft 2",perft(start,2),400);check("start perft 3",perft(start,3),8902);check("start perft 4",perft(start,4),197281);
  check("FEN round trip",Board::from_fen(start.fen()).fen()==start.fen(),true);
  Board kiwi=Board::from_fen("r3k2r/p1ppqpb1/bn2pnp1/2pP4/1p2P3/2N2N2/PPQBBPPP/R3K2R w KQkq - 0 1");
  check("Kiwipete perft 1",perft(kiwi,1),48);check("Kiwipete perft 2",perft(kiwi,2),2039);check("Kiwipete perft 3",perft(kiwi,3),97862);
  std::cout<<"All MARLIN C++ board tests passed.\n";
}
