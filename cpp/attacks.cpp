#include <cstdint>

// Bitboards use a1 = bit 0, b1 = bit 1, ..., h8 = bit 63.
namespace {
constexpr std::uint64_t FILE_A = 0x0101010101010101ULL;
constexpr std::uint64_t FILE_H = 0x8080808080808080ULL;

std::uint64_t sliding_attacks(std::uint64_t occupied, int square,
                              const int* directions, int direction_count) {
    std::uint64_t attacks = 0;
    const int file = square & 7;
    const int rank = square >> 3;

    for (int i = 0; i < direction_count; ++i) {
        int f = file + directions[i * 2];
        int r = rank + directions[i * 2 + 1];
        while (f >= 0 && f < 8 && r >= 0 && r < 8) {
            const int target = r * 8 + f;
            const std::uint64_t bit = 1ULL << target;
            attacks |= bit;
            if (occupied & bit) break;
            f += directions[i * 2];
            r += directions[i * 2 + 1];
        }
    }
    return attacks;
}
} // namespace

extern "C" std::uint64_t marlin_knight_attacks(std::uint64_t knights) {
    const std::uint64_t not_a = knights & ~FILE_A;
    const std::uint64_t not_ab = knights & ~(FILE_A | (FILE_A << 1));
    const std::uint64_t not_h = knights & ~FILE_H;
    const std::uint64_t not_gh = knights & ~(FILE_H | (FILE_H >> 1));

    return (not_a << 15) | (not_a >> 17)
         | (not_ab << 6) | (not_ab >> 10)
         | (not_h << 17) | (not_h >> 15)
         | (not_gh << 10) | (not_gh >> 6);
}

extern "C" std::uint64_t marlin_king_attacks(std::uint64_t kings) {
    const std::uint64_t not_a = kings & ~FILE_A;
    const std::uint64_t not_h = kings & ~FILE_H;
    return (kings << 8) | (kings >> 8)
         | (not_a << 7) | (not_a >> 9)
         | (not_h << 9) | (not_h >> 7)
         | (not_a << 1) | (not_h >> 1);
}

// White pawn attacks move toward increasing square indices; black toward decreasing.
extern "C" std::uint64_t marlin_white_pawn_attacks(std::uint64_t pawns) {
    return ((pawns & ~FILE_A) << 7) | ((pawns & ~FILE_H) << 9);
}

extern "C" std::uint64_t marlin_black_pawn_attacks(std::uint64_t pawns) {
    return ((pawns & ~FILE_A) >> 9) | ((pawns & ~FILE_H) >> 7);
}

extern "C" std::uint64_t marlin_rook_attacks(std::uint64_t occupied, int square) {
    constexpr int dirs[] = { 1, 0, -1, 0, 0, 1, 0, -1 };
    if (square < 0 || square >= 64) return 0;
    return sliding_attacks(occupied, square, dirs, 4);
}

extern "C" std::uint64_t marlin_bishop_attacks(std::uint64_t occupied, int square) {
    constexpr int dirs[] = { 1, 1, -1, 1, 1, -1, -1, -1 };
    if (square < 0 || square >= 64) return 0;
    return sliding_attacks(occupied, square, dirs, 4);
}
