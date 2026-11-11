#include "attacks.hpp"
#include <cassert>
#include <cstdint>
#include <iostream>

int main() {
    constexpr std::uint64_t e4 = 1ULL << 28;
    constexpr std::uint64_t knight_e4 =
        (1ULL << 43) | (1ULL << 45) | (1ULL << 34) | (1ULL << 38) |
        (1ULL << 18) | (1ULL << 22) | (1ULL << 11) | (1ULL << 13);
    assert(marlin_knight_attacks(e4) == knight_e4);
    assert(marlin_knight_attacks(1ULL) == ((1ULL << 10) | (1ULL << 17)));
    assert(marlin_knight_attacks(0) == 0);

    constexpr std::uint64_t d4 = 1ULL << 27;
    constexpr std::uint64_t king_d4 =
        (1ULL << 18) | (1ULL << 19) | (1ULL << 20) |
        (1ULL << 26) |                 (1ULL << 28) |
        (1ULL << 34) | (1ULL << 35) | (1ULL << 36);
    assert(marlin_king_attacks(d4) == king_d4);
    assert(marlin_king_attacks(1ULL) ==
           ((1ULL << 1) | (1ULL << 8) | (1ULL << 9)));

    // White pawn on e4 attacks d5/f5; black pawn on e5 attacks d4/f4.
    assert(marlin_white_pawn_attacks(e4) ==
           ((1ULL << 35) | (1ULL << 37)));
    assert(marlin_black_pawn_attacks(1ULL << 36) ==
           ((1ULL << 27) | (1ULL << 29)));

    // Edge files must not wrap around to the opposite side of the board.
    assert(marlin_white_pawn_attacks(1ULL << 8) == (1ULL << 17));
    assert(marlin_black_pawn_attacks(1ULL << 48) == (1ULL << 41));

    std::cout << "MARLIN C++ bitboard tests passed\n";
}
