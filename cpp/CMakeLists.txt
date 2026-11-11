cmake_minimum_required(VERSION 3.16)
project(marlin_cpp LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(marlin_attacks STATIC attacks.cpp)
target_include_directories(marlin_attacks PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

add_executable(marlin_cpp_tests tests.cpp)
target_link_libraries(marlin_cpp_tests PRIVATE marlin_attacks)

enable_testing()
add_test(NAME marlin_cpp_tests COMMAND marlin_cpp_tests)
