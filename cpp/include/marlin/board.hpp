#pragma once
#include <array>
#include <cstdint>
#include <string>
#include <vector>

namespace marlin {
enum class Side : std::uint8_t { White, Black };
enum Piece : std::int8_t { Empty=0, Pawn=1, Knight=2, Bishop=3, Rook=4, Queen=5, King=6 };
struct Move {
    std::uint8_t from=0, to=0;
    std::int8_t promotion=0;
    bool en_passant=false, castle=false;
};
struct Undo {
    std::int8_t captured=0;
    std::uint8_t castling=0, ep=64;
    std::uint16_t halfmove=0, fullmove=1;
    std::uint8_t white_king=4, black_king=60;
};
class Board {
public:
    std::array<std::int8_t,64> squares{};
    Side side=Side::White;
    std::uint8_t castling=15, ep=64;
    std::uint16_t halfmove=0, fullmove=1;
    std::uint8_t white_king=4, black_king=60;
    static Board from_fen(const std::string& fen);
    std::string fen() const;
    bool attacked(int square, Side by) const noexcept;
    bool in_check(Side who) const noexcept;
    void make(const Move& move, Undo& undo);
    void unmake(const Move& move, const Undo& undo) noexcept;
    std::vector<Move> pseudo_moves() const;
    std::vector<Move> legal_moves();
};
std::uint64_t perft(Board& board, int depth);
}
