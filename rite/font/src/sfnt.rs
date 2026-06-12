//! A focused, dependency-free TrueType (SFNT) serializer. It emits the ten
//! tables a browser/OS needs to treat the output as a real, installable font:
//! OS/2, cmap, glyf, head, hhea, hmtx, loca, maxp, name, post.
//!
//! It is intentionally hand-rolled (no `write-fonts`) so every byte is under
//! our control and the whole thing compiles correct-first-time; `tests/valid.rs`
//! round-trips the output through `ttf-parser` to prove validity.

use crate::geom::Glyph;
use crate::params::Params;

pub struct GlyphData {
    pub advance: i32,
    pub contours: Vec<Vec<(i32, i32, bool)>>,
}

pub struct Names {
    pub family: String,
    pub subfamily: String,
    pub full: String,
    pub ps: String,
    pub unique: String,
}

/// Round a float Glyph to integer font units.
pub fn to_data(g: Glyph) -> GlyphData {
    let contours = g
        .contours
        .iter()
        .map(|c| {
            c.iter()
                .map(|&(x, y, on)| (x.round() as i32, y.round() as i32, on))
                .collect()
        })
        .collect();
    GlyphData {
        advance: g.advance.round().max(0.0) as i32,
        contours,
    }
}

// ---- little-helpers for big-endian writing ------------------------------------

fn pu16(b: &mut Vec<u8>, v: u16) {
    b.extend_from_slice(&v.to_be_bytes());
}
fn pi16(b: &mut Vec<u8>, v: i16) {
    b.extend_from_slice(&v.to_be_bytes());
}
fn pu32(b: &mut Vec<u8>, v: u32) {
    b.extend_from_slice(&v.to_be_bytes());
}
fn pi64(b: &mut Vec<u8>, v: i64) {
    b.extend_from_slice(&v.to_be_bytes());
}
fn pad4(b: &mut Vec<u8>) {
    while b.len() % 4 != 0 {
        b.push(0);
    }
}

/// SFNT table checksum: sum of big-endian u32 words over the zero-padded table.
fn checksum(data: &[u8]) -> u32 {
    let mut sum: u32 = 0;
    let mut i = 0;
    while i < data.len() {
        let mut word = [0u8; 4];
        for j in 0..4 {
            if i + j < data.len() {
                word[j] = data[i + j];
            }
        }
        sum = sum.wrapping_add(u32::from_be_bytes(word));
        i += 4;
    }
    sum
}

struct Bbox {
    xmin: i32,
    ymin: i32,
    xmax: i32,
    ymax: i32,
}

/// One glyph's `glyf` record (empty vec for blank glyphs like space).
fn glyf_glyph(
    gd: &GlyphData,
    max_points: &mut usize,
    max_contours: &mut usize,
    gbox: &mut Bbox,
) -> (Vec<u8>, i32) {
    // returns (bytes, left_side_bearing)
    if gd.contours.is_empty() {
        return (Vec::new(), 0);
    }
    let mut points: Vec<(i32, i32, bool)> = Vec::new();
    let mut ends: Vec<u16> = Vec::new();
    let mut run = 0usize;
    for c in &gd.contours {
        run += c.len();
        ends.push((run - 1) as u16);
        for &pt in c {
            points.push(pt);
        }
    }
    if points.len() > *max_points {
        *max_points = points.len();
    }
    if gd.contours.len() > *max_contours {
        *max_contours = gd.contours.len();
    }

    let xmin = points.iter().map(|p| p.0).min().unwrap();
    let xmax = points.iter().map(|p| p.0).max().unwrap();
    let ymin = points.iter().map(|p| p.1).min().unwrap();
    let ymax = points.iter().map(|p| p.1).max().unwrap();
    gbox.xmin = gbox.xmin.min(xmin);
    gbox.ymin = gbox.ymin.min(ymin);
    gbox.xmax = gbox.xmax.max(xmax);
    gbox.ymax = gbox.ymax.max(ymax);

    let mut b = Vec::new();
    pi16(&mut b, gd.contours.len() as i16);
    pi16(&mut b, xmin as i16);
    pi16(&mut b, ymin as i16);
    pi16(&mut b, xmax as i16);
    pi16(&mut b, ymax as i16);
    for e in &ends {
        pu16(&mut b, *e);
    }
    pu16(&mut b, 0); // instructionLength

    // flags: ON_CURVE bit only; coordinates emitted as plain 2-byte signed deltas
    for &(_, _, on) in &points {
        b.push(if on { 0x01 } else { 0x00 });
    }
    let mut prev = 0i32;
    for &(x, _, _) in &points {
        pi16(&mut b, (x - prev) as i16);
        prev = x;
    }
    let mut prev = 0i32;
    for &(_, y, _) in &points {
        pi16(&mut b, (y - prev) as i16);
        prev = y;
    }
    (b, xmin)
}

fn cmap_table(chars: &[char]) -> Vec<u8> {
    // one segment per character (idRangeOffset 0) + the mandatory terminal seg.
    let mut map: Vec<(u16, u16)> = chars
        .iter()
        .enumerate()
        .map(|(i, &c)| (c as u16, (i + 1) as u16))
        .collect();
    map.sort_by_key(|x| x.0);

    let seg_count = map.len() + 1;
    let mut end = Vec::new();
    let mut start = Vec::new();
    let mut delta = Vec::new();
    for &(code, gid) in &map {
        end.push(code);
        start.push(code);
        delta.push((gid as i32 - code as i32) as i16);
    }
    end.push(0xFFFF);
    start.push(0xFFFF);
    delta.push(1);

    let mut pow = 1usize;
    let mut es = 0u16;
    while pow * 2 <= seg_count {
        pow *= 2;
        es += 1;
    }
    let search_range = (pow * 2) as u16;
    let range_shift = (seg_count * 2) as u16 - search_range;

    let mut sub = Vec::new();
    pu16(&mut sub, 4); // format
    let length = 16 + seg_count * 8;
    pu16(&mut sub, length as u16);
    pu16(&mut sub, 0); // language
    pu16(&mut sub, (seg_count * 2) as u16);
    pu16(&mut sub, search_range);
    pu16(&mut sub, es);
    pu16(&mut sub, range_shift);
    for v in &end {
        pu16(&mut sub, *v);
    }
    pu16(&mut sub, 0); // reservedPad
    for v in &start {
        pu16(&mut sub, *v);
    }
    for v in &delta {
        pi16(&mut sub, *v);
    }
    for _ in 0..seg_count {
        pu16(&mut sub, 0); // idRangeOffset
    }

    let mut b = Vec::new();
    pu16(&mut b, 0); // version
    pu16(&mut b, 1); // numTables
    pu16(&mut b, 3); // platformID (Windows)
    pu16(&mut b, 1); // encodingID (Unicode BMP)
    pu32(&mut b, 12); // offset to subtable
    b.extend_from_slice(&sub);
    b
}

fn name_table(n: &Names) -> Vec<u8> {
    let entries: [(u16, &str); 5] = [
        (1, &n.family),
        (2, &n.subfamily),
        (3, &n.unique),
        (4, &n.full),
        (6, &n.ps),
    ];
    let mut strings = Vec::new();
    let mut records: Vec<(u16, u16, u16, u16, u16, u16)> = Vec::new();
    for (id, s) in entries {
        let utf16: Vec<u8> = s.encode_utf16().flat_map(|u| u.to_be_bytes()).collect();
        let off = strings.len() as u16;
        let len = utf16.len() as u16;
        records.push((3, 1, 0x0409, id, len, off));
        strings.extend(utf16);
    }
    let count = records.len() as u16;
    let mut b = Vec::new();
    pu16(&mut b, 0); // format
    pu16(&mut b, count);
    pu16(&mut b, 6 + count * 12); // stringOffset
    for (pl, en, lg, id, len, off) in records {
        pu16(&mut b, pl);
        pu16(&mut b, en);
        pu16(&mut b, lg);
        pu16(&mut b, id);
        pu16(&mut b, len);
        pu16(&mut b, off);
    }
    b.extend(strings);
    b
}

fn os2_table(p: &Params, first: u16, last: u16) -> Vec<u8> {
    let mut b = Vec::new();
    pu16(&mut b, 4); // version
    pi16(&mut b, 520); // xAvgCharWidth (approx)
    pu16(&mut b, p.weight_class);
    pu16(&mut b, p.width_class);
    pu16(&mut b, 0); // fsType: installable, no embedding restriction
    pi16(&mut b, 650); // ySubscriptXSize
    pi16(&mut b, 700); // ySubscriptYSize
    pi16(&mut b, 0); // ySubscriptXOffset
    pi16(&mut b, 140); // ySubscriptYOffset
    pi16(&mut b, 650); // ySuperscriptXSize
    pi16(&mut b, 700); // ySuperscriptYSize
    pi16(&mut b, 0); // ySuperscriptXOffset
    pi16(&mut b, 480); // ySuperscriptYOffset
    pi16(&mut b, p.thin as i16); // yStrikeoutSize
    pi16(&mut b, (p.cap * 0.26) as i16); // yStrikeoutPosition
    pi16(&mut b, 0); // sFamilyClass
    b.extend_from_slice(&[0u8; 10]); // panose
    pu32(&mut b, 1); // ulUnicodeRange1 (bit 0: Basic Latin)
    pu32(&mut b, 0);
    pu32(&mut b, 0);
    pu32(&mut b, 0);
    b.extend_from_slice(b"MINO"); // achVendID
    let italic = p.slant_deg > 0.5;
    pu16(&mut b, if italic { 0x0001 } else { 0x0040 }); // fsSelection
    pu16(&mut b, first); // usFirstCharIndex
    pu16(&mut b, last); // usLastCharIndex
    pi16(&mut b, p.ascent as i16); // sTypoAscender
    pi16(&mut b, p.descent as i16); // sTypoDescender
    pi16(&mut b, 0); // sTypoLineGap
    pu16(&mut b, p.ascent as u16); // usWinAscent
    pu16(&mut b, (-p.descent) as u16); // usWinDescent
    pu32(&mut b, 1); // ulCodePageRange1 (bit 0: Latin 1)
    pu32(&mut b, 0);
    pi16(&mut b, p.xheight as i16); // sxHeight
    pi16(&mut b, p.cap as i16); // sCapHeight
    pu16(&mut b, 0); // usDefaultChar
    pu16(&mut b, 0x20); // usBreakChar
    pu16(&mut b, 0); // usMaxContext
    b
}

pub fn build_ttf(glyphs: &[GlyphData], names: &Names, p: &Params, chars: &[char]) -> Vec<u8> {
    let num_glyphs = glyphs.len();
    let mut gbox = Bbox {
        xmin: i32::MAX,
        ymin: i32::MAX,
        xmax: i32::MIN,
        ymax: i32::MIN,
    };
    let mut max_points = 0usize;
    let mut max_contours = 0usize;

    // glyf + loca (long format) + per-glyph advance/lsb for hmtx
    let mut glyf = Vec::new();
    let mut loca: Vec<u32> = vec![0];
    let mut metrics: Vec<(u16, i16)> = Vec::new();
    let mut advance_max = 0u16;
    let mut min_lsb = i16::MAX;
    let mut max_extent = i16::MIN;
    for gd in glyphs {
        let (bytes, lsb) = glyf_glyph(gd, &mut max_points, &mut max_contours, &mut gbox);
        glyf.extend_from_slice(&bytes);
        while glyf.len() % 2 != 0 {
            glyf.push(0);
        }
        loca.push(glyf.len() as u32);
        let adv = gd.advance.clamp(0, 65535) as u16;
        advance_max = advance_max.max(adv);
        metrics.push((adv, lsb as i16));
        if !gd.contours.is_empty() {
            min_lsb = min_lsb.min(lsb as i16);
            let xmax = gd.contours.iter().flatten().map(|p| p.0).max().unwrap();
            max_extent = max_extent.max(xmax as i16);
        }
    }
    if gbox.xmin == i32::MAX {
        gbox = Bbox {
            xmin: 0,
            ymin: 0,
            xmax: 0,
            ymax: 0,
        };
    }
    if min_lsb == i16::MAX {
        min_lsb = 0;
    }
    if max_extent == i16::MIN {
        max_extent = 0;
    }

    // loca bytes (long)
    let mut loca_b = Vec::new();
    for off in &loca {
        pu32(&mut loca_b, *off);
    }

    // head
    let mut head = Vec::new();
    pu16(&mut head, 1);
    pu16(&mut head, 0); // version 1.0
    pu32(&mut head, 0x0001_0000); // fontRevision
    pu32(&mut head, 0); // checkSumAdjustment (patched at the end)
    pu32(&mut head, 0x5F0F_3CF5); // magicNumber
    pu16(&mut head, 0x000B); // flags
    pu16(&mut head, p.upm as u16); // unitsPerEm
    pi64(&mut head, 0); // created
    pi64(&mut head, 0); // modified
    pi16(&mut head, gbox.xmin as i16);
    pi16(&mut head, gbox.ymin as i16);
    pi16(&mut head, gbox.xmax as i16);
    pi16(&mut head, gbox.ymax as i16);
    pu16(&mut head, if p.slant_deg > 0.5 { 0x0002 } else { 0 }); // macStyle
    pu16(&mut head, 8); // lowestRecPPEM
    pi16(&mut head, 2); // fontDirectionHint
    pi16(&mut head, 1); // indexToLocFormat: long
    pi16(&mut head, 0); // glyphDataFormat

    // hhea
    let mut hhea = Vec::new();
    pu16(&mut hhea, 1);
    pu16(&mut hhea, 0);
    pi16(&mut hhea, p.ascent as i16);
    pi16(&mut hhea, p.descent as i16);
    pi16(&mut hhea, 0); // lineGap
    pu16(&mut hhea, advance_max);
    pi16(&mut hhea, min_lsb);
    pi16(&mut hhea, 0); // minRightSideBearing (approx)
    pi16(&mut hhea, max_extent);
    pi16(&mut hhea, 1); // caretSlopeRise
    pi16(&mut hhea, 0); // caretSlopeRun
    pi16(&mut hhea, 0); // caretOffset
    pi16(&mut hhea, 0);
    pi16(&mut hhea, 0);
    pi16(&mut hhea, 0);
    pi16(&mut hhea, 0);
    pi16(&mut hhea, 0); // metricDataFormat
    pu16(&mut hhea, num_glyphs as u16); // numberOfHMetrics

    // maxp (v1.0)
    let mut maxp = Vec::new();
    pu32(&mut maxp, 0x0001_0000);
    pu16(&mut maxp, num_glyphs as u16);
    pu16(&mut maxp, max_points as u16);
    pu16(&mut maxp, max_contours as u16);
    pu16(&mut maxp, 0); // maxCompositePoints
    pu16(&mut maxp, 0); // maxCompositeContours
    pu16(&mut maxp, 2); // maxZones
    pu16(&mut maxp, 0); // maxTwilightPoints
    pu16(&mut maxp, 0); // maxStorage
    pu16(&mut maxp, 0); // maxFunctionDefs
    pu16(&mut maxp, 0); // maxInstructionDefs
    pu16(&mut maxp, 0); // maxStackElements
    pu16(&mut maxp, 0); // maxSizeOfInstructions
    pu16(&mut maxp, 0); // maxComponentElements
    pu16(&mut maxp, 0); // maxComponentDepth

    // hmtx
    let mut hmtx = Vec::new();
    for (adv, lsb) in &metrics {
        pu16(&mut hmtx, *adv);
        pi16(&mut hmtx, *lsb);
    }

    // post (v3.0: no glyph names)
    let mut post = Vec::new();
    pu32(&mut post, 0x0003_0000);
    pu32(&mut post, ((-p.slant_deg) * 65536.0) as i32 as u32); // italicAngle
    pi16(&mut post, -75); // underlinePosition
    pi16(&mut post, 50); // underlineThickness
    pu32(&mut post, 0); // isFixedPitch
    pu32(&mut post, 0);
    pu32(&mut post, 0);
    pu32(&mut post, 0);
    pu32(&mut post, 0);

    let cmap = cmap_table(chars);
    let name = name_table(names);
    let first_char = chars.iter().map(|&c| c as u16).min().unwrap_or(0x20);
    let last_char = chars.iter().map(|&c| c as u16).max().unwrap_or(0x5A);
    let os2 = os2_table(p, first_char, last_char);

    // Assemble. Tables must appear in the directory sorted by tag ascending.
    let mut tables: Vec<([u8; 4], Vec<u8>)> = vec![
        (*b"OS/2", os2),
        (*b"cmap", cmap),
        (*b"glyf", glyf),
        (*b"head", head),
        (*b"hhea", hhea),
        (*b"hmtx", hmtx),
        (*b"loca", loca_b),
        (*b"maxp", maxp),
        (*b"name", name),
        (*b"post", post),
    ];
    tables.sort_by(|a, b| a.0.cmp(&b.0));

    let n = tables.len();
    let mut pow = 1usize;
    let mut es = 0u16;
    while pow * 2 <= n {
        pow *= 2;
        es += 1;
    }
    let search_range = (pow * 16) as u16;
    let range_shift = (n * 16) as u16 - search_range;

    let mut header = Vec::new();
    pu32(&mut header, 0x0001_0000); // sfnt version (TrueType)
    pu16(&mut header, n as u16);
    pu16(&mut header, search_range);
    pu16(&mut header, es);
    pu16(&mut header, range_shift);

    let mut dir = Vec::new();
    let mut body = Vec::new();
    let mut offset = 12 + n * 16;
    let mut head_offset = 0usize;
    for (tag, data) in &tables {
        let cks = checksum(data);
        dir.extend_from_slice(tag);
        pu32(&mut dir, cks);
        pu32(&mut dir, offset as u32);
        pu32(&mut dir, data.len() as u32);
        if tag == b"head" {
            head_offset = offset;
        }
        body.extend_from_slice(data);
        pad4(&mut body);
        offset = 12 + n * 16 + body.len();
    }

    let mut out = Vec::new();
    out.extend(header);
    out.extend(dir);
    out.extend(body);

    // checkSumAdjustment = 0xB1B0AFBA - checksum(whole file)
    let file_cks = checksum(&out);
    let adj = 0xB1B0_AFBAu32.wrapping_sub(file_cks);
    out[head_offset + 8..head_offset + 12].copy_from_slice(&adj.to_be_bytes());

    out
}
