#pragma once
#include "marlin/board.hpp"
#include <cstdint>
namespace marlin {
struct SearchResult { Move best{}; int score=0; int depth=0; std::uint64_t nodes=0; long long elapsed_ms=0; };
SearchResult search_best_move(Board& board, int max_depth);
std::string move_to_uci(const Move& move);
}
