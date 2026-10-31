fn main() {
    let a: Vec<String> = std::env::args().collect();
    println!("{}", minofont::archetype_spec(a[1].parse().unwrap(), a[2].parse().unwrap(), &a[3]));
}
