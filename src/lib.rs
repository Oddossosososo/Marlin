//! Marlin's native Rust/C++ chess-engine core.

extern "C" {
    fn marlin_knight_attacks(knights: u64) -> u64;
}

/// Calculate the union of knight attacks for every occupied square in knights.
///
/// Bit numbering: a1 = bit 0, b1 = bit 1, ..., h8 = bit 63.
pub fn knight_attacks_setwise(knights: u64) -> u64 {
    // C++ accepts and returns plain u64 values and does not retain pointers
    // or access Rust memory.
    unsafe { marlin_knight_attacks(knights) }
}

#[cfg(test)]
mod tests {
    use super::knight_attacks_setwise;

    #[test]
    fn knight_on_e4_attacks_eight_squares() {
        let e4 = 1u64 << 28;
        let expected = (1u64 << 43)
            | (1u64 << 45)
            | (1u64 << 34)
            | (1u64 << 38)
            | (1u64 << 18)
            | (1u64 << 22)
            | (1u64 << 11)
            | (1u64 << 13);

        assert_eq!(knight_attacks_setwise(e4), expected);
    }

    #[test]
    fn knight_on_a1_does_not_wrap_around_board() {
        let a1 = 1u64;
        let expected = (1u64 << 10) | (1u64 << 17);
        assert_eq!(knight_attacks_setwise(a1), expected);
    }

    #[test]
    fn empty_bitboard_has_no_attacks() {
        assert_eq!(knight_attacks_setwise(0), 0);
    }
}
