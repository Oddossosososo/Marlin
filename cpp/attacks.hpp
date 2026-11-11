#pragma once
#include <cstdint>

// C ABI keeps the primitives callable from Rust and WebAssembly glue.
extern "C" {
std::uint64_t marlin_knight_attacks(std::uint64_t pieces);
std::uint64_t marlin_king_attacks(std::uint64_t pieces);
std::uint64_t marlin_white_pawn_attacks(std::uint64_t pawns);
std::uint64_t marlin_black_pawn_attacks(std::uint64_t pawns);
int marlin_cpp_list_moves(const char* fen, char* output, int output_size);
int marlin_cpp_perft_divide(const char* fen, char* output, int output_size);
std::uint64_t marlin_cpp_perft(const char* fen, int depth);
int marlin_cpp_search(const char* fen, int max_depth, char* output, int output_size);
}
