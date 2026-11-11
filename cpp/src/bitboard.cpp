#include "marlin/bitboard.hpp"

namespace marlin {
namespace {

constexpr bool on_board(int file, int rank) noexcept {
    return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

Bitboard leaper_attacks(Square square, const int offsets[][2], int count) noexcept {
    if (square == Square::None) return 0ULL;

    Bitboard attacks = 0ULL;
    const int file = file_of(square);
    const int rank = rank_of(square);

    for (int i = 0; i < count; ++i) {
        const int target_file = file + offsets[i][0];
        const int target_rank = rank + offsets[i][1];
        if (on_board(target_file, target_rank)) {
            attacks |= 1ULL << (target_rank * 8 + target_file);
        }
    }
    return attacks;
}

Bitboard sliding_attacks(Square square, Bitboard blockers,
                         const int directions[][2], int count) noexcept {
    if (square == Square::None) return 0ULL;

    Bitboard attacks = 0ULL;
    const int file = file_of(square);
    const int rank = rank_of(square);

    for (int i = 0; i < count; ++i) {
        int target_file = file + directions[i][0];
        int target_rank = rank + directions[i][1];

        while (on_board(target_file, target_rank)) {
            const Bitboard target = 1ULL << (target_rank * 8 + target_file);
            attacks |= target;
            if ((blockers & target) != 0ULL) break;
            target_file += directions[i][0];
            target_rank += directions[i][1];
        }
    }
    return attacks;
}

} // namespace

int popcount(Bitboard board) noexcept {
    return __builtin_popcountll(board);
}

Square pop_lsb(Bitboard& board) noexcept {
    if (board == 0ULL) return Square::None;
    const auto index = static_cast<unsigned>(__builtin_ctzll(board));
    board &= board - 1ULL;
    return static_cast<Square>(index);
}

Bitboard pawn_attacks(Color color, Square square) noexcept {
    constexpr int white[][2] = {{-1, 1}, {1, 1}};
    constexpr int black[][2] = {{-1, -1}, {1, -1}};
    return color == Color::White
        ? leaper_attacks(square, white, 2)
        : leaper_attacks(square, black, 2);
}

Bitboard knight_attacks(Square square) noexcept {
    constexpr int offsets[][2] = {
        {-2, -1}, {-2, 1}, {-1, -2}, {-1, 2},
        {1, -2}, {1, 2}, {2, -1}, {2, 1}
    };
    return leaper_attacks(square, offsets, 8);
}

Bitboard king_attacks(Square square) noexcept {
    constexpr int offsets[][2] = {
        {-1, -1}, {-1, 0}, {-1, 1}, {0, -1},
        {0, 1}, {1, -1}, {1, 0}, {1, 1}
    };
    return leaper_attacks(square, offsets, 8);
}

Bitboard rook_attacks(Square square, Bitboard blockers) noexcept {
    constexpr int directions[][2] = {{-1, 0}, {1, 0}, {0, -1}, {0, 1}};
    return sliding_attacks(square, blockers, directions, 4);
}

Bitboard bishop_attacks(Square square, Bitboard blockers) noexcept {
    constexpr int directions[][2] = {{-1, -1}, {-1, 1}, {1, -1}, {1, 1}};
    return sliding_attacks(square, blockers, directions, 4);
}

} // namespace marlin
