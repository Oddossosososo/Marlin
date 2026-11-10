#include <cstdint>

// Bitboards use a1 = bit 0, b1 = bit 1, ..., h8 = bit 63.
extern "C" std::uint64_t marlin_knight_attacks(std::uint64_t knights) {
    constexpr std::uint64_t FILE_A = 0x0101010101010101ULL;
    constexpr std::uint64_t FILE_B = 0x0202020202020202ULL;
    constexpr std::uint64_t FILE_G = 0x4040404040404040ULL;
    constexpr std::uint64_t FILE_H = 0x8080808080808080ULL;

    const std::uint64_t not_a = knights & ~FILE_A;
    const std::uint64_t not_ab = knights & ~(FILE_A | FILE_B);
    const std::uint64_t not_h = knights & ~FILE_H;
    const std::uint64_t not_gh = knights & ~(FILE_G | FILE_H);

    return (not_a << 15)
         | (not_a >> 17)
         | (not_ab << 6)
         | (not_ab >> 10)
         | (not_h << 17)
         | (not_h >> 15)
         | (not_gh << 10)
         | (not_gh >> 6);
}
