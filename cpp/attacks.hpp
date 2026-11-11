#pragma once
#include <cstdint>

// C ABI keeps the primitives callable from Rust and WebAssembly glue.
extern "C" {
std::uint64_t marlin_knight_attacks(std::uint64_t pieces);
std::uint64_t marlin_king_attacks(std::uint64_t pieces);
std::uint64_t marlin_white_pawn_attacks(std::uint64_t pawns);
std::uint64_t marlin_black_pawn_attacks(std::uint64_t pawns);
}
