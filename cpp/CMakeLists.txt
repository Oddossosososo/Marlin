cmake_minimum_required(VERSION 3.16)
project(marlin_cpp LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(marlin_core src/bitboard.cpp src/board.cpp src/search.cpp)
target_include_directories(marlin_core PUBLIC include)
target_compile_options(marlin_core PRIVATE -Wall -Wextra -Werror -pedantic)

add_executable(marlin-uci src/uci.cpp)
target_link_libraries(marlin-uci PRIVATE marlin_core)

add_executable(marlin-bitboard-tests tests/bitboard_tests.cpp)
target_link_libraries(marlin-bitboard-tests PRIVATE marlin_core)
add_executable(marlin-board-tests tests/board_tests.cpp)
target_link_libraries(marlin-board-tests PRIVATE marlin_core)
add_executable(marlin-search-tests tests/search_tests.cpp)
target_link_libraries(marlin-search-tests PRIVATE marlin_core)

enable_testing()
add_test(NAME bitboard COMMAND marlin-bitboard-tests)
add_test(NAME board-perft COMMAND marlin-board-tests)
add_test(NAME search COMMAND marlin-search-tests)
