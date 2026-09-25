//! A glyph as the serializer sees it: an advance and contours of points, each
//! flagged on- or off-curve (quadratic Béziers, TrueType's native curve).

pub type Pt = (f64, f64, bool); // x, y, on_curve

pub struct Glyph {
    pub advance: f64,
    pub contours: Vec<Vec<Pt>>,
}

impl Glyph {
    pub fn new(advance: f64) -> Self {
        Glyph {
            advance,
            contours: Vec::new(),
        }
    }
}
