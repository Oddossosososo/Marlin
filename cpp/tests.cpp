#include "attacks.hpp"
#include <cassert>
#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <iostream>

#undef assert
#define assert(expression) do { \
    if (!(expression)) { \
        std::cerr << "Assertion failed: " #expression << " at line " << __LINE__ << "\\n"; \
        std::exit(EXIT_FAILURE); \
    } \
} while (false)

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
        (1ULL << 26) | (1ULL << 28) |
        (1ULL << 34) | (1ULL << 35) | (1ULL << 36);
    assert(marlin_king_attacks(d4) == king_d4);
    assert(marlin_king_attacks(1ULL) ==
           ((1ULL << 1) | (1ULL << 8) | (1ULL << 9)));

    assert(marlin_white_pawn_attacks(e4) ==
           ((1ULL << 35) | (1ULL << 37)));
    assert(marlin_black_pawn_attacks(1ULL << 36) ==
           ((1ULL << 27) | (1ULL << 29)));
    assert(marlin_white_pawn_attacks(1ULL << 8) == (1ULL << 17));
    assert(marlin_black_pawn_attacks(1ULL << 48) == (1ULL << 41));

    const char* start =
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    assert(marlin_cpp_perft(start, 1) == 20);
    assert(marlin_cpp_perft(start, 2) == 400);
    assert(marlin_cpp_perft(start, 3) == 8902);

    const char* kiwipete =
        "r3k2r/p1ppqpb1/bn2pnp1/2pP4/1p2P3/2N2N2/PPQBBPPP/R3K2R w KQkq - 0 1";
    assert(marlin_cpp_perft(kiwipete, 1) == 48);
    assert(marlin_cpp_perft(kiwipete, 2) == 2039);
    assert(marlin_cpp_perft(kiwipete, 3) == 97862);

    const char* enPassant =
        "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1";
    assert(marlin_cpp_perft(enPassant, 1) == 14);
    assert(marlin_cpp_perft(enPassant, 2) == 191);
    assert(marlin_cpp_perft(enPassant, 3) == 2812);

    char result[256]{};
    (void)marlin_cpp_search(start, 2, result, sizeof(result));
    assert(std::strncmp(result, "bestmove ", 9) == 0);

    std::cout << "MARLIN C++ attacks, perft and search tests passed\\n";
}
