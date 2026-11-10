fn main() {
    cc::Build::new()
        .cpp(true)
        .file("cpp/attacks.cpp")
        .flag_if_supported("-std=c++17")
        .warnings(true)
        .compile("marlin_native");

    println!("cargo:rerun-if-changed=cpp/attacks.cpp");
}
