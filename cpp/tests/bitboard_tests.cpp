#include "marlin/bitboard.hpp"

#include <cstdlib>
#include <iostream>

using namespace marlin;

namespace {
void expect(const char* name, Bitboard actual, Bitboard expected) {
    if (actual != expected) {
        std::cerr << "FAIL " << name << ": got " << actual
                  << ", expected " << expected << '\n';
        std::exit(1);
    }
    std::cout << "PASS " << name << '\n';
}
}

int main() {
    expect("single square bit", bit(Square::E4), 1ULL << 28);
    expect("knight from b1", knight_attacks(Square::B1),
           bit(Square::A3) | bit(Square::C3) | bit(Square::D2));
    expect("king from e4 has eight targets", king_attacks(Square::E4),
           bit(Square::D3) | bit(Square::E3) | bit(Square::F3) |
           bit(Square::D4) | bit(Square::F4) |
           bit(Square::D5) | bit(Square::E5) | bit(Square::F5));
    expect("white pawn attacks", pawn_attacks(Color::White, Square::E4),
           bit(Square::D5) | bit(Square::F5));
    expect("black pawn attacks", pawn_attacks(Color::Black, Square::E4),
           bit(Square::D3) | bit(Square::F3));
    expect("empty-board rook rays", rook_attacks(Square::D4, 0ULL), 0x08080808F7080808ULL);
    expect("empty-board bishop rays", bishop_attacks(Square::D4, 0ULL), 0x8041221400142241ULL);
    expect("rook stops on blocker", rook_attacks(Square::D4, bit(Square::D6)) & bit(Square::D7), 0ULL);

    Bitboard pieces = bit(Square::A1) | bit(Square::H8) | bit(Square::D4);
    if (popcount(pieces) != 3) return 1;
    if (pop_lsb(pieces) != Square::A1 || popcount(pieces) != 2) return 1;
    if (pop_lsb(pieces) != Square::D4 || pop_lsb(pieces) != Square::H8) return 1;
    if (pop_lsb(pieces) != Square::None) return 1;
    std::cout << "PASS popcount and pop_lsb\n";
    std::cout << "All MARLIN C++ bitboard tests passed.\n";
    return 0;
}
