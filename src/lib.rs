//! MARLIN's native Rust/C++ chess-engine foundation.
//!
//! Bitboard numbering: a1 = bit 0, b1 = bit 1, ..., h8 = bit 63.

unsafe extern "C" {
    fn marlin_knight_attacks(knights: u64) -> u64;
    fn marlin_king_attacks(kings: u64) -> u64;
    fn marlin_white_pawn_attacks(pawns: u64) -> u64;
    fn marlin_black_pawn_attacks(pawns: u64) -> u64;
    fn marlin_rook_attacks(occupied: u64, square: i32) -> u64;
    fn marlin_bishop_attacks(occupied: u64, square: i32) -> u64;
}

pub fn knight_attacks_setwise(knights: u64) -> u64 {
    unsafe { marlin_knight_attacks(knights) }
}

pub fn king_attacks_setwise(kings: u64) -> u64 {
    unsafe { marlin_king_attacks(kings) }
}

pub fn white_pawn_attacks_setwise(pawns: u64) -> u64 {
    unsafe { marlin_white_pawn_attacks(pawns) }
}

pub fn black_pawn_attacks_setwise(pawns: u64) -> u64 {
    unsafe { marlin_black_pawn_attacks(pawns) }
}

pub fn rook_attacks(occupied: u64, square: u8) -> Option<u64> {
    (square < 64).then(|| unsafe { marlin_rook_attacks(occupied, square as i32) })
}

pub fn bishop_attacks(occupied: u64, square: u8) -> Option<u64> {
    (square < 64).then(|| unsafe { marlin_bishop_attacks(occupied, square as i32) })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn knight_on_e4_attacks_eight_squares() {
        let expected = (1u64 << 43) | (1u64 << 45) | (1u64 << 34) | (1u64 << 38)
            | (1u64 << 18) | (1u64 << 22) | (1u64 << 11) | (1u64 << 13);
        assert_eq!(knight_attacks_setwise(1u64 << 28), expected);
    }

    #[test]
    fn knight_on_a1_does_not_wrap() {
        assert_eq!(knight_attacks_setwise(1), (1u64 << 10) | (1u64 << 17));
    }

    #[test]
    fn king_on_a1_has_three_attacks() {
        assert_eq!(king_attacks_setwise(1), (1u64 << 1) | (1u64 << 8) | (1u64 << 9));
    }

    #[test]
    fn pawn_attacks_respect_board_edges() {
        assert_eq!(white_pawn_attacks_setwise(1), 1u64 << 9);
        assert_eq!(black_pawn_attacks_setwise(1u64 << 8), 1u64);
    }

    #[test]
    fn rook_rays_stop_at_first_blocker() {
        let blocker = 1u64 << 12; // e2
        let attacks = rook_attacks(blocker, 4).unwrap(); // e1
        assert_ne!(attacks & blocker, 0);
        assert_eq!(attacks & (1u64 << 20), 0); // e3 is behind blocker
        assert_eq!(attacks & (1u64 << 5), 1u64 << 5); // f1 remains reachable
    }

    #[test]
    fn bishop_rays_stop_at_first_blocker() {
        let blocker = 1u64 << 18; // c3
        let attacks = bishop_attacks(blocker, 9).unwrap(); // b2
        assert_ne!(attacks & blocker, 0);
        assert_eq!(attacks & (1u64 << 27), 0); // d4 is behind blocker
    }

    #[test]
    fn invalid_sliding_square_is_rejected() {
        assert_eq!(rook_attacks(0, 64), None);
        assert_eq!(bishop_attacks(0, 64), None);
    }

    #[test]
    fn empty_knight_bitboard_has_no_attacks() {
        assert_eq!(knight_attacks_setwise(0), 0);
    }
}
