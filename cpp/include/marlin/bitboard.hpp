#pragma once

#include <cstdint>

namespace marlin {

using Bitboard = std::uint64_t;

enum class Color : std::uint8_t { White = 0, Black = 1 };

enum class Square : std::uint8_t {
    A1, B1, C1, D1, E1, F1, G1, H1,
    A2, B2, C2, D2, E2, F2, G2, H2,
    A3, B3, C3, D3, E3, F3, G3, H3,
    A4, B4, C4, D4, E4, F4, G4, H4,
    A5, B5, C5, D5, E5, F5, G5, H5,
    A6, B6, C6, D6, E6, F6, G6, H6,
    A7, B7, C7, D7, E7, F7, G7, H7,
    A8, B8, C8, D8, E8, F8, G8, H8,
    None = 64
};

constexpr Bitboard bit(Square square) noexcept {
    return square == Square::None ? 0ULL : (1ULL << static_cast<unsigned>(square));
}

constexpr int file_of(Square square) noexcept {
    return static_cast<int>(square) & 7;
}

constexpr int rank_of(Square square) noexcept {
    return static_cast<int>(square) >> 3;
}

int popcount(Bitboard board) noexcept;
Square pop_lsb(Bitboard& board) noexcept;

Bitboard pawn_attacks(Color color, Square square) noexcept;
Bitboard knight_attacks(Square square) noexcept;
Bitboard king_attacks(Square square) noexcept;
Bitboard rook_attacks(Square square, Bitboard blockers) noexcept;
Bitboard bishop_attacks(Square square, Bitboard blockers) noexcept;
inline Bitboard queen_attacks(Square square, Bitboard blockers) noexcept {
    return rook_attacks(square, blockers) | bishop_attacks(square, blockers);
}

} // namespace marlin
