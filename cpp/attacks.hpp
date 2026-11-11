#pragma once
#include <cstdint>

// C ABI keeps the primitives callable from Rust and WebAssembly glue.
extern "C" {
std::uint64_t marlin_knight_attacks(std::uint64_t pieces);
std::uint64_t marlin_king_attacks(std::uint64_t pieces);
std::uint64_t marlin_white_pawn_attacks(std::uint64_t pawns);
std::uint64_t marlin_black_pawn_attacks(std::uint64_t pawns);
std::uint64_t marlin_cpp_perft(const char* fen, int depth);
int marlin_cpp_search(const char* fen, int max_depth, char* output, int output_size);
int marlin_cpp_set_nnue_weights(const float* fc1_w,const float* fc1_b,const float* fc2_w,const float* fc2_b,const float* out_w,const float* out_b);
int marlin_cpp_nnue_enabled();
int marlin_cpp_evaluate_fen(const char* fen);
}
